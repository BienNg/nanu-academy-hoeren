-- Leitner review boxes ("Ôn tập" tab).
-- Run once in the Supabase SQL editor after listening_runs.sql and clip_result_answers.sql.
--
-- clip_boxes holds each practised level clip's current box (0-6) and the
-- Vietnam calendar day it is due again. It is rebuilt from clip_results and
-- review_answers, so it can always be recomputed from history.
-- review_answers is one row per clip answered in a review round. Review rounds
-- do not write listening_runs, so practice-part counts and XP stay untouched,
-- but clip_outcome_totals() below counts them for the clip difficulty stats.
--
-- Writes go through the Next.js API with the service role key.

create table if not exists public.clip_boxes (
  user_id text not null,
  lesson_key text not null,
  clip_id text not null,
  box smallint not null check (box between 0 and 6),
  due_on date not null,
  lapses int not null default 0 check (lapses >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_key, clip_id)
);

create index if not exists clip_boxes_user_due_idx
  on public.clip_boxes (user_id, due_on);

create table if not exists public.review_answers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  lesson_key text not null,
  clip_id text not null,
  missed boolean not null,
  missed_kinds text[] not null default '{}',
  missed_answers jsonb not null default '{}'::jsonb,
  box_before smallint check (box_before between 0 and 6),
  box_after smallint not null check (box_after between 0 and 6),
  created_at timestamptz not null default now(),
  constraint review_answers_missed_kinds_chk check (
    missed_kinds <@ array['multiple-choice', 'vi-input']::text[]
    and (missed or cardinality(missed_kinds) = 0)
  ),
  constraint review_answers_missed_answers_chk check (
    jsonb_typeof(missed_answers) = 'object'
    and (missed or missed_answers = '{}'::jsonb)
  )
);

create index if not exists review_answers_user_created_idx
  on public.review_answers (user_id, created_at);

create index if not exists review_answers_lesson_clip_idx
  on public.review_answers (lesson_key, clip_id);

alter table public.clip_boxes enable row level security;
alter table public.review_answers enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.clip_boxes from anon, authenticated;
revoke all on table public.review_answers from anon, authenticated;
grant select, insert, update, delete on table public.clip_boxes to service_role;
grant select, insert, update, delete on table public.review_answers to service_role;

-- Same columns as in listening_runs.sql, now also counting review answers.
-- A review clip is always passed: a missed card comes back until it is right.
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
  from (
    select user_id, lesson_key, clip_id, passed, missed from public.clip_results
    union all
    select user_id, lesson_key, clip_id, true, missed from public.review_answers
  ) outcomes
  group by lesson_key, clip_id;
$$;

revoke all on function public.clip_outcome_totals() from public;
revoke all on function public.clip_outcome_totals() from anon, authenticated;
grant execute on function public.clip_outcome_totals() to service_role;
