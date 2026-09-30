-- Run once in Supabase → SQL Editor (free project is fine).
-- Spaced repetition ("Ôn tập"). One row per listening clip a learner has
-- answered in practice, holding its Leitner box and the next review day.
-- A right first try moves the clip up one box; a miss sends it back to box 0.
-- Rows are written after each finished listening part and after each review
-- session. A learner with no rows yet is backfilled from clip_results the
-- first time the app reads their queue. Interview clips are not stored.
--
-- Writes go through the Next.js API with the service role key.

create table if not exists public.review_items (
  user_id text not null,
  lesson_key text not null,
  clip_id text not null,
  box smallint not null default 0 check (box between 0 and 6),
  due_at timestamptz not null,
  last_reviewed_at timestamptz,
  reviews int not null default 0 check (reviews >= 0),
  lapses int not null default 0 check (lapses >= 0),
  primary key (user_id, lesson_key, clip_id)
);

create index if not exists review_items_user_due_idx
  on public.review_items (user_id, due_at);

-- One row per finished review session. Pays 3 XP per clip, at most 15, for
-- the first 3 sessions of a Vietnam day. Later sessions store 0 XP so a
-- repeated submit of the same id does not pay twice.
create table if not exists public.review_xp_awards (
  id uuid primary key,
  user_id text not null,
  xp int not null check (xp >= 0),
  clip_count int not null check (clip_count >= 0),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists review_xp_awards_user_day_idx
  on public.review_xp_awards (user_id, day_key);

create index if not exists review_xp_awards_week_user_idx
  on public.review_xp_awards (week_key, user_id);

alter table public.review_items enable row level security;
alter table public.review_xp_awards enable row level security;

revoke all on table public.review_items from anon, authenticated;
revoke all on table public.review_xp_awards from anon, authenticated;

grant select, insert, update, delete on table public.review_items to service_role;
grant select, insert, update, delete on table public.review_xp_awards to service_role;
