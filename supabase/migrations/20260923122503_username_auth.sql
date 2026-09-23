create table public.login_usernames (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,29}$')
);
alter table public.login_usernames enable row level security;
revoke all on public.login_usernames from anon, authenticated;
grant select, insert, update on public.login_usernames to authenticated;
grant all on public.login_usernames to service_role;
create policy username_owner_read on public.login_usernames for select to authenticated using ((select auth.uid())=user_id);
create policy username_owner_insert on public.login_usernames for insert to authenticated with check ((select auth.uid())=user_id and (select auth.jwt()->>'email') is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy username_owner_update on public.login_usernames for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table public.username_login_limits (
 bucket text primary key,
 started_at timestamptz not null,
 attempts integer not null
);
alter table public.username_login_limits enable row level security;
revoke all on public.username_login_limits from anon,authenticated;
grant all on public.username_login_limits to service_role;

-- Invoker function; only the server role may use the lookup or its rate counters.
create function public.resolve_login_username(candidate text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare found_id uuid; n integer; started timestamptz; current_time_value timestamptz := now();
begin
 insert into public.username_login_limits values ('global',current_time_value,1)
 on conflict (bucket) do update set
 attempts=case when username_login_limits.started_at < current_time_value-interval '1 minute' then 1 else username_login_limits.attempts+1 end,
 started_at=case when username_login_limits.started_at < current_time_value-interval '1 minute' then current_time_value else username_login_limits.started_at end
 returning attempts into n;
 if n>300 then return null; end if;
 select user_id into found_id from public.login_usernames where username=candidate;
 if found_id is null then return null; end if;
 insert into public.username_login_limits values (found_id::text,current_time_value,1)
 on conflict (bucket) do update set
 attempts=case when username_login_limits.started_at < current_time_value-interval '10 minutes' then 1 else username_login_limits.attempts+1 end,
 started_at=case when username_login_limits.started_at < current_time_value-interval '10 minutes' then current_time_value else username_login_limits.started_at end
 returning attempts into n;
 if n>10 then return null; end if;
 return found_id;
end $$;
revoke all on function public.resolve_login_username(text) from public,anon,authenticated;
grant execute on function public.resolve_login_username(text) to service_role;
