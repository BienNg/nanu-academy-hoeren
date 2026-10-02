-- First wrong try on each practice card, plus the right answer.
-- Run once in the Supabase SQL editor after clip_result_kinds.sql.
-- Older rows stay {}. The student detail list only shows answers stored from now on.

alter table public.clip_results
  add column if not exists missed_answers jsonb not null default '{}'::jsonb;

alter table public.clip_results drop constraint if exists clip_results_missed_answers_chk;
alter table public.clip_results add constraint clip_results_missed_answers_chk
  check (
    jsonb_typeof(missed_answers) = 'object'
    and (missed or missed_answers = '{}'::jsonb)
  );
