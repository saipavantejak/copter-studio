create table public.aether_tasks (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index aether_tasks_owner_updated on public.aether_tasks(user_id,updated_at desc);
alter table public.aether_tasks enable row level security;
revoke all on public.aether_tasks from anon, authenticated;
grant select,insert,update,delete on public.aether_tasks to authenticated;
create policy aether_tasks_select on public.aether_tasks for select to authenticated using ((select auth.uid())=user_id);
create policy aether_tasks_insert on public.aether_tasks for insert to authenticated with check ((select auth.uid())=user_id);
create policy aether_tasks_update on public.aether_tasks for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy aether_tasks_delete on public.aether_tasks for delete to authenticated using ((select auth.uid())=user_id);
comment on table public.aether_tasks is 'Private browser-generated experiment evidence. Client records are not trusted execution commands or certified flight data.';
