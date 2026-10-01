-- Run once in Supabase → SQL Editor (free project is fine).
-- Overview totals, summed in Postgres so the admin dashboard reads one row
-- per learner instead of every award and listening run in the range.
-- Until this is applied, the app adds those rows up itself.

create or replace function public.admin_xp_by_user(p_from text, p_to text)
returns table (user_id text, xp bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select awards.user_id, sum(awards.xp)::bigint
  from (
    select user_id, xp
    from public.xp_awards
    where day_key >= p_from and day_key <= p_to
    union all
    select user_id, xp
    from public.duel_xp_awards
    where day_key >= p_from and day_key <= p_to
  ) as awards
  group by awards.user_id;
$$;

create or replace function public.admin_study_part_counts(p_from text, p_to text)
returns table (user_id text, parts bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select user_id, count(*)::bigint
  from public.study_xp_awards
  where day_key >= p_from and day_key <= p_to
  group by user_id;
$$;

create or replace function public.admin_practice_part_counts(
  p_from timestamptz,
  p_to timestamptz
)
returns table (user_id text, parts bigint, passed bigint, runs bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    user_id,
    count(*)::bigint,
    count(*) filter (where outcome = 'success')::bigint,
    count(*) filter (
      where outcome = 'success' and part_number = part_count
    )::bigint
  from public.listening_runs
  where created_at >= p_from and created_at < p_to
  group by user_id;
$$;

revoke all on function public.admin_xp_by_user(text, text) from public, anon, authenticated;
revoke all on function public.admin_study_part_counts(text, text) from public, anon, authenticated;
revoke all on function public.admin_practice_part_counts(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_xp_by_user(text, text) to service_role;
grant execute on function public.admin_study_part_counts(text, text) to service_role;
grant execute on function public.admin_practice_part_counts(timestamptz, timestamptz) to service_role;
