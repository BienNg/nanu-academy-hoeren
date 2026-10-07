-- Run once in Supabase → SQL Editor (free project is fine).
-- One row per student email for the support outreach campaign.
-- The app still chooses the group from usage. This table stores the
-- conversation: status, channel, reply, and follow-up. Nothing is sent.
-- No anon/authenticated policies: only the service role (server) can read/write.

create table if not exists public.outreach_cases (
  email text primary key,
  greeting_name text,
  group_override text,
  status text not null default 'chua_gui',
  channel text,
  sent_at timestamptz,
  owner_user_id text,
  owner_name text,
  follow_up boolean not null default false,
  follow_up_on date,
  reason text,
  feedback text not null default '',
  feature_request text not null default '',
  notes text not null default '',
  had_account_at_contact boolean,
  parts_at_contact integer,
  updated_at timestamptz not null default now(),
  constraint outreach_cases_group_check check (
    group_override is null
    or group_override in ('preaccess', 'never', 'light', 'heavy')
  ),
  constraint outreach_cases_status_check check (
    status in (
      'chua_gui',
      'da_gui_tin_1',
      'da_gui_tin_2',
      'da_tra_loi',
      'khong_tra_loi',
      'da_dung'
    )
  ),
  constraint outreach_cases_channel_check check (
    channel is null or channel in ('zalo', 'facebook', 'email', 'other')
  ),
  constraint outreach_cases_reason_check check (
    reason is null
    or reason in (
      'no_time',
      'tech',
      'no_need',
      'forgot',
      'other_method',
      'no_motivation',
      'other'
    )
  )
);

alter table public.outreach_cases enable row level security;
