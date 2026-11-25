-- Phase 4: independent Input / Output VAT exceptions (item > category > default).
-- Additive evolution of erp_vat_exceptions. Existing rows become direction=input.
-- Does NOT recalculate posted documents. Does NOT alter FIFO / lots / production / P&L.

-- ---------------------------------------------------------------------------
-- Evolve erp_vat_exceptions: direction, scopes, effective dates, optional tax_rate_id
-- ---------------------------------------------------------------------------

alter table public.erp_vat_exceptions
  add column if not exists id uuid,
  add column if not exists direction text,
  add column if not exists scope_kind text,
  add column if not exists category_id uuid,
  add column if not exists dish_id uuid,
  add column if not exists tax_rate_id uuid,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists note text;

update public.erp_vat_exceptions
set
  id = coalesce(id, gen_random_uuid()),
  direction = coalesce(nullif(direction, ''), 'input'),
  scope_kind = coalesce(nullif(scope_kind, ''), 'product'),
  effective_from = coalesce(effective_from, (timezone('Asia/Ho_Chi_Minh', now()))::date)
where id is null
   or direction is null
   or scope_kind is null
   or effective_from is null;

alter table public.erp_vat_exceptions
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column direction set default 'input',
  alter column direction set not null,
  alter column scope_kind set default 'product',
  alter column scope_kind set not null,
  alter column effective_from set default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  alter column effective_from set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_direction_check'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_direction_check
      check (direction in ('input', 'output'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_scope_kind_check'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_scope_kind_check
      check (scope_kind in ('product', 'dish', 'category'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_effective_range'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_effective_range
      check (effective_to is null or effective_to >= effective_from);
  end if;
end $$;

-- Replace product_id PK with id PK (keep product_id as FK, nullable for category/dish rows).
do $$
declare
  pk_name text;
begin
  select c.conname into pk_name
  from pg_constraint c
  where c.conrelid = 'public.erp_vat_exceptions'::regclass and c.contype = 'p'
  limit 1;
  if pk_name is not null and pk_name <> 'erp_vat_exceptions_pkey_id' then
    execute format('alter table public.erp_vat_exceptions drop constraint %I', pk_name);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_pkey_id'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions add constraint erp_vat_exceptions_pkey_id primary key (id);
  end if;
exception
  when others then
    -- If concurrent apply already moved PK, continue.
    null;
end $$;

-- product_id may be null for category/dish scopes; drop NOT NULL if present.
do $$
begin
  alter table public.erp_vat_exceptions alter column product_id drop not null;
exception
  when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_category_fk'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_category_fk
      foreign key (category_id) references public.erp_categories (id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vat_exceptions_dish_fk'
      and conrelid = 'public.erp_vat_exceptions'::regclass
  ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_dish_fk
      foreign key (dish_id) references public.erp_dishes (id) on delete cascade;
  end if;
  if to_regclass('public.erp_tax_rates') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'erp_vat_exceptions_tax_rate_fk'
         and conrelid = 'public.erp_vat_exceptions'::regclass
     ) then
    alter table public.erp_vat_exceptions
      add constraint erp_vat_exceptions_tax_rate_fk
      foreign key (tax_rate_id) references public.erp_tax_rates (id);
  end if;
end $$;

-- One open-ended exception per direction+target.
create unique index if not exists erp_vat_exceptions_input_product_uidx
  on public.erp_vat_exceptions (direction, product_id)
  where scope_kind = 'product' and product_id is not null and effective_to is null;

create unique index if not exists erp_vat_exceptions_input_dish_uidx
  on public.erp_vat_exceptions (direction, dish_id)
  where scope_kind = 'dish' and dish_id is not null and effective_to is null;

create unique index if not exists erp_vat_exceptions_input_category_uidx
  on public.erp_vat_exceptions (direction, category_id)
  where scope_kind = 'category' and category_id is not null and effective_to is null;

create index if not exists erp_vat_exceptions_direction_scope_idx
  on public.erp_vat_exceptions (direction, scope_kind, effective_from);

comment on table public.erp_vat_exceptions is
  'VAT rate exceptions by direction (input/output). Priority: item (product/dish) > category > company default. Existing rows are input/product.';
comment on column public.erp_vat_exceptions.direction is
  'input = purchase/ingredient VAT; output = sales/menu VAT. Fully independent.';
comment on column public.erp_vat_exceptions.scope_kind is
  'product | dish | category. Input typically product/category; output dish/product/category.';

-- ---------------------------------------------------------------------------
-- History journal
-- ---------------------------------------------------------------------------

create table if not exists public.erp_vat_exception_history (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid,
  direction text not null,
  scope_kind text not null,
  product_id uuid,
  dish_id uuid,
  category_id uuid,
  vat_rate numeric(5,2) not null,
  tax_rate_id uuid,
  effective_from date,
  effective_to date,
  change_kind text not null check (change_kind in ('create', 'update', 'delete', 'deactivate')),
  changed_at timestamptz not null default now(),
  changed_by text,
  snapshot jsonb not null default '{}'::jsonb
);

comment on table public.erp_vat_exception_history is
  'Immutable journal of VAT exception changes. Posted documents are never auto-recalculated.';

create index if not exists erp_vat_exception_history_changed_idx
  on public.erp_vat_exception_history (changed_at desc);

alter table public.erp_vat_exception_history enable row level security;
revoke all on public.erp_vat_exception_history from public, anon, authenticated;
grant all on public.erp_vat_exception_history to service_role;

-- Seed history for pre-existing exceptions that have none yet.
insert into public.erp_vat_exception_history (
  exception_id, direction, scope_kind, product_id, dish_id, category_id,
  vat_rate, tax_rate_id, effective_from, effective_to, change_kind, changed_by, snapshot
)
select
  e.id, e.direction, e.scope_kind, e.product_id, e.dish_id, e.category_id,
  e.vat_rate, e.tax_rate_id, e.effective_from, e.effective_to, 'create', coalesce(e.updated_by, 'migrate'),
  to_jsonb(e)
from public.erp_vat_exceptions e
where not exists (
  select 1 from public.erp_vat_exception_history h where h.exception_id = e.id
);

-- ---------------------------------------------------------------------------
-- Effective-as-of helper
-- ---------------------------------------------------------------------------

create or replace function public.erp_vat_exception_active_on(p_from date, p_to date, p_on date)
returns boolean
language sql
immutable
as $$
  select p_from <= p_on and (p_to is null or p_to >= p_on);
$$;

-- Replace legacy single-arg function with optional as-of date (posted docs still pass product only).
drop function if exists public.erp_effective_input_vat_rate(uuid);
drop function if exists public.erp_effective_input_vat_rate(uuid, date);

create or replace function public.erp_effective_input_vat_rate(p_product uuid, p_on date default null)
returns numeric
language plpgsql
stable
as $$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_rate numeric;
  v_cat uuid;
begin
  -- 1) product item exception
  select e.vat_rate into v_rate
  from public.erp_vat_exceptions e
  where e.direction = 'input'
    and e.scope_kind = 'product'
    and e.product_id = p_product
    and public.erp_vat_exception_active_on(e.effective_from, e.effective_to, v_on)
  order by e.effective_from desc
  limit 1;
  if v_rate is not null then return v_rate; end if;

  -- 2) category exception
  select p.category_id into v_cat from public.erp_products p where p.id = p_product;
  if v_cat is not null then
    select e.vat_rate into v_rate
    from public.erp_vat_exceptions e
    where e.direction = 'input'
      and e.scope_kind = 'category'
      and e.category_id = v_cat
      and public.erp_vat_exception_active_on(e.effective_from, e.effective_to, v_on)
    order by e.effective_from desc
    limit 1;
    if v_rate is not null then return v_rate; end if;
  end if;

  -- 3) company default
  return coalesce(
    (select s.default_input_vat_rate from public.erp_settings s where s.id = 1),
    8
  );
end;
$$;

create or replace function public.erp_effective_output_vat_rate(
  p_dish uuid default null,
  p_product uuid default null,
  p_on date default null
)
returns numeric
language plpgsql
stable
as $$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_rate numeric;
  v_cat uuid;
  v_dish_rate numeric;
begin
  -- 1a) dish item exception
  if p_dish is not null then
    select e.vat_rate into v_rate
    from public.erp_vat_exceptions e
    where e.direction = 'output'
      and e.scope_kind = 'dish'
      and e.dish_id = p_dish
      and public.erp_vat_exception_active_on(e.effective_from, e.effective_to, v_on)
    order by e.effective_from desc
    limit 1;
    if v_rate is not null then return v_rate; end if;

    -- Legacy dish.vat_rate acts as item-level override when no exception row.
    select d.vat_rate, d.category_id into v_dish_rate, v_cat
    from public.erp_dishes d where d.id = p_dish;
    if v_dish_rate is not null then return v_dish_rate; end if;
  end if;

  -- 1b) product item exception (sellable goods / modifiers)
  if p_product is not null then
    select e.vat_rate into v_rate
    from public.erp_vat_exceptions e
    where e.direction = 'output'
      and e.scope_kind = 'product'
      and e.product_id = p_product
      and public.erp_vat_exception_active_on(e.effective_from, e.effective_to, v_on)
    order by e.effective_from desc
    limit 1;
    if v_rate is not null then return v_rate; end if;
    select p.category_id into v_cat from public.erp_products p where p.id = p_product;
  end if;

  -- 2) category exception (menu / product category)
  if v_cat is not null then
    select e.vat_rate into v_rate
    from public.erp_vat_exceptions e
    where e.direction = 'output'
      and e.scope_kind = 'category'
      and e.category_id = v_cat
      and public.erp_vat_exception_active_on(e.effective_from, e.effective_to, v_on)
    order by e.effective_from desc
    limit 1;
    if v_rate is not null then return v_rate; end if;
  end if;

  -- 3) company default output
  return coalesce(
    (select s.default_output_vat_rate from public.erp_settings s where s.id = 1),
    8
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Save / delete with history + audit
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_vat_exception(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_direction text := coalesce(
    nullif(btrim(p->>'direction'), ''),
    nullif(btrim(p->>'vat_direction'), ''),
    'input'
  );
  v_scope text := coalesce(
    nullif(btrim(p->>'scope_kind'), ''),
    nullif(btrim(p->>'scope'), ''),
    'product'
  );
  v_product uuid := nullif(p->>'product_id', '')::uuid;
  v_dish uuid := nullif(p->>'dish_id', '')::uuid;
  v_category uuid := nullif(p->>'category_id', '')::uuid;
  v_rate numeric := nullif(p->>'vat_rate', '')::numeric;
  v_tax_id uuid := nullif(p->>'tax_rate_id', '')::uuid;
  v_from date := coalesce(nullif(p->>'effective_from', '')::date, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_to date := nullif(p->>'effective_to', '')::date;
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_default numeric;
  v_old public.erp_vat_exceptions;
  v_kind text;
begin
  if v_direction not in ('input', 'output') then perform public.erp_raise('ERP_INVALID', 'direction'); end if;
  if v_scope not in ('product', 'dish', 'category') then perform public.erp_raise('ERP_INVALID', 'scope_kind'); end if;
  if v_rate is null or v_rate not in (0, 5, 8, 10) then perform public.erp_raise('ERP_INVALID', 'vat_rate'); end if;
  if v_to is not null and v_to < v_from then perform public.erp_raise('ERP_INVALID', 'effective_to'); end if;

  if v_scope = 'product' then
    if v_product is null then perform public.erp_raise('ERP_INVALID', 'product_id'); end if;
    if not exists (select 1 from public.erp_products where id = v_product) then
      perform public.erp_raise('ERP_NOT_FOUND', 'product');
    end if;
    v_dish := null; v_category := null;
  elsif v_scope = 'dish' then
    if v_direction <> 'output' then perform public.erp_raise('ERP_INVALID', 'scope_kind'); end if;
    if v_dish is null then perform public.erp_raise('ERP_INVALID', 'dish_id'); end if;
    if not exists (select 1 from public.erp_dishes where id = v_dish) then
      perform public.erp_raise('ERP_NOT_FOUND', 'dish');
    end if;
    v_product := null; v_category := null;
  else
    if v_category is null then perform public.erp_raise('ERP_INVALID', 'category_id'); end if;
    if not exists (select 1 from public.erp_categories where id = v_category) then
      perform public.erp_raise('ERP_NOT_FOUND', 'category');
    end if;
    v_product := null; v_dish := null;
  end if;

  if v_tax_id is not null and to_regclass('public.erp_tax_rates') is not null then
    if not exists (select 1 from public.erp_tax_rates where id = v_tax_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'tax_rate_id');
    end if;
  end if;

  select case when v_direction = 'input'
              then coalesce(default_input_vat_rate, 8)
              else coalesce(default_output_vat_rate, 8)
         end
    into v_default
  from public.erp_settings where id = 1;
  if v_rate = v_default then perform public.erp_raise('ERP_INVALID', 'vat_rate'); end if;

  if v_id is null then
    -- Upsert open-ended row for the same target.
    select * into v_old
    from public.erp_vat_exceptions e
    where e.direction = v_direction
      and e.scope_kind = v_scope
      and e.effective_to is null
      and (
        (v_scope = 'product' and e.product_id = v_product)
        or (v_scope = 'dish' and e.dish_id = v_dish)
        or (v_scope = 'category' and e.category_id = v_category)
      )
    for update;
  else
    select * into v_old from public.erp_vat_exceptions where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'vat_exception'); end if;
  end if;

  if v_old.id is not null then
    v_id := v_old.id;
    v_kind := 'update';
    update public.erp_vat_exceptions set
      direction = v_direction,
      scope_kind = v_scope,
      product_id = v_product,
      dish_id = v_dish,
      category_id = v_category,
      vat_rate = v_rate,
      tax_rate_id = coalesce(v_tax_id, tax_rate_id),
      effective_from = v_from,
      effective_to = case when p ? 'effective_to' then v_to else effective_to end,
      note = case when p ? 'note' then v_note else note end,
      updated_at = now(),
      updated_by = p_actor
    where id = v_id
    returning * into v_old;
  else
    v_kind := 'create';
    insert into public.erp_vat_exceptions (
      direction, scope_kind, product_id, dish_id, category_id,
      vat_rate, tax_rate_id, effective_from, effective_to, note, updated_by
    ) values (
      v_direction, v_scope, v_product, v_dish, v_category,
      v_rate, v_tax_id, v_from, v_to, v_note, p_actor
    )
    returning * into v_old;
    v_id := v_old.id;
  end if;

  insert into public.erp_vat_exception_history (
    exception_id, direction, scope_kind, product_id, dish_id, category_id,
    vat_rate, tax_rate_id, effective_from, effective_to, change_kind, changed_by, snapshot
  ) values (
    v_id, v_old.direction, v_old.scope_kind, v_old.product_id, v_old.dish_id, v_old.category_id,
    v_old.vat_rate, v_old.tax_rate_id, v_old.effective_from, v_old.effective_to, v_kind, p_actor, to_jsonb(v_old)
  );
  perform public.erp_audit(p_actor, 'vat_exception', v_id, v_kind, null, p);
  return v_id;
end;
$$;

-- Backward-compatible delete by product_id (input/product). Also accepts p_id.
create or replace function public.erp_delete_vat_exception(p_product uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_old public.erp_vat_exceptions;
begin
  if p_product is null then perform public.erp_raise('ERP_INVALID', 'product_id'); end if;
  select * into v_old
  from public.erp_vat_exceptions
  where direction = 'input' and scope_kind = 'product' and product_id = p_product
  for update;
  if not found then
    -- Also allow delete by exception id passed in the product slot (legacy callers use product PK).
    select * into v_old from public.erp_vat_exceptions where id = p_product for update;
  end if;
  if not found then return; end if;

  insert into public.erp_vat_exception_history (
    exception_id, direction, scope_kind, product_id, dish_id, category_id,
    vat_rate, tax_rate_id, effective_from, effective_to, change_kind, changed_by, snapshot
  ) values (
    v_old.id, v_old.direction, v_old.scope_kind, v_old.product_id, v_old.dish_id, v_old.category_id,
    v_old.vat_rate, v_old.tax_rate_id, v_old.effective_from, v_old.effective_to, 'delete', p_actor, to_jsonb(v_old)
  );
  delete from public.erp_vat_exceptions where id = v_old.id;
  perform public.erp_audit(p_actor, 'vat_exception', v_old.id, 'delete');
end;
$$;

create or replace function public.erp_delete_vat_exception_id(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_old public.erp_vat_exceptions;
begin
  if p_id is null then perform public.erp_raise('ERP_INVALID', 'id'); end if;
  select * into v_old from public.erp_vat_exceptions where id = p_id for update;
  if not found then return; end if;
  insert into public.erp_vat_exception_history (
    exception_id, direction, scope_kind, product_id, dish_id, category_id,
    vat_rate, tax_rate_id, effective_from, effective_to, change_kind, changed_by, snapshot
  ) values (
    v_old.id, v_old.direction, v_old.scope_kind, v_old.product_id, v_old.dish_id, v_old.category_id,
    v_old.vat_rate, v_old.tax_rate_id, v_old.effective_from, v_old.effective_to, 'delete', p_actor, to_jsonb(v_old)
  );
  delete from public.erp_vat_exceptions where id = v_old.id;
  perform public.erp_audit(p_actor, 'vat_exception', v_old.id, 'delete');
end;
$$;

-- Settings save: clean matching exceptions per direction only (preserve opposite direction).
-- Requires Phase 3 columns on erp_settings.
create or replace function public.erp_save_settings(p jsonb, p_actor text)
returns void
language plpgsql
as $$
declare
  v_in numeric;
  v_out numeric;
  v_method text;
  v_in_id uuid;
  v_out_id uuid;
begin
  if p ? 'default_input_vat_rate' and nullif(p->>'default_input_vat_rate', '') is not null then
    v_in := (p->>'default_input_vat_rate')::numeric;
    if not public.erp_tax_rate_is_legacy_percent(v_in) then
      perform public.erp_raise('ERP_INVALID', 'default_input_vat_rate');
    end if;
  end if;
  if p ? 'default_output_vat_rate' and nullif(p->>'default_output_vat_rate', '') is not null then
    v_out := (p->>'default_output_vat_rate')::numeric;
    if not public.erp_tax_rate_is_legacy_percent(v_out) then
      perform public.erp_raise('ERP_INVALID', 'default_output_vat_rate');
    end if;
  end if;
  if p ? 'vat_accounting_method' then
    v_method := nullif(btrim(p->>'vat_accounting_method'), '');
    if v_method is not null and v_method not in ('cash', 'accrual', 'hybrid', 'unconfirmed') then
      perform public.erp_raise('ERP_INVALID', 'vat_accounting_method');
    end if;
  end if;
  if p ? 'default_input_tax_rate_id' and nullif(p->>'default_input_tax_rate_id', '') is not null then
    v_in_id := (p->>'default_input_tax_rate_id')::uuid;
    if not exists (select 1 from public.erp_tax_rates where id = v_in_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_input_tax_rate_id');
    end if;
  end if;
  if p ? 'default_output_tax_rate_id' and nullif(p->>'default_output_tax_rate_id', '') is not null then
    v_out_id := (p->>'default_output_tax_rate_id')::uuid;
    if not exists (select 1 from public.erp_tax_rates where id = v_out_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_output_tax_rate_id');
    end if;
  end if;

  update public.erp_settings set
    input_vat_enabled = coalesce((p->>'input_vat_enabled')::boolean, input_vat_enabled),
    output_vat_enabled = coalesce((p->>'output_vat_enabled')::boolean, output_vat_enabled),
    default_input_vat_rate = case when p ? 'default_input_vat_rate'
                                  then coalesce(nullif(p->>'default_input_vat_rate', '')::numeric, 8)
                                  else default_input_vat_rate end,
    default_output_vat_rate = case when p ? 'default_output_vat_rate'
                                  then coalesce(nullif(p->>'default_output_vat_rate', '')::numeric, 8)
                                  else default_output_vat_rate end,
    vat_accounting_method = case when p ? 'vat_accounting_method' then v_method else vat_accounting_method end,
    purchase_prices_include_vat_default = case
      when p ? 'purchase_prices_include_vat_default'
        then coalesce((p->>'purchase_prices_include_vat_default')::boolean, purchase_prices_include_vat_default)
      else purchase_prices_include_vat_default
    end,
    default_input_tax_rate_id = case
      when p ? 'default_input_tax_rate_id' then v_in_id
      when p ? 'default_input_vat_rate' then public.erp_resolve_tax_rate_id(
        coalesce(nullif(p->>'default_input_vat_rate', '')::numeric, 8), 'standard'
      )
      else default_input_tax_rate_id
    end,
    default_output_tax_rate_id = case
      when p ? 'default_output_tax_rate_id' then v_out_id
      when p ? 'default_output_vat_rate' then public.erp_resolve_tax_rate_id(
        coalesce(nullif(p->>'default_output_vat_rate', '')::numeric, 8), 'standard'
      )
      else default_output_tax_rate_id
    end,
    updated_by = p_actor,
    updated_at = now()
  where id = 1;

  delete from public.erp_vat_exceptions e
  using public.erp_settings s
  where s.id = 1
    and e.direction = 'input'
    and e.vat_rate is not distinct from coalesce(s.default_input_vat_rate, 8);
  delete from public.erp_vat_exceptions e
  using public.erp_settings s
  where s.id = 1
    and e.direction = 'output'
    and e.vat_rate is not distinct from coalesce(s.default_output_vat_rate, 8);

  perform public.erp_audit(p_actor, 'settings', null, 'save', null, p);
end;
$$;

-- load_state: still dual-path; include all exception columns (direction etc.).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'erp_load_state'
  ) and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'erp_load_state_inner'
  ) then
    alter function public.erp_load_state(text) rename to erp_load_state_inner;
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
  if to_regprocedure('public.erp_load_state_inner(text)') is not null then
    out := coalesce(public.erp_load_state_inner(p_parts), '{}'::jsonb);
  elsif to_regprocedure('public.erp_load_state_core(text)') is not null then
    out := coalesce(public.erp_load_state_core(p_parts), '{}'::jsonb);
  end if;
  if to_regclass('public.erp_vat_exceptions') is not null and (want is null or 'vatExceptions' = any(want)) then
    out := out || jsonb_build_object(
      'vatExceptions',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.direction, r.scope_kind, coalesce(r.product_id::text, r.dish_id::text, r.category_id::text)), '[]'::jsonb)
        from public.erp_vat_exceptions r
      )
    );
  end if;
  if to_regclass('public.erp_tax_rates') is not null and (want is null or 'taxRates' = any(want)) then
    out := out || jsonb_build_object(
      'taxRates',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.rate, r.code), '[]'::jsonb)
        from public.erp_tax_rates r
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
             'erp_vat_exception_active_on',
             'erp_effective_input_vat_rate',
             'erp_effective_output_vat_rate',
             'erp_save_vat_exception',
             'erp_delete_vat_exception',
             'erp_delete_vat_exception_id',
             'erp_save_settings',
             'erp_load_state',
             'erp_load_state_inner',
             'erp_load_state_core'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
