-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per finished study part. The first pass of a lesson awards 20 XP
-- per part. Every later pass awards 10.
-- The Next.js API writes these with the service role key after it checks
-- that the part matches the lesson and was not instant. Learners never
-- send an XP number. A repeated submit of the same id does not pay twice.

create table if not exists public.study_xp_awards (
  id uuid primary key,
  user_id text not null,
  lesson_key text not null,
  part_number int not null check (part_number >= 1),
  xp int not null check (xp >= 0),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists study_xp_awards_user_idx
  on public.study_xp_awards (user_id);

create index if not exists study_xp_awards_week_user_idx
  on public.study_xp_awards (week_key, user_id);

alter table public.study_xp_awards enable row level security;

revoke all on table public.study_xp_awards from anon, authenticated;
grant select, insert, update, delete on table public.study_xp_awards to service_role;
