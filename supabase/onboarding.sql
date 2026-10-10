-- Run once in Supabase → SQL Editor, after user_progress.sql, xp_awards.sql,
-- study_xp_awards.sql, duels.sql, lesson_jump_awards.sql and quest_claims.sql.
-- Adds the onboarding stamp and marks everyone who already earned XP as
-- onboarded, so only learners with 0 XP see the first-run map tour.
-- Safe to re-run: stamped learners and learners an admin reset are left
-- alone. The app also stamps a learner with XP the next time it finds them
-- unstamped, unless an admin reset them.
-- duel_onboarding_completed_at is the how-to before a learner's first duel.
-- The app stamps it when the how-to ends, or when it finds a learner who
-- already played a duel.

alter table public.user_progress
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_reset_at timestamptz,
  add column if not exists duel_onboarding_completed_at timestamptz;

with totals as (
  select user_id, sum(xp) as xp
  from (
    select user_id, xp from public.xp_awards
    union all
    select user_id, xp from public.study_xp_awards
    union all
    select user_id, xp from public.duel_xp_awards
    union all
    select user_id, xp from public.lesson_jump_awards
    union all
    select user_id, xp from public.quest_claims
  ) awards
  group by user_id
)
update public.user_progress progress
set onboarding_completed_at = now()
from totals
where totals.user_id = progress.user_id
  and totals.xp > 0
  and progress.onboarding_completed_at is null
  and progress.onboarding_reset_at is null;
