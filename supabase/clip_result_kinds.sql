-- Card kinds that were wrong on a practice clip, and how many cards the part dealt.
-- Run once in the Supabase SQL editor after listening_runs.sql.
-- Older rows leave both empty. The missed list can still rebuild a card count
-- when the part stored every clip.

alter table public.clip_results
  add column if not exists missed_kinds text[] not null default '{}';

alter table public.clip_results drop constraint if exists clip_results_missed_kinds_chk;
alter table public.clip_results add constraint clip_results_missed_kinds_chk
  check (
    missed_kinds <@ array[
      'listening',
      'order',
      'multiple-choice',
      'vi-choice',
      'vi-input',
      'pairing'
    ]::text[]
    and (missed or cardinality(missed_kinds) = 0)
  );

alter table public.listening_runs
  add column if not exists card_count int;

alter table public.listening_runs drop constraint if exists listening_runs_card_count_chk;
alter table public.listening_runs add constraint listening_runs_card_count_chk
  check (card_count is null or card_count between 1 and 240);
