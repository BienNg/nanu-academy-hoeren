-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per learner, Vietnam calendar day, and named control.
-- `count` is how many times they tapped that control that day.
-- Writes go through the Next.js API with the service role key.

create table if not exists public.ui_clicks (
  user_id text not null,
  day date not null,
  target text not null,
  count integer not null check (count >= 0),
  primary key (user_id, day, target)
);

create index if not exists ui_clicks_user_day_idx
  on public.ui_clicks (user_id, day desc);

alter table public.ui_clicks enable row level security;

-- No anon/authenticated policies: only the service role (server) can read/write.
revoke all on table public.ui_clicks from anon, authenticated;
grant select, insert, update, delete on table public.ui_clicks to service_role;
