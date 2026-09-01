-- Paste into Supabase → SQL → New query → Run
-- Creates poster-test account tables for /poster-test Google login.

create extension if not exists pgcrypto;

create table if not exists public.poster_test_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text,
  email text,
  telegram_id bigint,
  provider text not null check (provider in ('google', 'telegram')),
  role text not null default 'guest' check (role in ('guest', 'staff', 'admin')),
  bonus_points integer not null default 0,
  qr_slug text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poster_test_users_email_key unique (email),
  constraint poster_test_users_telegram_id_key unique (telegram_id),
  constraint poster_test_users_provider_identity check (
    (provider = 'google' and email is not null)
    or (provider = 'telegram' and telegram_id is not null)
  )
);

create index if not exists poster_test_users_qr_slug_idx on public.poster_test_users (qr_slug);

create table if not exists public.poster_test_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.poster_test_users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  fulfillment text not null default 'pickup' check (fulfillment in ('pickup', 'table', 'delivery')),
  customer_name text not null,
  customer_phone text not null,
  customer_comment text,
  items jsonb not null default '[]'::jsonb,
  total_vnd bigint not null default 0,
  poster_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poster_test_orders_user_id_idx on public.poster_test_orders (user_id, created_at desc);

create or replace function public.poster_test_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists poster_test_users_updated_at on public.poster_test_users;
create trigger poster_test_users_updated_at
  before update on public.poster_test_users
  for each row execute function public.poster_test_touch_updated_at();

drop trigger if exists poster_test_orders_updated_at on public.poster_test_orders;
create trigger poster_test_orders_updated_at
  before update on public.poster_test_orders
  for each row execute function public.poster_test_touch_updated_at();

alter table public.poster_test_users enable row level security;
alter table public.poster_test_orders enable row level security;

revoke all on public.poster_test_users from anon, authenticated;
revoke all on public.poster_test_orders from anon, authenticated;

grant all on public.poster_test_users to service_role;
grant all on public.poster_test_orders to service_role;

-- === Verify (should return poster_test_users, not null) ===
select to_regclass('public.poster_test_users') as poster_test_users_table;
select to_regclass('public.poster_test_orders') as poster_test_orders_table;
select count(*)::int as users_count from public.poster_test_users;
