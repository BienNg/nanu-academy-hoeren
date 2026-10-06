-- Run once in Supabase → SQL Editor, after badges.sql.
-- The top three classes on the classes board when a Vietnam week ended. One
-- row per learner of those classes who earned XP that week, for the
-- "Lớp trên bục" and "Lớp vô địch" badges. Written once per week, the first
-- time any learner's badges are checked after it ends.
create table if not exists public.weekly_class_podiums (
  week_key text not null,
  user_id text not null,
  class_key text not null,
  rank smallint not null check (rank between 1 and 3),
  -- The class's week XP, not the learner's.
  class_xp int not null check (class_xp >= 0),
  created_at timestamptz not null default now(),
  primary key (week_key, user_id)
);

create index if not exists weekly_class_podiums_user_idx
  on public.weekly_class_podiums (user_id);

-- Weeks already ranked, so a week where no class earned XP is not ranked again.
create table if not exists public.weekly_class_podium_weeks (
  week_key text primary key,
  ranked_at timestamptz not null default now()
);

alter table public.weekly_class_podiums enable row level security;
alter table public.weekly_class_podium_weeks enable row level security;

revoke all on table public.weekly_class_podiums from anon, authenticated;
revoke all on table public.weekly_class_podium_weeks from anon, authenticated;
grant select, insert, update, delete on table public.weekly_class_podiums to service_role;
grant select, insert, update, delete on table public.weekly_class_podium_weeks to service_role;
