-- Run once in Supabase → SQL Editor (free project is fine).
-- Progress is written by the Next.js API using the service role key
-- (Auth.js Google user ids are not Supabase Auth users).

create table if not exists public.user_progress (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  email text,
  name text,
  last_login_at timestamptz,
  deleted_at timestamptz,
  revoked_before timestamptz
);

alter table public.user_progress
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists last_login_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists revoked_before timestamptz;

create index if not exists user_progress_email_idx
  on public.user_progress (email);

create index if not exists user_progress_last_login_at_idx
  on public.user_progress (last_login_at desc);

-- Deleted accounts keep a tombstone row: `deleted_at` hides them from the
-- admin list, and `revoked_before` permanently invalidates sessions issued
-- earlier, so a still-logged-in browser cannot re-sync its old progress.
create index if not exists user_progress_deleted_at_idx
  on public.user_progress (deleted_at);

alter table public.user_progress enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
