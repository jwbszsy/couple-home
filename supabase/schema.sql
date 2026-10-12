-- Run in Supabase SQL Editor. Keep the service role key server-side only.
create table if not exists public.app_state (
  id text primary key check (id = 'production'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;