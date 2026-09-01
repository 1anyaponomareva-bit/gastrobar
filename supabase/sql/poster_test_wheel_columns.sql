-- Wheel state per user (server-side cooldown + active bonus for /poster-test).
-- Run in Supabase SQL Editor if columns are missing.

alter table public.poster_test_users
  add column if not exists wheel_state jsonb not null default '{}'::jsonb,
  add column if not exists wheel_active_bonus jsonb;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'poster_test_users'
  and column_name in ('wheel_state', 'wheel_active_bonus');
