-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per grammar-world part that ends (passed or out of hearts), the
-- cards in that part, and one row per part that was opened. A start whose id
-- never appears in grammar_world_runs is a part the learner left.
--
-- Writes go through the Next.js API with the service role key. A finish is
-- one run insert plus one batched card insert, on the same request that pays
-- XP. A start is one small insert when the part opens. Leaving updates that
-- start once. The admin page reads run rows for the date range and only the
-- missed cards of those runs.

create table if not exists public.grammar_world_runs (
  id uuid primary key,
  user_id text not null,
  topic_id text not null,
  node int not null check (node >= 0),
  part int not null check (part >= 0),
  review boolean not null default false,
  outcome text not null check (outcome in ('success', 'fail')),
  accuracy int not null check (accuracy between 0 and 100),
  answered_count int not null check (answered_count >= 0),
  card_count int not null check (card_count between 1 and 40),
  elapsed_ms int not null check (elapsed_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.grammar_world_cards (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.grammar_world_runs (id) on delete cascade,
  user_id text not null,
  topic_id text not null,
  card_key text not null check (char_length(card_key) between 1 and 120),
  kind text not null check (char_length(kind) between 1 and 40),
  position smallint not null check (position >= 0),
  missed boolean not null,
  answer text not null default '' check (char_length(answer) <= 160),
  constraint grammar_world_cards_run_position_key unique (run_id, position),
  constraint grammar_world_cards_answer_chk check (missed or answer = '')
);

create table if not exists public.grammar_world_starts (
  id uuid primary key,
  user_id text not null,
  topic_id text not null,
  node int not null check (node >= 0),
  part int not null check (part >= 0),
  review boolean not null default false,
  card_count int not null check (card_count between 1 and 40),
  started_at timestamptz not null default now(),
  left_at timestamptz,
  cards_done int check (cards_done is null or cards_done between 0 and 40)
);

create index if not exists grammar_world_runs_created_idx
  on public.grammar_world_runs (created_at desc);

create index if not exists grammar_world_runs_user_idx
  on public.grammar_world_runs (user_id);

create index if not exists grammar_world_starts_started_idx
  on public.grammar_world_starts (started_at desc);

create index if not exists grammar_world_starts_user_idx
  on public.grammar_world_starts (user_id);

alter table public.grammar_world_runs enable row level security;
alter table public.grammar_world_cards enable row level security;
alter table public.grammar_world_starts enable row level security;

revoke all on table public.grammar_world_runs from anon, authenticated;
revoke all on table public.grammar_world_cards from anon, authenticated;
revoke all on table public.grammar_world_starts from anon, authenticated;

grant select, insert, update, delete on table public.grammar_world_runs to service_role;
grant select, insert, update, delete on table public.grammar_world_cards to service_role;
grant select, insert, update, delete on table public.grammar_world_starts to service_role;
