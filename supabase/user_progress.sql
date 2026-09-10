-- Run once in Supabase → SQL Editor (free project is fine).
-- Progress is written by the Next.js API using the service role key
-- (Auth.js Google user ids are not Supabase Auth users).

create table if not exists public.user_progress (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
