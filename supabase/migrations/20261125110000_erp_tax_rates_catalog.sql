-- Phase 3 (Release 1): tax rates catalog, tax settings fields, history foundation.
-- Additive only. Does not recalculate posted documents. Does not alter exception CHECK (0/5/8/10).
--
-- Semantics retained:
--   erp_settings.output_vat_enabled = Sales Prices Include VAT (menu prices include VAT).
-- New fields:
--   vat_accounting_method (nullable until accountant confirms)
--   purchase_prices_include_vat_default (company default for purchase docs)

-- ---------------------------------------------------------------------------
-- Catalog: erp_tax_rates
-- ---------------------------------------------------------------------------

create table if not exists public.erp_tax_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  name_vn text not null default '',
  rate numeric(7,4) not null check (rate >= 0 and rate <= 100),
  tax_treatment text not null check (tax_treatment in ('standard', 'exempt', 'not_subject')),
  effective_from date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  effective_to date,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint erp_tax_rates_effective_range check (effective_to is null or effective_to >= effective_from)
);

comment on table public.erp_tax_rates is
  'Company tax-rate catalog. 0% standard, VAT Exempt, and Not Subject are distinct rows — never merge them.';
comment on column public.erp_tax_rates.tax_treatment is
  'standard = percentage VAT; exempt = VAT Exempt; not_subject = Not Subject To VAT Declaration.';
comment on column public.erp_tax_rates.effective_from is
  'Inclusive start of this rate version (R1 history foundation).';
comment on column public.erp_tax_rates.effective_to is
  'Inclusive end when set; null means open-ended.';

create index if not exists erp_tax_rates_active_sort_idx
  on public.erp_tax_rates (is_active, sort, rate);

-- ---------------------------------------------------------------------------
-- History: erp_tax_rate_history (+ audit via erp_audit on save)
-- ---------------------------------------------------------------------------

create table if not exists public.erp_tax_rate_history (
  id uuid primary key default gen_random_uuid(),
  tax_rate_id uuid not null references public.erp_tax_rates (id) on delete cascade,
  code text not null,
  name text not null,
  name_vn text not null default '',
  rate numeric(7,4) not null,
  tax_treatment text not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null,
  sort integer not null,
  change_kind text not null check (change_kind in ('create', 'update', 'deactivate')),
  changed_at timestamptz not null default now(),
  changed_by text,
  snapshot jsonb not null default '{}'::jsonb
);

comment on table public.erp_tax_rate_history is
  'Immutable snapshots of tax-rate changes for R1 history (effective dates + journal). Posted docs are never auto-recalculated.';

create index if not exists erp_tax_rate_history_rate_changed_idx
  on public.erp_tax_rate_history (tax_rate_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Seeds (idempotent by code). Do NOT merge 0% with Exempt.
-- ---------------------------------------------------------------------------

insert into public.erp_tax_rates (code, name, name_vn, rate, tax_treatment, sort, updated_by)
values
  ('vat-0', '0%', '0%', 0, 'standard', 10, 'seed'),
  ('vat-5', '5%', '5%', 5, 'standard', 20, 'seed'),
  ('vat-8', '8%', '8%', 8, 'standard', 30, 'seed'),
  ('vat-10', '10%', '10%', 10, 'standard', 40, 'seed'),
  ('vat-exempt', 'VAT Exempt', 'Miễn thuế GTGT', 0, 'exempt', 50, 'seed'),
  ('vat-not-subject', 'Not Subject To VAT Declaration', 'Không thuộc diện kê khai thuế GTGT', 0, 'not_subject', 60, 'seed')
on conflict (code) do nothing;

-- Initial history rows for seeded rates that have none yet.
insert into public.erp_tax_rate_history (
  tax_rate_id, code, name, name_vn, rate, tax_treatment,
  effective_from, effective_to, is_active, sort, change_kind, changed_by, snapshot
)
select
  r.id, r.code, r.name, r.name_vn, r.rate, r.tax_treatment,
  r.effective_from, r.effective_to, r.is_active, r.sort, 'create', 'seed', to_jsonb(r)
from public.erp_tax_rates r
where not exists (
  select 1 from public.erp_tax_rate_history h where h.tax_rate_id = r.id
);

-- ---------------------------------------------------------------------------
-- Settings extensions
-- ---------------------------------------------------------------------------

alter table public.erp_settings
  add column if not exists vat_accounting_method text,
  add column if not exists purchase_prices_include_vat_default boolean not null default true,
  add column if not exists default_input_tax_rate_id uuid references public.erp_tax_rates (id),
  add column if not exists default_output_tax_rate_id uuid references public.erp_tax_rates (id);

comment on column public.erp_settings.output_vat_enabled is
  'Sales Prices Include VAT: when true, menu/channel prices are gross (VAT included). Legacy name kept for compatibility.';
comment on column public.erp_settings.vat_accounting_method is
  'Nullable until confirmed by administrator/accountant (e.g. cash, accrual).';
comment on column public.erp_settings.purchase_prices_include_vat_default is
  'Company default for whether purchase/receipt unit prices include VAT. Document-level prices_include_vat still wins.';
comment on column public.erp_settings.default_input_tax_rate_id is
  'Optional FK to erp_tax_rates for default input VAT; numeric default_input_vat_rate remains source of truth for legacy checks.';
comment on column public.erp_settings.default_output_tax_rate_id is
  'Optional FK to erp_tax_rates for default output VAT; numeric default_output_vat_rate remains source of truth for legacy checks.';

-- Wire numeric defaults to standard catalog rows without overwriting an existing FK.
update public.erp_settings s
set
  default_input_tax_rate_id = coalesce(
    s.default_input_tax_rate_id,
    (select r.id from public.erp_tax_rates r
     where r.tax_treatment = 'standard' and r.is_active
       and r.rate = coalesce(s.default_input_vat_rate, 8)
     order by r.sort limit 1)
  ),
  default_output_tax_rate_id = coalesce(
    s.default_output_tax_rate_id,
    (select r.id from public.erp_tax_rates r
     where r.tax_treatment = 'standard' and r.is_active
       and r.rate = coalesce(s.default_output_vat_rate, 8)
     order by r.sort limit 1)
  )
where s.id = 1;

alter table public.erp_tax_rates enable row level security;
alter table public.erp_tax_rate_history enable row level security;
revoke all on public.erp_tax_rates from public, anon, authenticated;
revoke all on public.erp_tax_rate_history from public, anon, authenticated;
grant all on public.erp_tax_rates to service_role;
grant all on public.erp_tax_rate_history to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.erp_tax_rate_is_legacy_percent(p_rate numeric)
returns boolean
language sql
immutable
as $$
  select p_rate is not null and p_rate in (0, 5, 8, 10);
$$;

create or replace function public.erp_resolve_tax_rate_id(p_rate numeric, p_treatment text default 'standard')
returns uuid
language sql
stable
as $$
  select r.id
  from public.erp_tax_rates r
  where r.is_active
    and r.tax_treatment = coalesce(nullif(p_treatment, ''), 'standard')
    and r.rate = p_rate
    and (r.effective_to is null or r.effective_to >= (timezone('Asia/Ho_Chi_Minh', now()))::date)
    and r.effective_from <= (timezone('Asia/Ho_Chi_Minh', now()))::date
  order by r.sort
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Save tax rate (admin) + history row + audit
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_tax_rate(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_old public.erp_tax_rates;
  v_code text := lower(btrim(coalesce(p->>'code', '')));
  v_name text := btrim(coalesce(p->>'name', ''));
  v_name_vn text := coalesce(btrim(p->>'name_vn'), '');
  v_rate numeric := nullif(p->>'rate', '')::numeric;
  v_treatment text := coalesce(nullif(btrim(p->>'tax_treatment'), ''), 'standard');
  v_from date := coalesce(nullif(p->>'effective_from', '')::date, (timezone('Asia/Ho_Chi_Minh', now()))::date);
  v_to date := nullif(p->>'effective_to', '')::date;
  v_active boolean := coalesce((p->>'is_active')::boolean, true);
  v_sort integer := coalesce(nullif(p->>'sort', '')::integer, 100);
  v_kind text;
begin
  if v_treatment not in ('standard', 'exempt', 'not_subject') then
    perform public.erp_raise('ERP_INVALID', 'tax_treatment');
  end if;
  if v_rate is null or v_rate < 0 or v_rate > 100 then
    perform public.erp_raise('ERP_INVALID', 'rate');
  end if;
  if v_name = '' then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_to is not null and v_to < v_from then perform public.erp_raise('ERP_INVALID', 'effective_to'); end if;

  if v_id is null then
    if v_code = '' or v_code !~ '^[a-z0-9][a-z0-9_-]{0,79}$' then
      perform public.erp_raise('ERP_INVALID', 'code');
    end if;
    insert into public.erp_tax_rates (
      code, name, name_vn, rate, tax_treatment, effective_from, effective_to, is_active, sort, updated_by
    ) values (
      v_code, v_name, v_name_vn, v_rate, v_treatment, v_from, v_to, v_active, v_sort, p_actor
    )
    returning * into v_old;
    v_id := v_old.id;
    v_kind := 'create';
  else
    select * into v_old from public.erp_tax_rates where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'tax_rate'); end if;
    -- Seed codes keep identity; code changes only for non-seed custom rows when provided.
    if p ? 'code' and nullif(btrim(p->>'code'), '') is not null
       and lower(btrim(p->>'code')) is distinct from v_old.code
       and v_old.code in ('vat-0', 'vat-5', 'vat-8', 'vat-10', 'vat-exempt', 'vat-not-subject') then
      perform public.erp_raise('ERP_INVALID', 'code');
    end if;
    v_kind := case when v_old.is_active and not v_active then 'deactivate' else 'update' end;
    update public.erp_tax_rates set
      code = case
        when p ? 'code' and nullif(btrim(p->>'code'), '') is not null
          and v_old.code not in ('vat-0', 'vat-5', 'vat-8', 'vat-10', 'vat-exempt', 'vat-not-subject')
          then lower(btrim(p->>'code'))
        else code
      end,
      name = v_name,
      name_vn = v_name_vn,
      rate = v_rate,
      tax_treatment = v_treatment,
      effective_from = v_from,
      effective_to = case when p ? 'effective_to' then v_to else effective_to end,
      is_active = v_active,
      sort = case when p ? 'sort' then v_sort else sort end,
      updated_at = now(),
      updated_by = p_actor
    where id = v_id
    returning * into v_old;
  end if;

  insert into public.erp_tax_rate_history (
    tax_rate_id, code, name, name_vn, rate, tax_treatment,
    effective_from, effective_to, is_active, sort, change_kind, changed_by, snapshot
  ) values (
    v_id, v_old.code, v_old.name, v_old.name_vn, v_old.rate, v_old.tax_treatment,
    v_old.effective_from, v_old.effective_to, v_old.is_active, v_old.sort, v_kind, p_actor, to_jsonb(v_old)
  );
  perform public.erp_audit(p_actor, 'tax_rate', v_id, v_kind, null, p);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings save: new fields + keep legacy rate CHECKs; sync catalog FKs
-- ---------------------------------------------------------------------------

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
    -- Sales Prices Include VAT (documented semantic of output_vat_enabled)
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
  where s.id = 1 and e.vat_rate is not distinct from coalesce(s.default_input_vat_rate, 8);
  perform public.erp_audit(p_actor, 'settings', null, 'save', null, p);
end;
$$;

-- ---------------------------------------------------------------------------
-- load_state: append taxRates (same dual-path pattern as vatExceptions)
-- ---------------------------------------------------------------------------

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
        select coalesce(jsonb_agg(to_jsonb(r) order by r.product_id), '[]'::jsonb)
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
             'erp_tax_rate_is_legacy_percent', 'erp_resolve_tax_rate_id', 'erp_save_tax_rate',
             'erp_save_settings', 'erp_load_state', 'erp_load_state_inner', 'erp_load_state_core'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
