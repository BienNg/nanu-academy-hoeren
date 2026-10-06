-- Run once in Supabase → SQL Editor (free project is fine).
-- One row each time a student starts a duel and sees
-- “Chưa thể tìm đối thủ lúc này. Hãy thử lại sau.”
-- `reason` is the exact server failure, for the student Activity tab.
-- Writes go through the Next.js API with the service role key.

create table if not exists public.duel_match_failures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists duel_match_failures_user_created_idx
  on public.duel_match_failures (user_id, created_at desc);

alter table public.duel_match_failures enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.duel_match_failures from anon, authenticated;
grant select, insert, delete on table public.duel_match_failures to service_role;
