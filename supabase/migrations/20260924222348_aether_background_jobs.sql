create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists aether_private;
revoke all on schema aether_private from public,anon,authenticated;
grant usage on schema aether_private to service_role;
create table public.aether_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 checkpoint jsonb not null check(octet_length(checkpoint::text)<1500000),
 revision integer not null default 0,
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 error text,
 promoted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,request_id)
);
alter table public.aether_jobs enable row level security;
revoke all on public.aether_jobs from public,anon,authenticated;
grant select(id,user_id,request_id,status,checkpoint,revision,attempts,error,promoted_at,created_at,updated_at) on public.aether_jobs to authenticated;
grant all on public.aether_jobs to service_role;
create policy owner_read on public.aether_jobs for select to authenticated using ((select auth.uid())=user_id);
create index aether_jobs_owner_created on public.aether_jobs(user_id,created_at desc);
create index aether_jobs_pending on public.aether_jobs(status,lease_until) where status in ('queued','running');
create table aether_private.dispatch (job_id uuid primary key references public.aether_jobs(id) on delete cascade, token uuid not null default gen_random_uuid());
alter table aether_private.dispatch enable row level security;
grant all on aether_private.dispatch to service_role;

create function public.aether_submit(p_owner uuid,p_request uuid,p_checkpoint jsonb) returns uuid language plpgsql set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(745821);
 select id into v_id from public.aether_jobs where user_id=p_owner and request_id=p_request;
 if v_id is not null then return v_id; end if;
 if (select count(*) from public.aether_jobs where user_id=p_owner and created_at>now()-interval '1 day')>=2 or (select count(*) from public.aether_jobs where created_at>now()-interval '1 day')>=20 then raise exception 'Daily compute budget reached';end if;
 if exists(select 1 from public.aether_jobs where user_id=p_owner and status in ('queued','running')) then raise exception 'One active cloud job per account';end if;
 insert into public.aether_jobs(user_id,request_id,checkpoint) values(p_owner,p_request,p_checkpoint) returning id into v_id;
 insert into aether_private.dispatch(job_id) values(v_id);
 return v_id;
end $$;
create function public.aether_claim(p_id uuid,p_token uuid) returns jsonb language plpgsql set search_path='' as $$
declare j public.aether_jobs;
begin
 if not exists(select 1 from aether_private.dispatch where job_id=p_id and token=p_token) then return null;end if;
 update public.aether_jobs set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now()
 where id=p_id and status in ('queued','running') and (lease_until is null or lease_until<now()) and attempts<3 returning * into j;
 return to_jsonb(j);
end $$;
create function public.aether_commit(p_id uuid,p_lease uuid,p_checkpoint jsonb,p_done boolean,p_error text default null) returns boolean language plpgsql set search_path='' as $$
begin
 update public.aether_jobs set checkpoint=case when p_error is null then p_checkpoint else checkpoint end,status=case when p_error is not null then 'failed' when p_done then 'completed' else 'queued' end,revision=revision+1,attempts=0,lease_id=null,lease_until=null,error=left(p_error,500),updated_at=now() where id=p_id and lease_id=p_lease and status='running';
 return found;
end $$;
revoke all on function public.aether_submit(uuid,uuid,jsonb),public.aether_claim(uuid,uuid),public.aether_commit(uuid,uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.aether_submit(uuid,uuid,jsonb),public.aether_claim(uuid,uuid),public.aether_commit(uuid,uuid,jsonb,boolean,text) to service_role;

-- Internal dispatcher: callable only by database administrator/cron. Tokens never
-- enter client-visible rows; the Edge worker authenticates each claim token.
create function aether_private.pump() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
 update public.aether_jobs set status='failed',error='Retry budget or 24-hour job deadline exceeded',lease_id=null,lease_until=null,updated_at=now() where status in ('queued','running') and ((attempts>=3 and lease_until<now()) or created_at<now()-interval '1 day');
 for j in select a.id,d.token from public.aether_jobs a join aether_private.dispatch d on d.job_id=a.id where a.status in ('queued','running') and (a.lease_until is null or a.lease_until<now()) order by a.created_at limit 2 loop
  perform net.http_post(url:='https://othnlwcfflvtjgttotcf.supabase.co/functions/v1/aether-jobs',body:=jsonb_build_object('action','tick','id',j.id,'token',j.token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000);
 end loop;
end $$;
revoke all on function aether_private.pump() from public,anon,authenticated,service_role;
