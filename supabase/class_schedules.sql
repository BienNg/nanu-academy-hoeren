-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per class (keyed like user_progress.class_name, lower-cased) for the
-- admin Classes page: where the class meets, on which weekdays (ISO, 1 = Monday),
-- which level began on which date, and the days without class.
-- No anon/authenticated policies: only the service role (server) can read/write.

create table if not exists public.class_schedules (
  class_key text primary key,
  class_name text not null,
  format text,
  weekdays smallint[] not null default '{}',
  levels jsonb not null default '[]'::jsonb,
  skipped_dates date[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint class_schedules_format_check check (
    format is null
    or format in ('online_de', 'online_vn', 'offline_saigon', 'offline_hanoi')
  )
);

alter table public.class_schedules enable row level security;
