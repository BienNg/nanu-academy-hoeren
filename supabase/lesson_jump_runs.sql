-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per jump test attempt: passed, out of hearts, or left before the end.
-- `cards` holds the answered cards in deck order, rebuilt on the server from
-- the seeded deck: [{ clipId, kind, right, entered, correct }].
-- History starts when this is applied.
--
-- Writes go through the Next.js API with the service role key. A finished
-- attempt replaces a quit row with the same id; a quit never replaces a finish.

create table if not exists public.lesson_jump_runs (
  id uuid primary key,
  user_id text not null,
  lesson_key text not null,
  outcome text not null check (outcome in ('success', 'fail', 'quit')),
  card_count int not null check (card_count >= 0),
  answered_count int not null check (answered_count between 0 and card_count),
  mistakes int not null check (mistakes between 0 and answered_count),
  accuracy int not null check (accuracy between 0 and 100),
  elapsed_ms int not null check (elapsed_ms >= 0),
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists lesson_jump_runs_user_created_idx
  on public.lesson_jump_runs (user_id, created_at desc);

alter table public.lesson_jump_runs enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.lesson_jump_runs from anon, authenticated;
grant select, insert, update, delete on table public.lesson_jump_runs to service_role;
