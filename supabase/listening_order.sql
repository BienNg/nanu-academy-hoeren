-- Listening → sentence order: the audio plays and the student taps the German word chips into order.
-- Run once in the Supabase SQL editor after listening_choice.sql.

alter table public.clip_results drop constraint if exists clip_results_missed_kinds_chk;
alter table public.clip_results add constraint clip_results_missed_kinds_chk
  check (
    missed_kinds <@ array[
      'listening',
      'listening-choice',
      'listening-order',
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
  check (
    kind in (
      'listening',
      'listening-choice',
      'listening-order',
      'order',
      'multiple-choice',
      'vi-choice',
      'vi-input'
    )
  );
