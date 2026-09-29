-- Run once in Supabase → SQL Editor (free project is fine).
-- Courses granted to an email before that person has signed in with Google.
-- On their first sign-in, the app copies level_access onto user_progress and
-- deletes this row. Same slugs as user_progress.level_access, including
-- the reserved "interview" slug.

create table if not exists public.pending_level_access (
  email text primary key,
  level_access text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pending_level_access enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
