-- Poster Finance: accounts, transaction categories, money movements, cash shifts, payroll.
-- Additive: new tables and RPCs. erp_load_state is wrapped so previous screen parts stay the same.

create table if not exists public.erp_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('cash', 'bank', 'card')),
  currency text not null default 'VND',
  opening_balance numeric not null default 0,
  location_id uuid,
  is_system boolean not null default false,
  system_role text check (system_role in ('cash_drawer', 'acquiring', 'safe')),
  sort integer not null default 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists erp_finance_accounts_code_idx
  on public.erp_finance_accounts (lower(code)) where deleted_at is null;
create unique index if not exists erp_finance_accounts_role_idx
  on public.erp_finance_accounts (system_role) where deleted_at is null and system_role is not null;

create table if not exists public.erp_finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null check (length(btrim(name)) between 1 and 120),
  parent_id uuid references public.erp_finance_categories (id),
  allow_income boolean not null default false,
  allow_expense boolean not null default true,
  show_on_pos boolean not null default false,
  show_in_pnl boolean not null default true,
  pnl_block text not null default 'opex'
    check (pnl_block in ('revenue', 'cogs', 'opex', 'other_income', 'other_expense', 'tax', 'none')),
  is_system boolean not null default false,
  sort integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists erp_finance_categories_code_idx
  on public.erp_finance_categories (lower(code)) where code is not null and deleted_at is null;

create table if not exists public.erp_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric not null check (amount > 0),
  account_id uuid not null references public.erp_finance_accounts (id),
  to_account_id uuid references public.erp_finance_accounts (id),
  category_id uuid references public.erp_finance_categories (id),
  occurred_at timestamptz not null default now(),
  deal_at date,
  comment text,
  source text not null default 'manual'
    check (source in ('manual', 'shift', 'payroll', 'receipt', 'adjustment', 'bank_import')),
  source_id uuid,
  auto_kind text check (auto_kind in ('sales_cash', 'sales_card', 'collection', 'adjustment', 'payroll', 'receipt')),
  shift_id uuid,
  user_name text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  deleted_with_account_id uuid
);
create index if not exists erp_finance_tx_occurred_idx on public.erp_finance_transactions (occurred_at desc) where deleted_at is null;
create index if not exists erp_finance_tx_account_idx on public.erp_finance_transactions (account_id) where deleted_at is null;
create index if not exists erp_finance_tx_shift_idx on public.erp_finance_transactions (shift_id) where shift_id is not null;
create unique index if not exists erp_finance_tx_auto_idx
  on public.erp_finance_transactions (source, source_id, auto_kind)
  where deleted_at is null and auto_kind is not null and source_id is not null;

create table if not exists public.erp_finance_shifts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid,
  account_id uuid not null references public.erp_finance_accounts (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by text,
  closed_by text,
  opening_cash numeric not null default 0,
  sales_cash numeric not null default 0,
  sales_card numeric not null default 0,
  collection_sum numeric not null default 0,
  actual_cash numeric,
  comment text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists erp_finance_shifts_opened_idx on public.erp_finance_shifts (opened_at desc);

alter table public.erp_finance_transactions
  drop constraint if exists erp_finance_transactions_shift_id_fkey;
alter table public.erp_finance_transactions
  add constraint erp_finance_transactions_shift_id_fkey
  foreign key (shift_id) references public.erp_finance_shifts (id);

create table if not exists public.erp_finance_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  role text,
  pay_type text not null default 'monthly' check (pay_type in ('monthly', 'hourly', 'shift', 'percent')),
  rate numeric not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.erp_finance_payroll (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.erp_finance_employees (id),
  period_start date not null,
  period_end date not null,
  hours numeric,
  amount numeric not null check (amount >= 0),
  account_id uuid references public.erp_finance_accounts (id),
  paid_at timestamptz,
  transaction_id uuid references public.erp_finance_transactions (id),
  comment text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.erp_finance_accounts (code, name, kind, system_role, is_system, sort, opening_balance)
select v.code, v.name, v.kind, v.role, true, v.sort, 0
from (values
  ('cash_drawer', 'Денежный ящик', 'cash', 'cash_drawer', 10),
  ('acquiring', 'Расчетный счет', 'card', 'acquiring', 20),
  ('safe', 'Сейф', 'cash', 'safe', 30)
) as v(code, name, kind, role, sort)
where not exists (select 1 from public.erp_finance_accounts a where a.code = v.code and a.deleted_at is null);

insert into public.erp_finance_categories (
  code, name, allow_income, allow_expense, show_on_pos, show_in_pnl, pnl_block, is_system, sort
)
select v.code, v.name, v.inc, v.exp, v.pos, v.pnl, v.block, v.sys, v.sort
from (values
  ('cash_shifts', 'Кассовые смены', true, true, false, true, 'revenue', true, 10),
  ('adjustment', 'Актуализация', true, true, false, true, 'other_income', true, 20),
  ('bank_fees', 'Банковские услуги и комиссии', false, true, false, true, 'opex', true, 30),
  ('deposits', 'Пополнение депозитных счетов', true, true, false, false, 'none', true, 40),
  ('supplies', 'Поставки', false, true, false, true, 'cogs', true, 50),
  ('salary', 'Зарплата', false, true, false, true, 'opex', false, 60),
  ('revenue', 'Выручка', true, false, false, true, 'revenue', false, 70),
  ('rent', 'Аренда', false, true, true, true, 'opex', false, 80)
) as v(code, name, inc, exp, pos, pnl, block, sys, sort)
where not exists (select 1 from public.erp_finance_categories c where c.code = v.code and c.deleted_at is null);

do $$
declare
  r record;
begin
  for r in select table_name from information_schema.tables
           where table_schema = 'public' and table_name like 'erp_finance_%'
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', r.table_name);
    execute format('grant all on public.%I to service_role', r.table_name);
  end loop;
end $$;

create or replace function public.erp_finance_need_actor(p_actor text)
returns text
language plpgsql
as $$
begin
  if coalesce(btrim(p_actor), '') = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  return btrim(p_actor);
end;
$$;

create or replace function public.erp_finance_purge_trash()
returns void
language plpgsql
as $$
begin
  delete from public.erp_finance_transactions
  where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.erp_finance_accounts
  where deleted_at is not null and deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.erp_finance_transactions t where t.account_id = erp_finance_accounts.id or t.to_account_id = erp_finance_accounts.id);
end;
$$;

create or replace function public.erp_save_finance_account(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_kind text := coalesce(nullif(p->>'kind', ''), 'cash');
  v_currency text := coalesce(nullif(btrim(p->>'currency'), ''), 'VND');
  v_open numeric := coalesce(nullif(p->>'opening_balance', '')::numeric, 0);
  v_location uuid := nullif(p->>'location_id', '')::uuid;
  v_code text;
begin
  perform public.erp_finance_purge_trash();
  if length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_kind not in ('cash', 'bank', 'card') then perform public.erp_raise('ERP_INVALID', 'kind'); end if;
  if v_id is null then
    v_code := coalesce(nullif(btrim(p->>'code'), ''), 'acc_' || substr(gen_random_uuid()::text, 1, 8));
    insert into public.erp_finance_accounts (code, name, kind, currency, opening_balance, location_id, sort, created_by, updated_by)
    values (v_code, v_name, v_kind, v_currency, v_open, v_location,
            coalesce((select max(sort) + 10 from public.erp_finance_accounts where deleted_at is null), 100), v_actor, v_actor)
    returning id into v_id;
    perform public.erp_audit(v_actor, 'finance_account', v_id, 'create');
    return v_id;
  end if;
  perform 1 from public.erp_finance_accounts where id = v_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  update public.erp_finance_accounts set
    name = v_name, kind = v_kind, currency = v_currency, opening_balance = v_open, location_id = v_location,
    updated_at = now(), updated_by = v_actor
  where id = v_id;
  perform public.erp_audit(v_actor, 'finance_account', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_delete_finance_account(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v public.erp_finance_accounts;
begin
  select * into v from public.erp_finance_accounts where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.is_system then perform public.erp_raise('ERP_FINANCE_SYSTEM'); end if;
  update public.erp_finance_transactions
    set deleted_at = now(), deleted_with_account_id = p_id, updated_by = v_actor
    where deleted_at is null and (account_id = p_id or to_account_id = p_id);
  update public.erp_finance_accounts set deleted_at = now(), updated_at = now(), updated_by = v_actor where id = p_id;
  perform public.erp_audit(v_actor, 'finance_account', p_id, 'delete');
end;
$$;

create or replace function public.erp_restore_finance_account(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v public.erp_finance_accounts;
begin
  perform public.erp_finance_purge_trash();
  select * into v from public.erp_finance_accounts where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.deleted_at is null then return; end if;
  if v.deleted_at < now() - interval '30 days' then perform public.erp_raise('ERP_FINANCE_TRASH_EXPIRED'); end if;
  update public.erp_finance_accounts set deleted_at = null, updated_at = now(), updated_by = v_actor where id = p_id;
  update public.erp_finance_transactions
    set deleted_at = null, deleted_with_account_id = null, updated_by = v_actor
    where deleted_with_account_id = p_id;
  perform public.erp_audit(v_actor, 'finance_account', p_id, 'restore');
end;
$$;

create or replace function public.erp_save_finance_category(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_parent uuid := nullif(p->>'parent_id', '')::uuid;
  v_inc boolean := coalesce((p->>'allow_income')::boolean, false);
  v_exp boolean := coalesce((p->>'allow_expense')::boolean, true);
  v_pos boolean := coalesce((p->>'show_on_pos')::boolean, false);
  v_pnl boolean := coalesce((p->>'show_in_pnl')::boolean, true);
  v_block text := coalesce(nullif(p->>'pnl_block', ''), 'opex');
begin
  if length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if not v_inc and not v_exp then perform public.erp_raise('ERP_INVALID', 'type'); end if;
  if v_block not in ('revenue', 'cogs', 'opex', 'other_income', 'other_expense', 'tax', 'none') then
    perform public.erp_raise('ERP_INVALID', 'pnl_block');
  end if;
  if v_parent is not null then
    perform 1 from public.erp_finance_categories where id = v_parent and deleted_at is null;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'parent'); end if;
    if v_id is not null and v_parent = v_id then perform public.erp_raise('ERP_INVALID', 'parent'); end if;
  end if;
  if v_id is null then
    insert into public.erp_finance_categories (
      name, parent_id, allow_income, allow_expense, show_on_pos, show_in_pnl, pnl_block, sort, created_by, updated_by
    ) values (
      v_name, v_parent, v_inc, v_exp, v_pos, v_pnl, v_block,
      coalesce((select max(sort) + 10 from public.erp_finance_categories where deleted_at is null), 100), v_actor, v_actor
    ) returning id into v_id;
    perform public.erp_audit(v_actor, 'finance_category', v_id, 'create');
    return v_id;
  end if;
  perform 1 from public.erp_finance_categories where id = v_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  update public.erp_finance_categories set
    name = v_name, parent_id = v_parent, allow_income = v_inc, allow_expense = v_exp,
    show_on_pos = v_pos, show_in_pnl = v_pnl, pnl_block = v_block, updated_at = now(), updated_by = v_actor
  where id = v_id;
  perform public.erp_audit(v_actor, 'finance_category', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_delete_finance_category(p_id uuid, p_move_to uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v public.erp_finance_categories;
begin
  select * into v from public.erp_finance_categories where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.is_system then perform public.erp_raise('ERP_FINANCE_SYSTEM'); end if;
  update public.erp_finance_categories set parent_id = coalesce(p_move_to, parent_id) where parent_id = p_id;
  if p_move_to is not null then
    perform 1 from public.erp_finance_categories where id = p_move_to and deleted_at is null;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'move_to'); end if;
    update public.erp_finance_transactions set category_id = p_move_to, updated_by = v_actor where category_id = p_id;
  else
    delete from public.erp_finance_transactions where category_id = p_id;
  end if;
  delete from public.erp_finance_categories where id = p_id;
  perform public.erp_audit(v_actor, 'finance_category', p_id, 'purge');
end;
$$;

create or replace function public.erp_save_finance_transaction(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_type text := coalesce(p->>'type', 'expense');
  v_amount numeric := coalesce(nullif(p->>'amount', '')::numeric, 0);
  v_account uuid := nullif(p->>'account_id', '')::uuid;
  v_to uuid := nullif(p->>'to_account_id', '')::uuid;
  v_cat uuid := nullif(p->>'category_id', '')::uuid;
  v_when timestamptz := coalesce(nullif(p->>'occurred_at', '')::timestamptz, now());
  v_deal date := nullif(p->>'deal_at', '')::date;
  v_comment text := nullif(btrim(p->>'comment'), '');
  v_shift uuid := nullif(p->>'shift_id', '')::uuid;
  v_user text := nullif(btrim(p->>'user_name'), '');
  v_row public.erp_finance_transactions;
  v_catrow public.erp_finance_categories;
begin
  perform public.erp_finance_purge_trash();
  if v_type not in ('income', 'expense', 'transfer') then perform public.erp_raise('ERP_INVALID', 'type'); end if;
  if v_amount <= 0 then perform public.erp_raise('ERP_INVALID', 'amount'); end if;
  if v_account is null then perform public.erp_raise('ERP_INVALID', 'account_id'); end if;
  perform 1 from public.erp_finance_accounts where id = v_account and deleted_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'account'); end if;
  if v_type = 'transfer' then
    if v_to is null or v_to = v_account then perform public.erp_raise('ERP_SAME_ACCOUNT'); end if;
    perform 1 from public.erp_finance_accounts where id = v_to and deleted_at is null;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'to_account'); end if;
    v_cat := null;
  else
    v_to := null;
    if v_cat is null then perform public.erp_raise('ERP_INVALID', 'category_id'); end if;
    select * into v_catrow from public.erp_finance_categories where id = v_cat and deleted_at is null;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'category'); end if;
    if v_type = 'income' and not v_catrow.allow_income then perform public.erp_raise('ERP_INVALID', 'category'); end if;
    if v_type = 'expense' and not v_catrow.allow_expense then perform public.erp_raise('ERP_INVALID', 'category'); end if;
  end if;
  if v_id is not null then
    select * into v_row from public.erp_finance_transactions where id = v_id and deleted_at is null for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_row.source <> 'manual' then
      update public.erp_finance_transactions set
        category_id = case when v_row.type = 'transfer' or v_row.source <> 'manual' then category_id else v_cat end,
        comment = case when v_row.source <> 'manual' or v_row.type = 'transfer' then comment else v_comment end,
        updated_at = now(), updated_by = v_actor
      where id = v_id;
      perform public.erp_audit(v_actor, 'finance_tx', v_id, 'save');
      return v_id;
    end if;
    update public.erp_finance_transactions set
      type = v_type, amount = v_amount, account_id = v_account, to_account_id = v_to, category_id = v_cat,
      occurred_at = v_when, deal_at = v_deal, comment = v_comment, shift_id = v_shift, user_name = coalesce(v_user, user_name),
      updated_at = now(), updated_by = v_actor
    where id = v_id;
    perform public.erp_audit(v_actor, 'finance_tx', v_id, 'save');
    return v_id;
  end if;
  insert into public.erp_finance_transactions (
    type, amount, account_id, to_account_id, category_id, occurred_at, deal_at, comment, source,
    shift_id, user_name, created_by, updated_by
  ) values (
    v_type, v_amount, v_account, v_to, v_cat, v_when, v_deal, v_comment, 'manual',
    v_shift, coalesce(v_user, v_actor), v_actor, v_actor
  ) returning id into v_id;
  perform public.erp_audit(v_actor, 'finance_tx', v_id, 'create');
  return v_id;
end;
$$;

create or replace function public.erp_delete_finance_transaction(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v public.erp_finance_transactions;
begin
  select * into v from public.erp_finance_transactions where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.source <> 'manual' then perform public.erp_raise('ERP_FINANCE_LOCKED'); end if;
  update public.erp_finance_transactions set deleted_at = now(), updated_by = v_actor where id = p_id;
  perform public.erp_audit(v_actor, 'finance_tx', p_id, 'delete');
end;
$$;

create or replace function public.erp_restore_finance_transaction(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v public.erp_finance_transactions;
begin
  perform public.erp_finance_purge_trash();
  select * into v from public.erp_finance_transactions where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.deleted_at is null then return; end if;
  if v.deleted_at < now() - interval '30 days' then perform public.erp_raise('ERP_FINANCE_TRASH_EXPIRED'); end if;
  update public.erp_finance_transactions set deleted_at = null, deleted_with_account_id = null, updated_by = v_actor where id = p_id;
  perform public.erp_audit(v_actor, 'finance_tx', p_id, 'restore');
end;
$$;

create or replace function public.erp_finance_upsert_auto_tx(
  p_source text, p_source_id uuid, p_kind text, p_type text, p_amount numeric,
  p_account uuid, p_to uuid, p_category uuid, p_when timestamptz, p_shift uuid, p_comment text, p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    update public.erp_finance_transactions
      set deleted_at = now(), updated_by = p_actor
      where source = p_source and source_id = p_source_id and auto_kind = p_kind and deleted_at is null;
    return null;
  end if;
  select id into v_id from public.erp_finance_transactions
    where source = p_source and source_id = p_source_id and auto_kind = p_kind and deleted_at is null;
  if v_id is null then
    insert into public.erp_finance_transactions (
      type, amount, account_id, to_account_id, category_id, occurred_at, comment, source, source_id, auto_kind,
      shift_id, user_name, created_by, updated_by
    ) values (
      p_type, p_amount, p_account, p_to, p_category, p_when, p_comment, p_source, p_source_id, p_kind,
      p_shift, p_actor, p_actor, p_actor
    ) returning id into v_id;
  else
    update public.erp_finance_transactions set
      type = p_type, amount = p_amount, account_id = p_account, to_account_id = p_to, category_id = p_category,
      occurred_at = p_when, comment = p_comment, shift_id = p_shift, updated_at = now(), updated_by = p_actor
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.erp_save_finance_shift(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_account uuid := nullif(p->>'account_id', '')::uuid;
  v_location uuid := nullif(p->>'location_id', '')::uuid;
  v_open timestamptz := coalesce(nullif(p->>'opened_at', '')::timestamptz, now());
  v_cash numeric := coalesce(nullif(p->>'opening_cash', '')::numeric, 0);
  v_comment text := nullif(btrim(p->>'comment'), '');
  v public.erp_finance_shifts;
begin
  if v_account is null then
    select id into v_account from public.erp_finance_accounts
      where system_role = 'cash_drawer' and deleted_at is null limit 1;
  end if;
  if v_account is null then perform public.erp_raise('ERP_INVALID', 'account_id'); end if;
  if v_id is null then
    insert into public.erp_finance_shifts (location_id, account_id, opened_at, opening_cash, comment, opened_by, created_by, updated_by)
    values (v_location, v_account, v_open, v_cash, v_comment, v_actor, v_actor, v_actor)
    returning id into v_id;
    perform public.erp_audit(v_actor, 'finance_shift', v_id, 'open');
    return v_id;
  end if;
  select * into v from public.erp_finance_shifts where id = v_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.status = 'closed' then perform public.erp_raise('ERP_FINANCE_SHIFT_CLOSED'); end if;
  update public.erp_finance_shifts set
    location_id = v_location, account_id = v_account, opened_at = v_open, opening_cash = v_cash, comment = v_comment,
    updated_at = now(), updated_by = v_actor
  where id = v_id;
  perform public.erp_audit(v_actor, 'finance_shift', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_close_finance_shift(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v public.erp_finance_shifts;
  v_sales_cash numeric := coalesce(nullif(p->>'sales_cash', '')::numeric, 0);
  v_sales_card numeric := coalesce(nullif(p->>'sales_card', '')::numeric, 0);
  v_collection numeric := coalesce(nullif(p->>'collection_sum', '')::numeric, 0);
  v_actual numeric := coalesce(nullif(p->>'actual_cash', '')::numeric, 0);
  v_comment text := nullif(btrim(p->>'comment'), '');
  v_close timestamptz := coalesce(nullif(p->>'closed_at', '')::timestamptz, now());
  v_cat_shift uuid;
  v_cat_adj uuid;
  v_card uuid;
  v_safe uuid;
  v_book numeric;
  v_diff numeric;
  v_adj_type text;
begin
  if v_id is null then perform public.erp_raise('ERP_INVALID', 'id'); end if;
  select * into v from public.erp_finance_shifts where id = v_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  select id into v_cat_shift from public.erp_finance_categories where code = 'cash_shifts' and deleted_at is null;
  select id into v_cat_adj from public.erp_finance_categories where code = 'adjustment' and deleted_at is null;
  select id into v_card from public.erp_finance_accounts where system_role = 'acquiring' and deleted_at is null;
  select id into v_safe from public.erp_finance_accounts where system_role = 'safe' and deleted_at is null;

  update public.erp_finance_shifts set
    sales_cash = v_sales_cash, sales_card = v_sales_card, collection_sum = v_collection, actual_cash = v_actual,
    comment = coalesce(v_comment, comment), closed_at = v_close, closed_by = v_actor, status = 'closed',
    updated_at = now(), updated_by = v_actor
  where id = v_id;

  perform public.erp_finance_upsert_auto_tx('shift', v_id, 'sales_cash', 'income', v_sales_cash, v.account_id, null, v_cat_shift, v_close, v_id, 'Выручка наличными', v_actor);
  if v_card is not null then
    perform public.erp_finance_upsert_auto_tx('shift', v_id, 'sales_card', 'income', v_sales_card, v_card, null, v_cat_shift, v_close, v_id, 'Выручка безналичная', v_actor);
  end if;
  if v_safe is not null then
    perform public.erp_finance_upsert_auto_tx('shift', v_id, 'collection', 'transfer', v_collection, v.account_id, v_safe, null, v_close, v_id, 'Инкассация', v_actor);
  end if;

  select v.opening_cash + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = v.account_id then t.amount
      when t.type = 'expense' and t.account_id = v.account_id then -t.amount
      when t.type = 'transfer' and t.account_id = v.account_id then -t.amount
      when t.type = 'transfer' and t.to_account_id = v.account_id then t.amount
      else 0
    end
  ), 0)
  into v_book
  from public.erp_finance_transactions t
  where t.deleted_at is null and t.auto_kind is distinct from 'adjustment'
    and (
      t.shift_id = v_id
      or (t.shift_id is null and t.occurred_at >= v.opened_at and t.occurred_at <= v_close
          and (t.account_id = v.account_id or t.to_account_id = v.account_id))
    );

  v_diff := round(v_actual - coalesce(v_book, v.opening_cash), 2);
  v_adj_type := case when v_diff >= 0 then 'income' else 'expense' end;
  perform public.erp_finance_upsert_auto_tx(
    'adjustment', v_id, 'adjustment', v_adj_type, abs(v_diff), v.account_id, null, v_cat_adj, v_close, v_id, 'Актуализация кассовой смены', v_actor
  );
  perform public.erp_audit(v_actor, 'finance_shift', v_id, 'close');
  return v_id;
end;
$$;

create or replace function public.erp_save_finance_employee(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_role text := nullif(btrim(p->>'role'), '');
  v_type text := coalesce(nullif(p->>'pay_type', ''), 'monthly');
  v_rate numeric := coalesce(nullif(p->>'rate', '')::numeric, 0);
  v_archived boolean := coalesce((p->>'archived')::boolean, false);
begin
  if length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_type not in ('monthly', 'hourly', 'shift', 'percent') then perform public.erp_raise('ERP_INVALID', 'pay_type'); end if;
  if v_id is null then
    insert into public.erp_finance_employees (name, role, pay_type, rate, created_by, updated_by)
    values (v_name, v_role, v_type, v_rate, v_actor, v_actor)
    returning id into v_id;
    perform public.erp_audit(v_actor, 'finance_employee', v_id, 'create');
    return v_id;
  end if;
  perform 1 from public.erp_finance_employees where id = v_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  update public.erp_finance_employees set
    name = v_name, role = v_role, pay_type = v_type, rate = v_rate,
    archived_at = case when v_archived then coalesce(archived_at, now()) else null end,
    updated_at = now(), updated_by = v_actor
  where id = v_id;
  perform public.erp_audit(v_actor, 'finance_employee', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_save_finance_payroll(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_emp uuid := nullif(p->>'employee_id', '')::uuid;
  v_from date := nullif(p->>'period_start', '')::date;
  v_to date := nullif(p->>'period_end', '')::date;
  v_hours numeric := nullif(p->>'hours', '')::numeric;
  v_amount numeric := coalesce(nullif(p->>'amount', '')::numeric, 0);
  v_account uuid := nullif(p->>'account_id', '')::uuid;
  v_comment text := nullif(btrim(p->>'comment'), '');
  v_emp_row public.erp_finance_employees;
begin
  if v_emp is null then perform public.erp_raise('ERP_INVALID', 'employee_id'); end if;
  select * into v_emp_row from public.erp_finance_employees where id = v_emp;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'employee'); end if;
  if v_from is null or v_to is null then perform public.erp_raise('ERP_INVALID', 'period'); end if;
  if v_amount <= 0 then
    v_amount := case
      when v_emp_row.pay_type = 'hourly' then round(v_emp_row.rate * coalesce(v_hours, 0), 2)
      else v_emp_row.rate
    end;
  end if;
  if v_id is null then
    insert into public.erp_finance_payroll (
      employee_id, period_start, period_end, hours, amount, account_id, comment, created_by, updated_by
    ) values (v_emp, v_from, v_to, v_hours, v_amount, v_account, v_comment, v_actor, v_actor)
    returning id into v_id;
  else
    perform 1 from public.erp_finance_payroll where id = v_id and paid_at is null for update;
    if not found then perform public.erp_raise('ERP_FINANCE_LOCKED'); end if;
    update public.erp_finance_payroll set
      employee_id = v_emp, period_start = v_from, period_end = v_to, hours = v_hours, amount = v_amount,
      account_id = v_account, comment = v_comment, updated_at = now(), updated_by = v_actor
    where id = v_id;
  end if;
  perform public.erp_audit(v_actor, 'finance_payroll', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_pay_finance_payroll(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v public.erp_finance_payroll;
  v_emp public.erp_finance_employees;
  v_account uuid := nullif(p->>'account_id', '')::uuid;
  v_when timestamptz := coalesce(nullif(p->>'paid_at', '')::timestamptz, now());
  v_cat uuid;
  v_tx uuid;
begin
  select * into v from public.erp_finance_payroll where id = v_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.paid_at is not null then perform public.erp_raise('ERP_FINANCE_LOCKED'); end if;
  select * into v_emp from public.erp_finance_employees where id = v.employee_id;
  v_account := coalesce(v_account, v.account_id);
  if v_account is null then perform public.erp_raise('ERP_INVALID', 'account_id'); end if;
  select id into v_cat from public.erp_finance_categories where code = 'salary' and deleted_at is null;
  if v_cat is null then perform public.erp_raise('ERP_INVALID', 'salary_category'); end if;
  v_tx := public.erp_finance_upsert_auto_tx(
    'payroll', v_id, 'payroll', 'expense', v.amount, v_account, null, v_cat, v_when, null,
    coalesce(v.comment, 'Зарплата: ' || v_emp.name), v_actor
  );
  update public.erp_finance_transactions set deal_at = v.period_end where id = v_tx;
  update public.erp_finance_payroll set
    account_id = v_account, paid_at = v_when, transaction_id = v_tx, updated_at = now(), updated_by = v_actor
  where id = v_id;
  perform public.erp_audit(v_actor, 'finance_payroll', v_id, 'pay');
  return v_id;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'erp_load_state'
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'erp_load_state_core'
  ) then
    alter function public.erp_load_state(text) rename to erp_load_state_core;
  end if;
end $$;

create or replace function public.erp_load_state(p_parts text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  want text[];
  out jsonb := '{}'::jsonb;
begin
  want := string_to_array(nullif(btrim(coalesce(p_parts, '')), ''), ',');
  if to_regprocedure('public.erp_load_state_core(text)') is not null then
    out := coalesce(public.erp_load_state_core(p_parts), '{}'::jsonb);
  end if;

  if want is null or 'financeAccounts' = any(want) then
    out := out || jsonb_build_object(
      'financeAccounts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_accounts r)
    );
  end if;
  if want is null or 'financeCategories' = any(want) then
    out := out || jsonb_build_object(
      'financeCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_categories r)
    );
  end if;
  if want is null or 'financeTransactions' = any(want) then
    out := out || jsonb_build_object(
      'financeTransactions',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc), '[]'::jsonb)
        from (select * from public.erp_finance_transactions order by occurred_at desc limit 10000) r
      )
    );
  end if;
  if want is null or 'financeShifts' = any(want) then
    out := out || jsonb_build_object(
      'financeShifts',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.opened_at desc), '[]'::jsonb)
        from (select * from public.erp_finance_shifts order by opened_at desc limit 2000) r
      )
    );
  end if;
  if want is null or 'financeEmployees' = any(want) then
    out := out || jsonb_build_object(
      'financeEmployees',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from public.erp_finance_employees r)
    );
  end if;
  if want is null or 'financePayroll' = any(want) then
    out := out || jsonb_build_object(
      'financePayroll',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
        from (select * from public.erp_finance_payroll order by period_end desc limit 2000) r
      )
    );
  end if;
  return out;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_finance_need_actor', 'erp_finance_purge_trash', 'erp_save_finance_account',
             'erp_delete_finance_account', 'erp_restore_finance_account', 'erp_save_finance_category',
             'erp_delete_finance_category', 'erp_save_finance_transaction', 'erp_delete_finance_transaction',
             'erp_restore_finance_transaction', 'erp_finance_upsert_auto_tx', 'erp_save_finance_shift',
             'erp_close_finance_shift', 'erp_save_finance_employee', 'erp_save_finance_payroll',
             'erp_pay_finance_payroll', 'erp_load_state', 'erp_load_state_core'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
