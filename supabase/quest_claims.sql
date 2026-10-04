-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per daily quest a learner finished, plus one "bonus" row when all
-- three quests of the day are done. Which quests a learner gets is computed
-- in code from the learner and the Vietnam day, so only claims are stored.
-- The Next.js API writes these with the service role key after it counts the
-- learner's own listening, study and duel rows for the day. Learners never
-- send an XP number. The primary key means a quest pays once per day.

create table if not exists public.quest_claims (
  user_id text not null,
  day_key text not null,
  quest_id text not null,
  xp int not null check (xp >= 0),
  week_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day_key, quest_id)
);

create index if not exists quest_claims_week_user_idx
  on public.quest_claims (week_key, user_id);

alter table public.quest_claims enable row level security;

revoke all on table public.quest_claims from anon, authenticated;
grant select, insert, update, delete on table public.quest_claims to service_role;
