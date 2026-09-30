-- Vietnamese → German multiple choice and Vietnamese → type German.
-- Run once in the Supabase SQL editor after duels.sql and blitzrunde.sql.

alter table public.duel_clips drop constraint if exists duel_clips_kind_chk;
alter table public.duel_clips add constraint duel_clips_kind_chk
  check (kind in ('listening', 'order', 'multiple-choice', 'vi-choice', 'vi-input'));

alter table public.blitzrunde_answers drop constraint if exists blitzrunde_answers_kind_check;
alter table public.blitzrunde_answers add constraint blitzrunde_answers_kind_check
  check (kind in ('order', 'multiple-choice', 'vi-choice', 'vi-input', 'pairing'));
