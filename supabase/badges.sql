-- Run once in Supabase → SQL Editor (free project is fine).
-- Badges learners collect. The catalog lives in code (src/lib/badges.ts).
-- The Next.js API writes these with the service role key after it counts the
-- learner's own rows. Learners never claim a badge or send a stat.

-- One row per badge a learner earned. The primary key means a badge is
-- awarded once. seen_at stays null until the learner has seen the unlock.
create table if not exists public.badge_awards (
  user_id text not null,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, badge_id)
);

create index if not exists badge_awards_unseen_idx
  on public.badge_awards (user_id)
  where seen_at is null;

alter table public.badge_awards enable row level security;

revoke all on table public.badge_awards from anon, authenticated;
grant select, insert, update, delete on table public.badge_awards to service_role;

-- The top three of every class on the XP board when a Vietnam week ended.
-- The leaderboard only ranks the current week, so finished weeks are kept
-- here for the "Bục vinh quang" and "Quán quân tuần" badges. Written once per
-- week, the first time any learner's badges are checked after it ends.
create table if not exists public.weekly_podiums (
  week_key text not null,
  user_id text not null,
  class_key text not null,
  rank smallint not null check (rank between 1 and 3),
  xp int not null check (xp >= 0),
  created_at timestamptz not null default now(),
  primary key (week_key, user_id)
);

create index if not exists weekly_podiums_user_idx
  on public.weekly_podiums (user_id);

-- Weeks already ranked, so a week where nobody earned XP is not ranked again.
create table if not exists public.weekly_podium_weeks (
  week_key text primary key,
  ranked_at timestamptz not null default now()
);

alter table public.weekly_podiums enable row level security;
alter table public.weekly_podium_weeks enable row level security;

revoke all on table public.weekly_podiums from anon, authenticated;
revoke all on table public.weekly_podium_weeks from anon, authenticated;
grant select, insert, update, delete on table public.weekly_podiums to service_role;
grant select, insert, update, delete on table public.weekly_podium_weeks to service_role;
