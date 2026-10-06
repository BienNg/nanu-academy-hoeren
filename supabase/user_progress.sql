-- Run once in Supabase → SQL Editor (free project is fine).
-- Progress is written by the Next.js API using the service role key
-- (Auth.js Google user ids are not Supabase Auth users).

create table if not exists public.user_progress (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  email text,
  name text,
  -- Google profile photo (https://lh3.googleusercontent.com/...).
  -- Shown on the ranking list and on the admin Levels paths.
  image text,
  last_login_at timestamptz,
  deleted_at timestamptz,
  revoked_before timestamptz,
  -- CEFR slugs this learner may open, plus the reserved slug "interview"
  -- for "Luyện phỏng vấn theo nghề". Empty = locked until an admin grants one.
  -- Admin accounts ignore this column and can open every level and interview course.
  level_access text[] not null default '{}',
  -- Admin-only class label used to group students. Learner APIs never read it.
  class_name text,
  -- Real Google sign-ins (Auth.js jwt callback with `account`). Not app visits.
  -- Kept about 90 days by the app. `last_login_at` stays "last seen".
  sign_ins timestamptz[] not null default '{}',
  -- Same sign-ins, with device (mobile/tablet/desktop), browser, and
  -- city-level location. Older timestamps in sign_ins have no matching row.
  sign_in_log jsonb not null default '[]'::jsonb,
  -- Each time a signed-in learner loads or saves progress. One row per visit:
  -- the same device, browser, and city inside 15 minutes updates seenAt.
  app_uses jsonb not null default '[]'::jsonb,
  -- Limited dashboard access. Staff can see every stat and grant classes and
  -- courses. They cannot delete accounts or progress. Full admins are the
  -- hardcoded allowlist and ignore this flag.
  staff boolean not null default false,
  -- When the learner finished the first-run map tour. Set once, never cleared.
  -- supabase/onboarding.sql backfills learners who already had XP.
  onboarding_completed_at timestamptz,
  -- Set when an admin resets the tour. The learner then sees it again even
  -- with XP, until they finish it and onboarding_completed_at is set again.
  onboarding_reset_at timestamptz
);

alter table public.user_progress
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists image text,
  add column if not exists last_login_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists revoked_before timestamptz,
  add column if not exists level_access text[] not null default '{}',
  add column if not exists class_name text,
  add column if not exists sign_ins timestamptz[] not null default '{}',
  add column if not exists sign_in_log jsonb not null default '[]'::jsonb,
  add column if not exists app_uses jsonb not null default '[]'::jsonb,
  add column if not exists staff boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_reset_at timestamptz;

create index if not exists user_progress_email_idx
  on public.user_progress (email);

create index if not exists user_progress_last_login_at_idx
  on public.user_progress (last_login_at desc);

-- Deleted accounts keep a tombstone row: `deleted_at` hides them from the
-- admin list, and `revoked_before` permanently invalidates sessions issued
-- earlier, so a still-logged-in browser cannot re-sync its old progress.
create index if not exists user_progress_deleted_at_idx
  on public.user_progress (deleted_at);

create index if not exists user_progress_class_name_idx
  on public.user_progress (class_name);

alter table public.user_progress enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
