-- Run once in Supabase → SQL Editor.
-- One row per browser that allowed the evening streak reminder, plus how
-- many of those reminders that learner ignored. Writes go through the
-- Next.js API with the service role key.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.push_reminders (
  user_id text primary key,
  last_sent_on date,
  judged_on date,
  ignored_count integer not null default 0,
  paused_until date,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_reminders enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.push_reminders from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.push_reminders to service_role;
