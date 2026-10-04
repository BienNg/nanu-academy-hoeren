-- Listening → meaning choice: the audio plays and the student picks the Vietnamese meaning.
-- Run once in the Supabase SQL editor after clip_result_kinds.sql and practice_card_kinds.sql.

alter table public.clip_results drop constraint if exists clip_results_missed_kinds_chk;
alter table public.clip_results add constraint clip_results_missed_kinds_chk
  check (
    missed_kinds <@ array[
      'listening',
      'listening-choice',
      'order',
      'multiple-choice',
      'vi-choice',
      'vi-input',
      'pairing'
    ]::text[]
    and (missed or cardinality(missed_kinds) = 0)
  );

alter table public.duel_clips drop constraint if exists duel_clips_kind_chk;
alter table public.duel_clips add constraint duel_clips_kind_chk
  check (kind in ('listening', 'listening-choice', 'order', 'multiple-choice', 'vi-choice', 'vi-input'));
