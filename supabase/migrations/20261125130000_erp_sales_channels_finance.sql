-- Phase 5: sales channel finance settings (commission / advertising / margins).
-- Additive only. Keeps commission_pct as legacy. Does NOT change FIFO, lots, costing RPCs, or channelResult.
-- Does NOT auto-split legacy commission into net/VAT/ads. Preliminary Grab seeds are editable in UI.
-- NOT applied to production until Nikita's separate OK.

-- ---------------------------------------------------------------------------
-- Columns on erp_sales_channels
-- ---------------------------------------------------------------------------

alter table public.erp_sales_channels
  add column if not exists legacy_commission_pct numeric(8,4),
  add column if not exists output_vat_rate numeric(5,2),
  add column if not exists selling_price_includes_vat boolean,
  add column if not exists finance_preliminary boolean not null default false,
  -- Commission
  add column if not exists commission_enabled boolean not null default false,
  add column if not exists commission_rate numeric(8,4),
  add column if not exists commission_vat_included boolean not null default false,
  add column if not exists commission_vat_rate numeric(5,2),
  add column if not exists commission_calc_base text,
  add column if not exists commission_vat_deduction_status text,
  add column if not exists commission_deductible_vat_pct numeric(5,2),
  -- Advertising
  add column if not exists advertising_enabled boolean not null default false,
  add column if not exists advertising_scenario text,
  add column if not exists advertising_rate numeric(8,4),
  add column if not exists advertising_vat_included boolean not null default false,
  add column if not exists advertising_vat_rate numeric(5,2),
  add column if not exists advertising_calc_base text,
  add column if not exists advertising_vat_deduction_status text,
  add column if not exists advertising_deductible_vat_pct numeric(5,2),
  add column if not exists advertising_organic_gross_pct numeric(8,4),
  add column if not exists advertising_standard_gross_pct numeric(8,4),
  add column if not exists advertising_full_gross_pct numeric(8,4),
  -- Additional expenses (flags / notes; amounts live on documents later)
  add column if not exists merchant_discounts_enabled boolean not null default false,
  add column if not exists platform_fees_enabled boolean not null default false,
  add column if not exists chargebacks_enabled boolean not null default false,
  add column if not exists financial_adjustments_enabled boolean not null default false,
  add column if not exists additional_expenses_note text,
  -- Margin targets
  add column if not exists min_margin_pct numeric(5,2),
  add column if not exists target_margin_pct numeric(5,2),
  add column if not exists optimal_margin_pct numeric(5,2),
  add column if not exists finance_effective_from date,
  add column if not exists finance_effective_to date,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

-- Snapshot legacy once (never overwrite if already set).
update public.erp_sales_channels
set legacy_commission_pct = commission_pct
where legacy_commission_pct is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_sales_channels_comm_base_check'
      and conrelid = 'public.erp_sales_channels'::regclass
  ) then
    alter table public.erp_sales_channels
      add constraint erp_sales_channels_comm_base_check
      check (
        commission_calc_base is null
        or commission_calc_base in (
          'gross_sales',
          'gross_sales_after_merchant_discounts',
          'net_sales',
          'net_revenue'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'erp_sales_channels_ads_scenario_check'
      and conrelid = 'public.erp_sales_channels'::regclass
  ) then
    alter table public.erp_sales_channels
      add constraint erp_sales_channels_ads_scenario_check
      check (
        advertising_scenario is null
        or advertising_scenario in ('organic', 'standard', 'full', 'custom')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'erp_sales_channels_vat_status_check'
      and conrelid = 'public.erp_sales_channels'::regclass
  ) then
    alter table public.erp_sales_channels
      add constraint erp_sales_channels_vat_status_check
      check (
        (commission_vat_deduction_status is null
          or commission_vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible'))
        and (advertising_vat_deduction_status is null
          or advertising_vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible'))
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'erp_sales_channels_finance_range'
      and conrelid = 'public.erp_sales_channels'::regclass
  ) then
    alter table public.erp_sales_channels
      add constraint erp_sales_channels_finance_range
      check (finance_effective_to is null or finance_effective_from is null or finance_effective_to >= finance_effective_from);
  end if;
end $$;

comment on column public.erp_sales_channels.commission_pct is
  'Legacy Rate: single menu-price commission % used by channelResult until Phase 6. Do not auto-split.';
comment on column public.erp_sales_channels.legacy_commission_pct is
  'Frozen copy of commission_pct at Phase 5 migrate / first finance save. Backward compatibility.';
comment on column public.erp_sales_channels.finance_preliminary is
  'True when Grab-style preliminary October-2026 parameters are in use and not yet contract-confirmed.';
comment on column public.erp_sales_channels.commission_rate is
  'Editable commission rate. If commission_vat_included then treated as gross; else net. Counterpart is computed in app, not stored as independent editable.';
comment on column public.erp_sales_channels.advertising_rate is
  'Editable advertising rate for custom scenario (or active override). Scenario presets store organic/standard/full separately.';

-- ---------------------------------------------------------------------------
-- History (no overlapping open periods per channel)
-- ---------------------------------------------------------------------------

create table if not exists public.erp_sales_channel_finance_history (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.erp_sales_channels (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  changed_at timestamptz not null default now(),
  changed_by text,
  change_kind text not null default 'update' check (change_kind in ('create', 'update', 'deactivate')),
  snapshot jsonb not null default '{}'::jsonb,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists erp_sales_channel_finance_history_channel_idx
  on public.erp_sales_channel_finance_history (channel_id, effective_from desc);

create unique index if not exists erp_sales_channel_finance_history_open_uidx
  on public.erp_sales_channel_finance_history (channel_id)
  where effective_to is null;

comment on table public.erp_sales_channel_finance_history is
  'Versioned finance settings for sales channels. One open-ended row per channel; no overlapping periods.';

alter table public.erp_sales_channel_finance_history enable row level security;

-- ---------------------------------------------------------------------------
-- Seeds: Direct / Grab / Shopee (by code). Does not overwrite commission_pct.
-- ---------------------------------------------------------------------------

-- Direct / Offline
update public.erp_sales_channels set
  output_vat_rate = 8,
  selling_price_includes_vat = true,
  finance_preliminary = false,
  commission_enabled = false,
  commission_rate = 0,
  commission_vat_included = false,
  commission_vat_rate = 8,
  advertising_enabled = false,
  advertising_rate = 0,
  advertising_scenario = 'organic',
  advertising_organic_gross_pct = 0,
  advertising_standard_gross_pct = 0,
  advertising_full_gross_pct = 0,
  min_margin_pct = 60,
  target_margin_pct = 70,
  optimal_margin_pct = 75,
  finance_effective_from = coalesce(finance_effective_from, (timezone('Asia/Ho_Chi_Minh', now()))::date),
  updated_at = now()
where lower(code) in ('direct', 'offline', 'dine-in', 'dine_in')
   or lower(name) in ('direct', 'offline', 'в заведении', 'direct / offline');

-- GrabFood (preliminary)
update public.erp_sales_channels set
  output_vat_rate = 8,
  selling_price_includes_vat = true,
  finance_preliminary = true,
  commission_enabled = true,
  commission_rate = 18.18,
  commission_vat_included = false,
  commission_vat_rate = 8,
  commission_calc_base = 'gross_sales_after_merchant_discounts',
  commission_vat_deduction_status = 'pending',
  commission_deductible_vat_pct = null,
  advertising_enabled = true,
  advertising_scenario = 'standard',
  advertising_rate = 7,
  advertising_vat_included = true,
  advertising_vat_rate = 8,
  advertising_calc_base = 'gross_sales_after_merchant_discounts',
  advertising_vat_deduction_status = 'pending',
  advertising_organic_gross_pct = 0,
  advertising_standard_gross_pct = 7,
  advertising_full_gross_pct = 8,
  merchant_discounts_enabled = true,
  platform_fees_enabled = true,
  chargebacks_enabled = true,
  financial_adjustments_enabled = true,
  min_margin_pct = 40,
  target_margin_pct = 45,
  optimal_margin_pct = 50,
  finance_effective_from = coalesce(finance_effective_from, (timezone('Asia/Ho_Chi_Minh', now()))::date),
  updated_at = now()
where lower(code) like '%grab%'
   or lower(name) like '%grab%';

-- ShopeeFood: structure defaults only — no unconfirmed commission/ads rates
update public.erp_sales_channels set
  output_vat_rate = coalesce(output_vat_rate, 8),
  selling_price_includes_vat = coalesce(selling_price_includes_vat, true),
  finance_preliminary = true,
  commission_enabled = false,
  commission_rate = null,
  commission_vat_rate = coalesce(commission_vat_rate, 8),
  advertising_enabled = false,
  advertising_rate = null,
  advertising_vat_rate = coalesce(advertising_vat_rate, 8),
  advertising_scenario = coalesce(advertising_scenario, 'custom'),
  finance_effective_from = coalesce(finance_effective_from, (timezone('Asia/Ho_Chi_Minh', now()))::date),
  updated_at = now()
where lower(code) like '%shopee%'
   or lower(name) like '%shopee%';

-- Initial history rows for seeded channels (open-ended)
insert into public.erp_sales_channel_finance_history (channel_id, effective_from, changed_by, change_kind, snapshot)
select
  c.id,
  coalesce(c.finance_effective_from, (timezone('Asia/Ho_Chi_Minh', now()))::date),
  'phase5-seed',
  'create',
  to_jsonb(c) - 'id'
from public.erp_sales_channels c
where c.archived_at is null
  and (
    lower(c.code) like '%grab%' or lower(c.name) like '%grab%'
    or lower(c.code) like '%shopee%' or lower(c.name) like '%shopee%'
    or lower(c.code) in ('direct', 'offline', 'dine-in', 'dine_in')
    or lower(c.name) in ('direct', 'offline', 'в заведении', 'direct / offline')
  )
  and not exists (
    select 1 from public.erp_sales_channel_finance_history h
    where h.channel_id = c.id and h.effective_to is null
  );

-- ---------------------------------------------------------------------------
-- Save channel (extended) + history close/open
-- ---------------------------------------------------------------------------

create or replace function public.erp_channel_finance_snapshot(p public.erp_sales_channels)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'name', p.name,
    'commission_pct', p.commission_pct,
    'legacy_commission_pct', p.legacy_commission_pct,
    'output_vat_rate', p.output_vat_rate,
    'selling_price_includes_vat', p.selling_price_includes_vat,
    'finance_preliminary', p.finance_preliminary,
    'commission_enabled', p.commission_enabled,
    'commission_rate', p.commission_rate,
    'commission_vat_included', p.commission_vat_included,
    'commission_vat_rate', p.commission_vat_rate,
    'commission_calc_base', p.commission_calc_base,
    'commission_vat_deduction_status', p.commission_vat_deduction_status,
    'commission_deductible_vat_pct', p.commission_deductible_vat_pct,
    'advertising_enabled', p.advertising_enabled,
    'advertising_scenario', p.advertising_scenario,
    'advertising_rate', p.advertising_rate,
    'advertising_vat_included', p.advertising_vat_included,
    'advertising_vat_rate', p.advertising_vat_rate,
    'advertising_calc_base', p.advertising_calc_base,
    'advertising_vat_deduction_status', p.advertising_vat_deduction_status,
    'advertising_deductible_vat_pct', p.advertising_deductible_vat_pct,
    'advertising_organic_gross_pct', p.advertising_organic_gross_pct,
    'advertising_standard_gross_pct', p.advertising_standard_gross_pct,
    'advertising_full_gross_pct', p.advertising_full_gross_pct,
    'merchant_discounts_enabled', p.merchant_discounts_enabled,
    'platform_fees_enabled', p.platform_fees_enabled,
    'chargebacks_enabled', p.chargebacks_enabled,
    'financial_adjustments_enabled', p.financial_adjustments_enabled,
    'additional_expenses_note', p.additional_expenses_note,
    'min_margin_pct', p.min_margin_pct,
    'target_margin_pct', p.target_margin_pct,
    'optimal_margin_pct', p.optimal_margin_pct,
    'finance_effective_from', p.finance_effective_from,
    'finance_effective_to', p.finance_effective_to
  );
$$;

create or replace function public.erp_save_ref(p_entity text, p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', p->>'name_en', ''));
  v_table text;
  v_old public.erp_sales_channels;
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_finance boolean := false;
begin
  v_table := case p_entity when 'category' then 'erp_categories' when 'supplier' then 'erp_suppliers'
                           when 'warehouse' then 'erp_warehouses' when 'channel' then 'erp_sales_channels' end;
  if v_table is null then perform public.erp_raise('ERP_INVALID', 'entity'); end if;
  if v_name = '' then perform public.erp_raise('ERP_INVALID', 'name'); end if;

  if p_entity = 'category' then
    if v_id is null then
      insert into public.erp_categories (code, name_en, name_vn, sort)
      values (public.erp_unique_code('erp_categories', v_name), v_name, coalesce(btrim(p->>'name_vn'), ''),
              coalesce((select max(sort) + 1 from public.erp_categories), 0))
      returning id into v_id;
    else
      update public.erp_categories set name_en = v_name, name_vn = coalesce(btrim(p->>'name_vn'), '') where id = v_id;
    end if;
  elsif p_entity = 'supplier' then
    if v_id is null then
      insert into public.erp_suppliers (code, name, zalo_url, sort)
      values (public.erp_unique_code('erp_suppliers', v_name), v_name, nullif(btrim(p->>'zalo_url'), ''),
              coalesce((select max(sort) + 1 from public.erp_suppliers), 0))
      returning id into v_id;
    else
      update public.erp_suppliers set name = v_name, zalo_url = nullif(btrim(p->>'zalo_url'), '') where id = v_id;
    end if;
  elsif p_entity = 'warehouse' then
    if v_id is null then
      insert into public.erp_warehouses (code, name, kind, sort, address, phone)
      values (
        public.erp_unique_code('erp_warehouses', v_name),
        v_name,
        coalesce(nullif(p->>'kind', ''), 'other'),
        coalesce((select max(sort) + 1 from public.erp_warehouses), 0),
        case when p ? 'address' then nullif(btrim(p->>'address'), '') else null end,
        case when p ? 'phone' then nullif(btrim(p->>'phone'), '') else null end
      )
      returning id into v_id;
    else
      update public.erp_warehouses set
        name = v_name,
        kind = coalesce(nullif(p->>'kind', ''), kind),
        address = case when p ? 'address' then nullif(btrim(p->>'address'), '') else address end,
        phone = case when p ? 'phone' then nullif(btrim(p->>'phone'), '') else phone end
      where id = v_id;
    end if;
  else
    -- channel
    v_finance := p ? 'commission_rate' or p ? 'advertising_rate' or p ? 'min_margin_pct'
      or p ? 'output_vat_rate' or p ? 'selling_price_includes_vat' or p ? 'finance_preliminary'
      or p ? 'commission_enabled' or p ? 'advertising_enabled';
    if v_id is null then
      insert into public.erp_sales_channels (code, name, commission_pct, sort, legacy_commission_pct)
      values (
        public.erp_unique_code('erp_sales_channels', v_name),
        v_name,
        nullif(p->>'commission_pct', '')::numeric,
        coalesce((select max(sort) + 1 from public.erp_sales_channels), 0),
        nullif(p->>'commission_pct', '')::numeric
      )
      returning id into v_id;
    else
      select * into v_old from public.erp_sales_channels where id = v_id for update;
      if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
      update public.erp_sales_channels set
        name = v_name,
        commission_pct = case when p ? 'commission_pct' then nullif(p->>'commission_pct', '')::numeric else commission_pct end,
        legacy_commission_pct = coalesce(legacy_commission_pct, case when p ? 'commission_pct' then nullif(p->>'commission_pct', '')::numeric else commission_pct end)
      where id = v_id;
    end if;

    if v_finance then
      update public.erp_sales_channels set
        output_vat_rate = case when p ? 'output_vat_rate' then nullif(p->>'output_vat_rate', '')::numeric else output_vat_rate end,
        selling_price_includes_vat = case when p ? 'selling_price_includes_vat' then coalesce((p->>'selling_price_includes_vat')::boolean, true) else selling_price_includes_vat end,
        finance_preliminary = case when p ? 'finance_preliminary' then coalesce((p->>'finance_preliminary')::boolean, false) else finance_preliminary end,
        commission_enabled = case when p ? 'commission_enabled' then coalesce((p->>'commission_enabled')::boolean, false) else commission_enabled end,
        commission_rate = case when p ? 'commission_rate' then nullif(p->>'commission_rate', '')::numeric else commission_rate end,
        commission_vat_included = case when p ? 'commission_vat_included' then coalesce((p->>'commission_vat_included')::boolean, false) else commission_vat_included end,
        commission_vat_rate = case when p ? 'commission_vat_rate' then nullif(p->>'commission_vat_rate', '')::numeric else commission_vat_rate end,
        commission_calc_base = case when p ? 'commission_calc_base' then nullif(p->>'commission_calc_base', '') else commission_calc_base end,
        commission_vat_deduction_status = case when p ? 'commission_vat_deduction_status' then nullif(p->>'commission_vat_deduction_status', '') else commission_vat_deduction_status end,
        commission_deductible_vat_pct = case when p ? 'commission_deductible_vat_pct' then nullif(p->>'commission_deductible_vat_pct', '')::numeric else commission_deductible_vat_pct end,
        advertising_enabled = case when p ? 'advertising_enabled' then coalesce((p->>'advertising_enabled')::boolean, false) else advertising_enabled end,
        advertising_scenario = case when p ? 'advertising_scenario' then nullif(p->>'advertising_scenario', '') else advertising_scenario end,
        advertising_rate = case when p ? 'advertising_rate' then nullif(p->>'advertising_rate', '')::numeric else advertising_rate end,
        advertising_vat_included = case when p ? 'advertising_vat_included' then coalesce((p->>'advertising_vat_included')::boolean, false) else advertising_vat_included end,
        advertising_vat_rate = case when p ? 'advertising_vat_rate' then nullif(p->>'advertising_vat_rate', '')::numeric else advertising_vat_rate end,
        advertising_calc_base = case when p ? 'advertising_calc_base' then nullif(p->>'advertising_calc_base', '') else advertising_calc_base end,
        advertising_vat_deduction_status = case when p ? 'advertising_vat_deduction_status' then nullif(p->>'advertising_vat_deduction_status', '') else advertising_vat_deduction_status end,
        advertising_deductible_vat_pct = case when p ? 'advertising_deductible_vat_pct' then nullif(p->>'advertising_deductible_vat_pct', '')::numeric else advertising_deductible_vat_pct end,
        advertising_organic_gross_pct = case when p ? 'advertising_organic_gross_pct' then nullif(p->>'advertising_organic_gross_pct', '')::numeric else advertising_organic_gross_pct end,
        advertising_standard_gross_pct = case when p ? 'advertising_standard_gross_pct' then nullif(p->>'advertising_standard_gross_pct', '')::numeric else advertising_standard_gross_pct end,
        advertising_full_gross_pct = case when p ? 'advertising_full_gross_pct' then nullif(p->>'advertising_full_gross_pct', '')::numeric else advertising_full_gross_pct end,
        merchant_discounts_enabled = case when p ? 'merchant_discounts_enabled' then coalesce((p->>'merchant_discounts_enabled')::boolean, false) else merchant_discounts_enabled end,
        platform_fees_enabled = case when p ? 'platform_fees_enabled' then coalesce((p->>'platform_fees_enabled')::boolean, false) else platform_fees_enabled end,
        chargebacks_enabled = case when p ? 'chargebacks_enabled' then coalesce((p->>'chargebacks_enabled')::boolean, false) else chargebacks_enabled end,
        financial_adjustments_enabled = case when p ? 'financial_adjustments_enabled' then coalesce((p->>'financial_adjustments_enabled')::boolean, false) else financial_adjustments_enabled end,
        additional_expenses_note = case when p ? 'additional_expenses_note' then nullif(btrim(p->>'additional_expenses_note'), '') else additional_expenses_note end,
        min_margin_pct = case when p ? 'min_margin_pct' then nullif(p->>'min_margin_pct', '')::numeric else min_margin_pct end,
        target_margin_pct = case when p ? 'target_margin_pct' then nullif(p->>'target_margin_pct', '')::numeric else target_margin_pct end,
        optimal_margin_pct = case when p ? 'optimal_margin_pct' then nullif(p->>'optimal_margin_pct', '')::numeric else optimal_margin_pct end,
        finance_effective_from = coalesce(finance_effective_from, v_today),
        finance_effective_to = case when p ? 'finance_effective_to' then nullif(p->>'finance_effective_to', '')::date else finance_effective_to end,
        updated_at = now(),
        updated_by = p_actor
      where id = v_id;

      -- Close open history period (no overlap) then open new
      update public.erp_sales_channel_finance_history
      set effective_to = greatest(effective_from, v_today - 1)
      where channel_id = v_id and effective_to is null;

      insert into public.erp_sales_channel_finance_history (channel_id, effective_from, changed_by, change_kind, snapshot)
      select v_id, v_today, p_actor, 'update', public.erp_channel_finance_snapshot(c)
      from public.erp_sales_channels c where c.id = v_id;
    end if;
  end if;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_audit(p_actor, p_entity, v_id, 'save', null, p);
  return v_id;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('erp_save_ref', 'erp_channel_finance_snapshot')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
