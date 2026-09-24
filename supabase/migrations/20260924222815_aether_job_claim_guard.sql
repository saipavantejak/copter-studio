create or replace function public.aether_claim(p_id uuid,p_token uuid) returns jsonb language plpgsql set search_path='' as $$
declare j public.aether_jobs;
begin
 if not exists(select 1 from aether_private.dispatch where job_id=p_id and token=p_token) then return null;end if;
 update public.aether_jobs set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now()
 where id=p_id and status in ('queued','running') and (lease_until is null or lease_until<now()) and attempts<3 returning * into j;
 if not found then return null;end if;
 return to_jsonb(j);
end $$;
revoke all on function public.aether_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aether_claim(uuid,uuid) to service_role;
