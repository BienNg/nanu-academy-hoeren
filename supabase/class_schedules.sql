-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per class (keyed like user_progress.class_name, lower-cased) for the
-- admin Classes page: where the class meets, on which weekdays (ISO, 1 = Monday),
-- which level began on which date, and the days without class.
-- No anon/authenticated policies: only the service role (server) can read/write.

create table if not exists public.class_schedules (
  class_key text primary key,
  class_name text not null,
  format text,
  weekdays smallint[] not null default '{}',
  levels jsonb not null default '[]'::jsonb,
  skipped_dates date[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint class_schedules_format_check check (
    format is null
    or format in ('online_de', 'online_vn', 'offline_saigon', 'offline_hanoi')
  )
);

alter table public.class_schedules enable row level security;

-- Session time, for session ratings (docs/SESSION_RATINGS.md). Local time in
-- the class's time zone. Without a start time a session ends at 23:59; without
-- a length it lasts 90 minutes. Safe to re-run.
alter table public.class_schedules
  add column if not exists session_start time,
  add column if not exists session_minutes smallint;

alter table public.class_schedules
  drop constraint if exists class_schedules_session_minutes_check;

alter table public.class_schedules
  add constraint class_schedules_session_minutes_check check (
    session_minutes is null or session_minutes between 15 and 480
  );
