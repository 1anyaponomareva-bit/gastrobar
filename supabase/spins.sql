-- Выполнить в Supabase → SQL Editor (или через migration).
-- Таблица логов спинов колеса + RLS: разрешён INSERT для anon (браузерный ключ).

create extension if not exists "pgcrypto";

create table if not exists public.spins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  result text not null,
  created_at timestamptz not null default now(),
  is_first_spin boolean not null default false,
  source text,
  page_path text,
  user_agent text,
  session_id text,
  metadata jsonb
);

create index if not idx_spins_created_at on public.spins (created_at desc);
create index if not idx_spins_user_id on public.spins (user_id);

alter table public.spins enable row level security;

drop policy if exists "anon insert spins" on public.spins;

-- MVP: любой клиент с anon key может вставлять строки (без чтения чужих данных).
create policy "anon insert spins"
  on public.spins
  for insert
  to anon
  with check (true);

-- При необходимости чтения из приложения под authenticated — добавьте отдельные политики.

grant usage on schema public to anon;
grant insert on table public.spins to anon;
