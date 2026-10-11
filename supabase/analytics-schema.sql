-- Apply only after owner review; this file is not an applied migration.
create table if not exists public.aggregate_events (
 day date not null,
 event text not null check(event in ('workspace_open','simulation_start','feedback_open')),
 count bigint not null check(count > 0),
 primary key(day,event)
);
alter table public.aggregate_events enable row level security;
revoke all on public.aggregate_events from public, anon, authenticated;
grant select,insert,update,delete on public.aggregate_events to service_role;
create or replace function public.increment_aggregate_event(p_event text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_event is null or p_event not in ('workspace_open','simulation_start','feedback_open') then
  raise exception 'invalid aggregate event';
 end if;
 insert into public.aggregate_events(day,event,count)
 values((current_timestamp at time zone 'UTC')::date,p_event,1)
 on conflict(day,event) do update set count=public.aggregate_events.count+1;
 delete from public.aggregate_events where day < (current_timestamp at time zone 'UTC')::date - 90;
end; $$;
revoke all on function public.increment_aggregate_event(text) from public,anon,authenticated;
grant execute on function public.increment_aggregate_event(text) to service_role;
