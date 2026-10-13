-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per finished grammar-world practice: a node part or a review.
-- Every finish pays 20 XP, including a replay of the same part. The Next.js
-- API writes these with the service role key after it checks that the part
-- exists and was not instant. Learners never send an XP number. A repeated
-- submit of the same id does not pay twice.
-- After this table exists, re-run supabase/xp_totals.sql and
-- supabase/admin_progress_reads.sql so boards and admin totals count it.

create table if not exists public.grammar_world_awards (
  id uuid primary key,
  user_id text not null,
  topic_id text not null,
  node int not null check (node >= 0),
  part int not null check (part >= 0),
  review boolean not null default false,
  xp int not null check (xp >= 0),
  week_key text not null,
  day_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists grammar_world_awards_user_idx
  on public.grammar_world_awards (user_id);

create index if not exists grammar_world_awards_week_user_idx
  on public.grammar_world_awards (week_key, user_id);

alter table public.grammar_world_awards enable row level security;

revoke all on table public.grammar_world_awards from anon, authenticated;
grant select, insert, update, delete on table public.grammar_world_awards to service_role;
