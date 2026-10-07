-- Re-run in Supabase → SQL Editor. This replaces the daily-total table:
-- one row per flush, at the moment the group of taps was logged.
-- `counts` is { "nav.learn": 2, "nav.quests": 1 }. Not one row per tap.
-- Writes go through the Next.js API with the service role key.

drop table if exists public.ui_clicks;

create table public.ui_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  logged_at timestamptz not null,
  counts jsonb not null
);

create index if not exists ui_clicks_user_logged_idx
  on public.ui_clicks (user_id, logged_at desc);

alter table public.ui_clicks enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.ui_clicks from anon, authenticated;
grant select, insert, update, delete on table public.ui_clicks to service_role;
