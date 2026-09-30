-- Run once in Supabase → SQL Editor if xp_awards already exists.
-- A finished listening run can start again the same day. The new order still
-- uses part 1, part 2, and so on, so the old unique key rejected that award.

alter table public.xp_awards drop constraint if exists xp_awards_part_day;
