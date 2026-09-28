-- Run once in Supabase → SQL Editor, after supabase/studied_clips.sql.
-- An asynchronous listening duel: both classmates get the same 15 clips.
-- The browser measures each clip. The server checks the typed answer
-- and stores the first result. Any non-negative time is kept.
-- Leaving a clip stores it as forfeited (no time). A finished duel pays
-- 50 / 35 / 20 XP, which the leaderboard adds to overall XP.
-- Once the challenger finishes, the challenged person has 3 days. If they
-- miss that deadline the duel is expired: the challenger gets 35 XP and
-- the challenged person gets 0.

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id text not null,
  opponent_id text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  challenger_points smallint,
  opponent_points smallint,
  expired boolean not null default false,
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
      and elapsed_ms >= 0
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
    (outcome = 'win' and xp in (50, 35))
    or (outcome = 'loss' and xp in (20, 0))
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

-- Existing databases still reject times under 2 seconds until this runs.
alter table public.duel_plays drop constraint if exists duel_plays_time_chk;
alter table public.duel_plays add constraint duel_plays_time_chk check (
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
    and elapsed_ms >= 0
  )
);

-- Existing databases: 3-day deadline. A missed deadline pays 35 XP to the
-- challenger (stored as a win) and 0 XP to the challenged person (a loss).
alter table public.duels add column if not exists expired boolean not null default false;

alter table public.duel_xp_awards drop constraint if exists duel_xp_awards_amount_chk;
alter table public.duel_xp_awards add constraint duel_xp_awards_amount_chk check (
  (outcome = 'win' and xp in (50, 35))
  or (outcome = 'loss' and xp in (20, 0))
  or (outcome = 'tie' and xp = 35)
);
