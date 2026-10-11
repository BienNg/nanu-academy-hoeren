-- Run once in Supabase → SQL Editor, after listening_runs.sql.
-- Feeds the Behavior tab on Admin → Practice clip difficulty.
--
-- practice_part_starts: one row each time a practice part opens. The id is the
-- same uuid the listening_runs row gets when that part ends, so a start with no
-- run is a part the learner left. History starts when this is applied.
-- difficulty_cohorts: named groups of classes, saved by admins.
-- part_changes: dated notes that a part's content changed, for before/after.
--
-- Writes go through the Next.js API with the service role key.

create table if not exists public.practice_part_starts (
  id uuid primary key,
  user_id text not null,
  lesson_key text not null,
  part_number int not null check (part_number >= 1),
  part_count int not null check (part_count >= part_number),
  card_count int not null check (card_count between 1 and 240),
  started_at timestamptz not null default now(),
  -- Set when the learner leaves before the part ends. Cards finished by then.
  left_at timestamptz,
  cards_done int check (cards_done is null or cards_done between 0 and card_count)
);

create index if not exists practice_part_starts_user_started_idx
  on public.practice_part_starts (user_id, started_at desc);

create index if not exists practice_part_starts_lesson_part_idx
  on public.practice_part_starts (lesson_key, part_number);

create table if not exists public.difficulty_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Class names as admins see them. Matched case-insensitively.
  classes text[] not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists difficulty_cohorts_name_key
  on public.difficulty_cohorts (lower(btrim(name)));

create table if not exists public.part_changes (
  id uuid primary key default gen_random_uuid(),
  lesson_key text not null,
  part_number int not null check (part_number >= 1),
  -- Asia/Ho_Chi_Minh day the change went live.
  changed_on date not null,
  note text not null default '' check (char_length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists part_changes_lesson_part_idx
  on public.part_changes (lesson_key, part_number);

alter table public.practice_part_starts enable row level security;
alter table public.difficulty_cohorts enable row level security;
alter table public.part_changes enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.practice_part_starts from anon, authenticated;
revoke all on table public.difficulty_cohorts from anon, authenticated;
revoke all on table public.part_changes from anon, authenticated;
grant select, insert, update, delete on table public.practice_part_starts to service_role;
grant select, insert, update, delete on table public.difficulty_cohorts to service_role;
grant select, insert, update, delete on table public.part_changes to service_role;

-- Per clip of each practice part, for the given students: answers and first-try
-- misses. Only tries up to a student's first pass of that part count, so
-- replays of a part already passed do not make it look easier.
create or replace function public.part_clip_outcomes(p_user_ids text[])
returns table (
  lesson_key text,
  part_number int,
  clip_id text,
  answers bigint,
  misses bigint,
  students bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with runs as (
    select
      r.id,
      r.lesson_key,
      r.part_number,
      r.created_at,
      min(r.created_at) filter (where r.outcome = 'success')
        over (partition by r.user_id, r.lesson_key, r.part_number) as first_pass_at
    from public.listening_runs r
    where r.user_id = any(p_user_ids)
  )
  select
    runs.lesson_key,
    runs.part_number,
    c.clip_id,
    count(*) as answers,
    count(*) filter (where c.missed) as misses,
    count(distinct c.user_id) as students
  from public.clip_results c
  join runs on runs.id = c.run_id
  where runs.first_pass_at is null or runs.created_at <= runs.first_pass_at
  group by runs.lesson_key, runs.part_number, c.clip_id;
$$;

revoke all on function public.part_clip_outcomes(text[]) from public;
revoke all on function public.part_clip_outcomes(text[]) from anon, authenticated;
grant execute on function public.part_clip_outcomes(text[]) to service_role;
