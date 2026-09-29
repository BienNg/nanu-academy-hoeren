-- Run once in Supabase → SQL Editor (free project is fine).
-- Blitzrunde: a live, class-wide quiz at the end of a lesson. A teacher
-- (owner or staff) opens a round for one class and one Lektion; students of
-- that class join, then everyone races the same shuffled deck for 7 minutes.
-- Each browser scores itself and sends one result bundle at the end. The
-- Next.js API writes everything with the service role key. Blitzrunde points
-- are their own board and never count toward XP.

-- One row per round. `deck` is the full card list, built once from `seed`
-- when the round is created, so every student gets byte-identical cards.
create table if not exists public.blitzrunde_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  class_key text not null,
  class_label text not null,
  level_slug text not null,
  chapter_slug text not null,
  seed text not null,
  deck jsonb not null,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'ended', 'cancelled')),
  ranked boolean not null default false,
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('time_up', 'teacher_ended')),
  constraint blitzrunde_sessions_timing_chk check (
    (status in ('lobby', 'cancelled') and starts_at is null and ends_at is null)
    or (status in ('active', 'ended') and starts_at is not null and ends_at is not null)
  )
);

-- At most one open (lobby or running) round per class. A second teacher
-- click gets a clean conflict instead of two parallel lobbies.
create unique index if not exists blitzrunde_sessions_one_live_per_class
  on public.blitzrunde_sessions (class_key)
  where status in ('lobby', 'active');

create index if not exists blitzrunde_sessions_class_idx
  on public.blitzrunde_sessions (class_key, created_at desc);

create index if not exists blitzrunde_sessions_created_idx
  on public.blitzrunde_sessions (created_at desc);

-- One row per student who joined. `last_seen_*` is the heartbeat (stats
-- only, never scoring). The summary columns stay null until the student's
-- browser sends its result; a joined student without a result either never
-- played or dropped out. "Disconnected" is worked out when reading, from
-- `last_seen_at`, so no background job is needed.
create table if not exists public.blitzrunde_participants (
  session_id uuid not null references public.blitzrunde_sessions (id) on delete cascade,
  user_id text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_seen_index smallint,
  final_score int check (final_score >= 0),
  answered smallint check (answered >= 0),
  correct smallint check (correct >= 0),
  completed_deck boolean not null default false,
  avg_ms int check (avg_ms >= 0),
  longest_streak smallint check (longest_streak >= 0),
  finish_reason text check (finish_reason in ('deck_done', 'time_up', 'teacher_ended')),
  submitted_at timestamptz,
  week_key text,
  day_key text,
  primary key (session_id, user_id)
);

create index if not exists blitzrunde_participants_user_idx
  on public.blitzrunde_participants (user_id);

create index if not exists blitzrunde_participants_week_user_idx
  on public.blitzrunde_participants (week_key, user_id);

-- Every answer a student gave, in deck order. `answer` is what they picked
-- (word order, option id, or number of wrong pairs), kept for the admin
-- drill-down.
create table if not exists public.blitzrunde_answers (
  session_id uuid not null references public.blitzrunde_sessions (id) on delete cascade,
  user_id text not null,
  position smallint not null check (position >= 0),
  kind text not null check (kind in ('order', 'multiple-choice', 'pairing')),
  accuracy smallint not null check (accuracy between 0 and 100),
  time_ms int not null check (time_ms >= 0),
  points int not null check (points >= 0),
  streak smallint not null default 0 check (streak >= 0),
  answer jsonb,
  primary key (session_id, user_id, position)
);

alter table public.blitzrunde_sessions enable row level security;
alter table public.blitzrunde_participants enable row level security;
alter table public.blitzrunde_answers enable row level security;

revoke all on table public.blitzrunde_sessions from anon, authenticated;
revoke all on table public.blitzrunde_participants from anon, authenticated;
revoke all on table public.blitzrunde_answers from anon, authenticated;

grant select, insert, update, delete on table public.blitzrunde_sessions to service_role;
grant select, insert, update, delete on table public.blitzrunde_participants to service_role;
grant select, insert, update, delete on table public.blitzrunde_answers to service_role;
