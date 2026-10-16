-- Run once in Supabase → SQL Editor (free project is fine). Safe to re-run.
-- One row per learner per class session (docs/SESSION_RATINGS.md). Sessions
-- are never stored: a session is a class day from class_schedules, named by
-- (class_key, session_date). "dismissed" means the learner tapped "Để sau".
-- "absent" means they tapped "Mình vắng buổi này": the class was held, they
-- were not there. "not_held" means they tapped "Buổi học không diễn ra":
-- the scheduled class did not take place. Either way they are not asked to
-- rate it. The Next.js API writes these with the service role key. The
-- primary key means one answer per learner per session.

create table if not exists public.session_ratings (
  class_key text not null,
  session_date date not null,
  user_id text not null,
  status text not null check (status in ('rated', 'dismissed', 'absent', 'not_held')),
  stars smallint check (stars between 1 and 5),
  tags text[] not null default '{}',
  comment text check (comment is null or char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  primary key (class_key, session_date, user_id),
  constraint session_ratings_status_fields check (
    (status = 'rated' and stars is not null)
    or (status in ('dismissed', 'absent', 'not_held') and stars is null and comment is null and cardinality(tags) = 0)
  )
);

-- create table does not change a table that already exists. Re-running this
-- file still has to allow "absent" and "not_held" on an older database.
alter table public.session_ratings drop constraint if exists session_ratings_status_check;
alter table public.session_ratings add constraint session_ratings_status_check
  check (status in ('rated', 'dismissed', 'absent', 'not_held'));

alter table public.session_ratings drop constraint if exists session_ratings_status_fields;
alter table public.session_ratings add constraint session_ratings_status_fields check (
  (status = 'rated' and stars is not null)
  or (status in ('dismissed', 'absent', 'not_held') and stars is null and comment is null and cardinality(tags) = 0)
);

-- Account deletion and a learner's own ratings on the teacher's student page.
create index if not exists session_ratings_user_idx
  on public.session_ratings (user_id, session_date);

alter table public.session_ratings enable row level security;

revoke all on table public.session_ratings from anon, authenticated;
grant select, insert, update, delete on table public.session_ratings to service_role;

-- One row per rated session of a class, newest first, so teacher pages never
-- read every rating. Under 3 ratings only the count is returned: the average,
-- star counts and tag counts are null (SESSION_RATING_SUMMARY_MIN in code).
-- star_counts[1] is the number of 1-star ratings, star_counts[5] of 5-star.
create or replace function public.session_rating_summary(p_class_key text)
returns table (
  session_date date,
  rated_count int,
  average numeric,
  star_counts int[],
  tag_counts jsonb
)
language sql
stable
set search_path = public
as $$
  with rated as (
    select r.session_date, r.stars, r.tags
    from public.session_ratings r
    where r.class_key = p_class_key and r.status = 'rated'
  ),
  per_session as (
    select
      rated.session_date,
      count(*)::int as rated_count,
      round(avg(rated.stars), 1) as average,
      array[
        count(*) filter (where rated.stars = 1),
        count(*) filter (where rated.stars = 2),
        count(*) filter (where rated.stars = 3),
        count(*) filter (where rated.stars = 4),
        count(*) filter (where rated.stars = 5)
      ]::int[] as star_counts
    from rated
    group by rated.session_date
  ),
  tag_totals as (
    select counted.session_date, jsonb_object_agg(counted.tag, counted.n) as tag_counts
    from (
      select rated.session_date, t.tag, count(*)::int as n
      from rated
      cross join lateral unnest(rated.tags) as t(tag)
      group by rated.session_date, t.tag
    ) counted
    group by counted.session_date
  )
  select
    p.session_date,
    p.rated_count,
    case when p.rated_count >= 3 then p.average end,
    case when p.rated_count >= 3 then p.star_counts end,
    case when p.rated_count >= 3 then coalesce(t.tag_counts, '{}'::jsonb) end
  from per_session p
  left join tag_totals t on t.session_date = p.session_date
  order by p.session_date desc;
$$;

revoke all on function public.session_rating_summary(text) from public, anon, authenticated;
grant execute on function public.session_rating_summary(text) to service_role;
