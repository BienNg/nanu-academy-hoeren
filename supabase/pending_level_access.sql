-- Run once in Supabase → SQL Editor (free project is fine).
-- Re-run after this file changes: the alter below only adds missing columns.
-- Courses, a class, and a role granted to an email before that person has
-- signed in with Google. On their first sign-in, the app copies level_access,
-- class_name, and role onto user_progress and deletes this row. Same slugs as
-- user_progress.level_access, including the reserved "interview" slug.
-- role is "staff" or "teacher". Empty means a learner. A teacher uses
-- teacher_classes (one or more). class_name stays the single class for a
-- learner or staff pre-unlock.

create table if not exists public.pending_level_access (
  email text primary key,
  level_access text[] not null default '{}',
  class_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pending_level_access
  add column if not exists class_name text,
  add column if not exists role text,
  add column if not exists teacher_classes text[] not null default '{}';

alter table public.pending_level_access enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
