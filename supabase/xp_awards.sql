-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per listening part that earned ranked XP (first pass, or the
-- first review of that part on a later day). The Next.js API writes these
-- with the service role key after it scores the listening run.
-- A repeated pass the same day is not stored. Failed parts are not stored.
-- Learners never send an XP number.

create table if not exists public.xp_awards (
  run_id uuid primary key references public.listening_runs (id) on delete cascade,
  user_id text not null,
  lesson_key text not null,
  part_number int not null check (part_number >= 1),
  xp int not null check (xp >= 0),
  kind text not null check (kind in ('new', 'review')),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now(),
  constraint xp_awards_part_day unique (user_id, lesson_key, part_number, day_key)
);

create index if not exists xp_awards_week_user_idx
  on public.xp_awards (week_key, user_id);

create index if not exists xp_awards_user_day_idx
  on public.xp_awards (user_id, day_key);

alter table public.xp_awards enable row level security;

revoke all on table public.xp_awards from anon, authenticated;
grant select, insert, update, delete on table public.xp_awards to service_role;
