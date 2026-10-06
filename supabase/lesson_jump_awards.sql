-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per Lektion a learner skipped with a passed jump test (35 XP).
-- The Next.js API writes these with the service role key after it deals the
-- same seeded deck and grades the answers. Learners never send an XP number.
-- The unique key pays each Lektion once per learner.

create table if not exists public.lesson_jump_awards (
  id uuid primary key,
  user_id text not null,
  lesson_key text not null,
  xp int not null check (xp >= 0),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists lesson_jump_awards_user_lesson_idx
  on public.lesson_jump_awards (user_id, lesson_key);

create index if not exists lesson_jump_awards_week_user_idx
  on public.lesson_jump_awards (week_key, user_id);

alter table public.lesson_jump_awards enable row level security;

revoke all on table public.lesson_jump_awards from anon, authenticated;
grant select, insert, update, delete on table public.lesson_jump_awards to service_role;
