-- Run once in Supabase → SQL Editor, after xp_awards.sql, study_xp_awards.sql,
-- duels.sql, lesson_jump_awards.sql and quest_claims.sql.
-- XP sums done in Postgres, so the API reads a few rows instead of every
-- award ever given. The app falls back to summing rows itself until these
-- functions exist.

-- One learner's XP today, this week and all time, across every award table.
-- Day and week keys are passed in so they match the app's Vietnam keys.
create or replace function public.user_xp_totals(
  p_user_id text,
  p_day_key text,
  p_week_key text
)
returns table (
  today bigint,
  week bigint,
  total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with awards as (
    select xp, day_key, week_key from public.xp_awards where user_id = p_user_id
    union all
    select xp, day_key, week_key from public.study_xp_awards where user_id = p_user_id
    union all
    select xp, day_key, week_key from public.duel_xp_awards where user_id = p_user_id
    union all
    select xp, day_key, week_key from public.lesson_jump_awards where user_id = p_user_id
    union all
    select xp, day_key, week_key from public.quest_claims where user_id = p_user_id
  )
  select
    coalesce(sum(xp) filter (where day_key = p_day_key), 0)::bigint as today,
    coalesce(sum(xp) filter (where week_key = p_week_key), 0)::bigint as week,
    coalesce(sum(xp), 0)::bigint as total
  from awards;
$$;

revoke all on function public.user_xp_totals(text, text, text) from public;
revoke all on function public.user_xp_totals(text, text, text) from anon, authenticated;
grant execute on function public.user_xp_totals(text, text, text) to service_role;

-- XP board totals per learner: listening, study, jump and quest XP.
-- Duel XP stays in duel_xp_leaderboard_totals, which also counts results.
-- Pass null for all time, or a week_key.
create or replace function public.xp_board_totals(p_week_key text default null)
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
  from (
    select user_id, xp, created_at, week_key from public.xp_awards
    union all
    select user_id, xp, created_at, week_key from public.study_xp_awards
    union all
    select user_id, xp, created_at, week_key from public.lesson_jump_awards
    union all
    select user_id, xp, created_at, week_key from public.quest_claims
  ) awards
  where xp > 0
    and (p_week_key is null or week_key = p_week_key)
  group by user_id;
$$;

revoke all on function public.xp_board_totals(text) from public;
revoke all on function public.xp_board_totals(text) from anon, authenticated;
grant execute on function public.xp_board_totals(text) to service_role;
