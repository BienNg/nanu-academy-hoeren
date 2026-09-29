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

-- Leaderboard totals, summed in Postgres so the API reads one row per learner
-- instead of every award ever given. Pass null for all time, or a week_key.
-- The app falls back to summing rows itself until this function exists.
create or replace function public.xp_leaderboard_totals(p_week_key text default null)
returns table (
  user_id text,
  xp bigint,
  reached_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_id,
    sum(xp)::bigint as xp,
    max(created_at) as reached_at
  from public.xp_awards
  where xp > 0
    and (p_week_key is null or week_key = p_week_key)
  group by user_id;
$$;

revoke all on function public.xp_leaderboard_totals(text) from public;
revoke all on function public.xp_leaderboard_totals(text) from anon, authenticated;
grant execute on function public.xp_leaderboard_totals(text) to service_role;
