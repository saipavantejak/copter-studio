-- Apply once through the project's migration runner. No anonymous/public access.
begin;
create table public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
  created_at timestamptz not null default now()
);
create index benchmark_runs_owner_created on public.benchmark_runs(user_id,created_at desc);
alter table public.benchmark_runs enable row level security;
revoke all on public.benchmark_runs from anon,authenticated;
grant select,insert,update,delete on public.benchmark_runs to authenticated;
create policy own_benchmarks on public.benchmark_runs for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table public.aircraft_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  config jsonb not null check (jsonb_typeof(config)='object' and octet_length(config::text)<=100000),
  created_at timestamptz not null default now()
);
create index aircraft_configurations_owner_created on public.aircraft_configurations(user_id,created_at desc);
alter table public.aircraft_configurations enable row level security;
revoke all on public.aircraft_configurations from anon,authenticated;
grant select,insert,update,delete on public.aircraft_configurations to authenticated;
create policy own_configurations on public.aircraft_configurations for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
commit;
