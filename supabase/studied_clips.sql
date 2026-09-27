-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per listening clip a learner has completed (a finished part,
-- stored in user_progress.learn completedClipIds). The Next.js API
-- backfills this from existing progress and upserts it on later saves.
-- Duel plays do not add rows. Interview clips are not stored.
--
-- Writes go through the Next.js API with the service role key.

create table if not exists public.studied_clips (
  user_id text not null,
  lesson_key text not null,
  clip_id text not null,
  first_studied_at timestamptz not null default now(),
  primary key (user_id, lesson_key, clip_id)
);

create index if not exists studied_clips_user_idx
  on public.studied_clips (user_id);

alter table public.studied_clips enable row level security;

revoke all on table public.studied_clips from anon, authenticated;
grant select, insert, update, delete on table public.studied_clips to service_role;
