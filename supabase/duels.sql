-- Run once in Supabase → SQL Editor, after supabase/studied_clips.sql.
-- An asynchronous listening duel: both classmates get the same 15 clips.
-- The server records when a clip is served and when the correct answer
-- arrives. Learners never send a time or an XP number.
-- Leaving a clip stores it as forfeited (no time). A finished duel pays
-- 50 / 35 / 20 XP, which the leaderboard adds to overall XP.

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id text not null,
  opponent_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  challenger_points smallint,
  opponent_points smallint,
  constraint duels_distinct_players check (challenger_id <> opponent_id),
  constraint duels_points_chk check (
    (completed_at is null and challenger_points is null and opponent_points is null)
    or (
      completed_at is not null
      and challenger_points is not null
      and opponent_points is not null
      and challenger_points between 0 and 15
      and opponent_points between 0 and 15
    )
  )
);

create table if not exists public.duel_clips (
  duel_id uuid not null references public.duels (id) on delete cascade,
  position smallint not null check (position between 0 and 14),
  lesson_key text not null,
  clip_id text not null,
  primary key (duel_id, position),
  constraint duel_clips_unique_clip unique (duel_id, lesson_key, clip_id)
);

create table if not exists public.duel_plays (
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id text not null,
  position smallint not null check (position between 0 and 14),
  state text not null check (state in ('active', 'done', 'forfeited')),
  page_session text,
  started_at timestamptz,
  finished_at timestamptz,
  elapsed_ms int,
  primary key (duel_id, user_id, position),
  constraint duel_plays_time_chk check (
    (
      state = 'active'
      and started_at is not null
      and finished_at is null
      and elapsed_ms is null
      and page_session is not null
    )
    or (
      state = 'forfeited'
      and finished_at is not null
      and elapsed_ms is null
    )
    or (
      state = 'done'
      and started_at is not null
      and finished_at is not null
      and elapsed_ms >= 2000
    )
  )
);

create table if not exists public.duel_xp_awards (
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id text not null,
  xp int not null,
  outcome text not null check (outcome in ('win', 'loss', 'tie')),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now(),
  primary key (duel_id, user_id),
  constraint duel_xp_awards_amount_chk check (
    (outcome = 'win' and xp = 50)
    or (outcome = 'loss' and xp = 20)
    or (outcome = 'tie' and xp = 35)
  )
);

create index if not exists duels_challenger_idx
  on public.duels (challenger_id, created_at desc);

create index if not exists duels_opponent_idx
  on public.duels (opponent_id, created_at desc);

create index if not exists duels_open_pair_idx
  on public.duels (challenger_id, opponent_id)
  where completed_at is null;

create index if not exists duel_xp_awards_week_user_idx
  on public.duel_xp_awards (week_key, user_id);

create index if not exists duel_xp_awards_user_idx
  on public.duel_xp_awards (user_id, created_at desc);

alter table public.duels enable row level security;
alter table public.duel_clips enable row level security;
alter table public.duel_plays enable row level security;
alter table public.duel_xp_awards enable row level security;

revoke all on table public.duels from anon, authenticated;
revoke all on table public.duel_clips from anon, authenticated;
revoke all on table public.duel_plays from anon, authenticated;
revoke all on table public.duel_xp_awards from anon, authenticated;

grant select, insert, update, delete on table public.duels to service_role;
grant select, insert, update, delete on table public.duel_clips to service_role;
grant select, insert, update, delete on table public.duel_plays to service_role;
grant select, insert, update, delete on table public.duel_xp_awards to service_role;
