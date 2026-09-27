-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per finished listening part (passed or out of hearts), plus one
-- row per clip reached in that part. History starts when this is applied.
-- Nothing here is rebuilt from older progress snapshots.
--
-- Writes go through the Next.js API with the service role key.
-- A clip that is missed and later corrected is stored as both missed and passed.

create table if not exists public.listening_runs (
  id uuid primary key,
  user_id text not null,
  lesson_key text not null,
  part_number int not null check (part_number >= 1),
  part_count int not null check (part_count >= part_number),
  outcome text not null check (outcome in ('success', 'fail')),
  accuracy int not null check (accuracy between 0 and 100),
  answered_count int not null check (answered_count >= 1),
  clip_count int not null check (clip_count >= answered_count),
  elapsed_ms int not null check (elapsed_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.clip_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.listening_runs (id) on delete cascade,
  user_id text not null,
  lesson_key text not null,
  clip_id text not null,
  passed boolean not null,
  missed boolean not null,
  position smallint not null check (position >= 0),
  created_at timestamptz not null default now(),
  constraint clip_results_outcome_chk check (passed or missed),
  constraint clip_results_run_clip_key unique (run_id, clip_id),
  constraint clip_results_run_position_key unique (run_id, position)
);

create index if not exists listening_runs_user_created_idx
  on public.listening_runs (user_id, created_at desc);

create index if not exists clip_results_lesson_clip_idx
  on public.clip_results (lesson_key, clip_id);

create index if not exists clip_results_user_idx
  on public.clip_results (user_id);

alter table public.listening_runs enable row level security;
alter table public.clip_results enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.listening_runs from anon, authenticated;
revoke all on table public.clip_results from anon, authenticated;
grant select, insert, update, delete on table public.listening_runs to service_role;
grant select, insert, update, delete on table public.clip_results to service_role;

create or replace function public.clip_outcome_totals()
returns table (
  lesson_key text,
  clip_id text,
  failures bigint,
  successes bigint,
  students_failed bigint,
  students_passed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lesson_key,
    clip_id,
    count(*) filter (where missed) as failures,
    count(*) filter (where passed) as successes,
    count(distinct user_id) filter (where missed) as students_failed,
    count(distinct user_id) filter (where passed) as students_passed
  from public.clip_results
  group by lesson_key, clip_id;
$$;

revoke all on function public.clip_outcome_totals() from public;
revoke all on function public.clip_outcome_totals() from anon, authenticated;
grant execute on function public.clip_outcome_totals() to service_role;
