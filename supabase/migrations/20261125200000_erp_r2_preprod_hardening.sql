-- Release 2 pre-production hardening (post-8G owner gates).
-- Additive. Does NOT rewrite historical documents, lots, or sale prices.
-- 1) Tax settings validate against active erp_tax_rates catalog (effective dates).
-- 2) Backdated VAT adjustments disabled by default until explicit company setting.
-- 3) Backdated posts require reason_note + confirmation + audit when setting is on.

alter table public.erp_settings
  add column if not exists vat_adj_allow_backdated boolean not null default false;

comment on column public.erp_settings.vat_adj_allow_backdated is
  'When false (default), posting a VAT cost adjustment with adj_date before Vietnam today is refused. Checkbox alone is not enough. Full financial-period close is Release 3.';

create or replace function public.erp_tax_rate_percent_allowed(
  p_rate numeric,
  p_as_of date default null,
  p_treatment text default null
)
returns boolean
language sql
stable
as $$
  select
    p_rate is not null
    and exists (
      select 1
      from public.erp_tax_rates r
      where r.is_active
        and r.rate = p_rate
        and (
          p_treatment is null
          or nullif(btrim(p_treatment), '') is null
          or r.tax_treatment = p_treatment
        )
        and r.effective_from <= coalesce(p_as_of, (timezone('Asia/Ho_Chi_Minh', now()))::date)
        and (r.effective_to is null or r.effective_to >= coalesce(p_as_of, (timezone('Asia/Ho_Chi_Minh', now()))::date))
    );
$$;

comment on function public.erp_tax_rate_percent_allowed(numeric, date, text) is
  'True when an active catalog rate matches percent (and optional treatment) on as-of date.';

create or replace function public.erp_tax_rate_is_legacy_percent(p_rate numeric)
returns boolean
language sql
stable
as $$
  select public.erp_tax_rate_percent_allowed(p_rate, null, null);
$$;

revoke all on function public.erp_tax_rate_percent_allowed(numeric, date, text) from public, anon, authenticated;
grant execute on function public.erp_tax_rate_percent_allowed(numeric, date, text) to service_role;

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
  v_recipe_src text;
  v_as_of date := public.erp_business_today();
begin
  if p ? 'default_input_vat_rate' and nullif(p->>'default_input_vat_rate', '') is not null then
    v_in := (p->>'default_input_vat_rate')::numeric;
    if not public.erp_tax_rate_percent_allowed(v_in, v_as_of, null) then
      perform public.erp_raise('ERP_INVALID', 'default_input_vat_rate');
    end if;
  end if;
  if p ? 'default_output_vat_rate' and nullif(p->>'default_output_vat_rate', '') is not null then
    v_out := (p->>'default_output_vat_rate')::numeric;
    if not public.erp_tax_rate_percent_allowed(v_out, v_as_of, null) then
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
    if not exists (
      select 1 from public.erp_tax_rates r
      where r.id = v_in_id and r.is_active
        and r.effective_from <= v_as_of
        and (r.effective_to is null or r.effective_to >= v_as_of)
    ) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_input_tax_rate_id');
    end if;
  end if;
  if p ? 'default_output_tax_rate_id' and nullif(p->>'default_output_tax_rate_id', '') is not null then
    v_out_id := (p->>'default_output_tax_rate_id')::uuid;
    if not exists (
      select 1 from public.erp_tax_rates r
      where r.id = v_out_id and r.is_active
        and r.effective_from <= v_as_of
        and (r.effective_to is null or r.effective_to >= v_as_of)
    ) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_output_tax_rate_id');
    end if;
  end if;

  v_recipe_src := nullif(btrim(coalesce(p->>'recipe_cost_source', '')), '');
  if v_recipe_src is not null and v_recipe_src not in (
    'manual_estimated', 'last_purchase', 'weighted_average', 'estimated_fifo'
  ) then
    perform public.erp_raise('ERP_INVALID', 'recipe_cost_source');
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
    recipe_cost_source = case
      when p ? 'recipe_cost_source' then coalesce(v_recipe_src, recipe_cost_source)
      else recipe_cost_source
    end,
    vat_adj_allow_backdated = case
      when p ? 'vat_adj_allow_backdated'
        then coalesce((p->>'vat_adj_allow_backdated')::boolean, vat_adj_allow_backdated)
      else vat_adj_allow_backdated
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

-- ---------------------------------------------------------------------------
-- Backdated VAT adj: patched from Phase 8E bodies
-- ---------------------------------------------------------------------------

create or replace function public.erp_vat_adj_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_key uuid := nullif(p->>'client_key', '')::uuid;
  v_reason text := nullif(btrim(p->>'reason'), '');
  v_preview jsonb;
  v_existing public.erp_vat_cost_adjustments;
  v_confirm boolean := coalesce((p->>'confirm_backdated')::boolean, false);
begin
  if v_reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;
  -- Backdated gate (company setting default OFF; period close = Release 3)
  if coalesce(nullif(p->>'adj_date', '')::date, public.erp_business_today()) < public.erp_business_today() then
    if not coalesce((select vat_adj_allow_backdated from public.erp_settings where id = 1), false) then
      perform public.erp_raise('ERP_BACKDATED', 'backdated_adjustments_disabled');
    end if;
    if not v_confirm then
      perform public.erp_raise('ERP_BACKDATED', 'confirm_backdated_required');
    end if;
    if nullif(btrim(coalesce(p->>'reason_note', '')), '') is null then
      perform public.erp_raise('ERP_BACKDATED', 'reason_note_required');
    end if;
  end if;
  v_preview := public.erp_vat_adj_preview(p);

  if v_id is null and v_key is not null then
    select id into v_id from public.erp_vat_cost_adjustments where client_key = v_key;
  end if;
  if v_id is not null then
    select * into v_existing from public.erp_vat_cost_adjustments where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_existing.status not in ('draft', 'pending_approval') then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_existing.adj_no);
    end if;
    if p ? 'lock_version' and (p->>'lock_version')::integer <> v_existing.lock_version then
      perform public.erp_raise('ERP_STALE');
    end if;
  else
    insert into public.erp_vat_cost_adjustments (adj_no, client_key, created_by, updated_by, reason, source_document_id, source_line_id, new_vat_deduction_status)
    values (
      'VA-' || lpad(nextval('public.erp_vat_adj_no_seq')::text, 6, '0'),
      v_key, p_actor, p_actor, v_reason,
      (v_preview->>'source_document_id')::uuid,
      (v_preview->>'source_line_id')::uuid,
      v_preview->>'new_vat_deduction_status'
    )
    returning id into v_id;
  end if;

  update public.erp_vat_cost_adjustments set
    adj_date = coalesce(nullif(p->>'adj_date', '')::date, adj_date),
    source_document_id = (v_preview->>'source_document_id')::uuid,
    source_line_id = (v_preview->>'source_line_id')::uuid,
    source_lot_id = (v_preview->>'source_lot_id')::uuid,
    supplier_id = nullif(v_preview->>'supplier_id', '')::uuid,
    product_id = nullif(v_preview->>'product_id', '')::uuid,
    vat_invoice_number = coalesce(nullif(btrim(p->>'vat_invoice_number'), ''), nullif(v_preview->>'vat_invoice_number', '')),
    vat_invoice_date = coalesce(nullif(p->>'vat_invoice_date', '')::date, nullif(v_preview->>'vat_invoice_date', '')::date),
    reason = v_reason,
    reason_note = nullif(btrim(p->>'reason_note'), ''),
    supporting_document_url = nullif(btrim(p->>'supporting_document_url'), ''),
    previous_vat_deduction_status = v_preview->'previous'->>'status',
    new_vat_deduction_status = v_preview->>'new_vat_deduction_status',
    previous_deductible_vat_pct = nullif(v_preview->'previous'->>'deductible_vat_pct', '')::numeric,
    new_deductible_vat_pct = nullif(v_preview->>'new_deductible_vat_pct', '')::numeric,
    previous_deductible_vat_amount = (v_preview->'previous'->>'deductible_vat_amount')::numeric,
    new_deductible_vat_amount = (v_preview->>'new_deductible_vat_amount')::numeric,
    previous_effective_inventory_cost = (v_preview->'previous'->>'effective_inventory_cost')::numeric,
    new_effective_inventory_cost = (v_preview->>'new_effective_inventory_cost')::numeric,
    vat_deduction_difference = (v_preview->>'vat_deduction_difference')::numeric,
    total_cost_adjustment = (v_preview->>'total_cost_adjustment')::numeric,
    remaining_inventory_adjustment = (v_preview->>'remaining_inventory_adjustment')::numeric,
    consumed_cost_adjustment = (v_preview->>'consumed_cost_adjustment')::numeric,
    unallocated_adjustment = (v_preview->>'unallocated_adjustment')::numeric,
    original_qty = (v_preview->>'original_qty')::numeric,
    remaining_qty = (v_preview->>'remaining_qty')::numeric,
    consumed_qty = (v_preview->>'consumed_qty')::numeric,
    preview_hash = v_preview->>'preview_hash',
    warnings = coalesce(v_preview->'warnings', '[]'::jsonb),
    backdated_confirmed_by = case when v_confirm then p_actor else backdated_confirmed_by end,
    backdated_confirmed_at = case when v_confirm then now() else backdated_confirmed_at end,
    status = case when coalesce((p->>'submit_for_approval')::boolean, false) then 'pending_approval' else 'draft' end,
    lock_version = lock_version + 1,
    updated_at = now(),
    updated_by = p_actor
  where id = v_id;

  delete from public.erp_vat_cost_adjustment_allocations where adjustment_id = v_id;
  insert into public.erp_vat_cost_adjustment_allocations (adjustment_id, bucket, qty, amount, note)
  values
    (v_id, 'remaining_raw', greatest(0, (v_preview->>'remaining_qty')::numeric - coalesce((v_preview->'scope'->>'transferred_remaining_qty')::numeric, 0)),
      (v_preview->>'remaining_inventory_adjustment')::numeric - coalesce((v_preview->>'transferred_inventory_adjustment')::numeric, 0), null),
    (v_id, 'transferred', coalesce((v_preview->'scope'->>'transferred_remaining_qty')::numeric, 0),
      coalesce((v_preview->>'transferred_inventory_adjustment')::numeric, 0), null),
    (v_id, 'write_offs', coalesce((v_preview->'scope'->>'write_off_qty')::numeric, 0),
      coalesce((v_preview->>'write_off_adjustment')::numeric, 0), null),
    (v_id, 'unallocated', greatest(0, (v_preview->>'consumed_qty')::numeric - coalesce((v_preview->'scope'->>'write_off_qty')::numeric, 0)),
      coalesce((v_preview->>'unallocated_adjustment')::numeric, 0),
      'Unallocated until production lineage resolves (Phase 8E) or manual assignment');

  perform public.erp_audit(p_actor, 'vat_adjustment', v_id, 'save', null, p);
  return v_id;
end;
$$;

create or replace function public.erp_vat_adj_post(p_id uuid, p_actor text, p_preview_hash text default null)
returns jsonb
language plpgsql
as $$
declare
  v_adj public.erp_vat_cost_adjustments;
  v_fresh jsonb;
  v_lot public.erp_lots;
  v_desc record;
  v_total_rem numeric;
  v_share numeric;
  v_amount numeric;
  v_applied numeric := 0;
  v_new_unit numeric;
  v_prev_unit numeric;
  v_value numeric;
begin
  select * into v_adj from public.erp_vat_cost_adjustments where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_adj.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_adj.adj_no); end if;
  if v_adj.status not in ('draft', 'pending_approval') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_adj.adj_no);
  end if;
  if v_adj.reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;
  -- Backdated: company setting (default OFF) + confirmation + reason_note. Period close = Release 3.
  if v_adj.adj_date < public.erp_business_today() then
    if not coalesce((select vat_adj_allow_backdated from public.erp_settings where id = 1), false) then
      perform public.erp_raise('ERP_BACKDATED', 'backdated_adjustments_disabled');
    end if;
    if v_adj.backdated_confirmed_by is null or v_adj.backdated_confirmed_at is null then
      perform public.erp_raise('ERP_BACKDATED', 'confirm_backdated_required');
    end if;
    if nullif(btrim(coalesce(v_adj.reason_note, '')), '') is null then
      perform public.erp_raise('ERP_BACKDATED', 'reason_note_required');
    end if;
  end if;

  -- Recompute; reject if stock/status moved since save
  v_fresh := public.erp_vat_adj_preview(jsonb_build_object(
    'source_line_id', v_adj.source_line_id,
    'new_vat_deduction_status', v_adj.new_vat_deduction_status,
    'new_deductible_vat_pct', v_adj.new_deductible_vat_pct
  ));
  if p_preview_hash is not null and p_preview_hash <> (v_fresh->>'preview_hash') then
    perform public.erp_raise('ERP_STALE', 'preview_changed');
  end if;
  if v_adj.preview_hash is not null and v_adj.preview_hash <> (v_fresh->>'preview_hash') then
    perform public.erp_raise('ERP_STALE', 'stock_or_status_changed');
  end if;

  -- Refresh stored totals from fresh preview
  update public.erp_vat_cost_adjustments set
    previous_vat_deduction_status = v_fresh->'previous'->>'status',
    previous_deductible_vat_pct = nullif(v_fresh->'previous'->>'deductible_vat_pct', '')::numeric,
    previous_deductible_vat_amount = (v_fresh->'previous'->>'deductible_vat_amount')::numeric,
    previous_effective_inventory_cost = (v_fresh->'previous'->>'effective_inventory_cost')::numeric,
    new_deductible_vat_amount = (v_fresh->>'new_deductible_vat_amount')::numeric,
    new_effective_inventory_cost = (v_fresh->>'new_effective_inventory_cost')::numeric,
    vat_deduction_difference = (v_fresh->>'vat_deduction_difference')::numeric,
    total_cost_adjustment = (v_fresh->>'total_cost_adjustment')::numeric,
    remaining_inventory_adjustment = (v_fresh->>'remaining_inventory_adjustment')::numeric,
    consumed_cost_adjustment = (v_fresh->>'consumed_cost_adjustment')::numeric,
    unallocated_adjustment = (v_fresh->>'unallocated_adjustment')::numeric,
    original_qty = (v_fresh->>'original_qty')::numeric,
    remaining_qty = (v_fresh->>'remaining_qty')::numeric,
    consumed_qty = (v_fresh->>'consumed_qty')::numeric,
    warnings = coalesce(v_fresh->'warnings', '[]'::jsonb),
    preview_hash = v_fresh->>'preview_hash'
  where id = p_id;
  select * into v_adj from public.erp_vat_cost_adjustments where id = p_id;

  delete from public.erp_vat_cost_adjustment_lot_effects where adjustment_id = p_id;
  v_total_rem := coalesce(v_adj.remaining_qty, 0);

  if v_total_rem > 0 and coalesce(v_adj.remaining_inventory_adjustment, 0) <> 0 then
    for v_desc in
      select * from public.erp_lots
      where id = v_adj.source_lot_id or origin_lot_id = v_adj.source_lot_id
      for update
    loop
      if v_desc.qty_left <= 0 then continue; end if;
      v_share := v_desc.qty_left / v_total_rem;
      v_amount := round(v_adj.remaining_inventory_adjustment * v_share, 4);
      v_prev_unit := v_desc.unit_cost;
      if v_prev_unit is null then
        perform public.erp_raise('ERP_INVALID', 'lot_cost_unknown');
      end if;
      v_value := round(v_desc.qty_left * v_prev_unit + v_amount, 4);
      if v_value < 0 then perform public.erp_raise('ERP_NEGATIVE_LOT_COST', v_desc.id::text); end if;
      v_new_unit := round(v_value / v_desc.qty_left, 6);
      update public.erp_lots set
        original_unit_cost = coalesce(original_unit_cost, unit_cost),
        unit_cost = v_new_unit,
        effective_inventory_cost = case
          when effective_inventory_cost is null then null
          else round(effective_inventory_cost * (v_new_unit / nullif(v_prev_unit, 0)), 4)
        end,
        cumulative_cost_adjustment = coalesce(cumulative_cost_adjustment, 0) + v_amount,
        vat_deduction_status = v_adj.new_vat_deduction_status,
        deductible_vat_amount = case when qty_in > 0 then round(v_adj.new_deductible_vat_amount * (qty_in / nullif(v_adj.original_qty, 0)), 4) else deductible_vat_amount end,
        non_deductible_vat_amount = case
          when v_adj.new_vat_deduction_status = 'deductible' then 0
          when v_adj.new_vat_deduction_status = 'pending' then 0
          else non_deductible_vat_amount
        end,
        pending_vat_amount = case when v_adj.new_vat_deduction_status = 'pending' then pending_vat_amount else 0 end
      where id = v_desc.id;
      insert into public.erp_vat_cost_adjustment_lot_effects (adjustment_id, lot_id, qty_left, previous_unit_cost, new_unit_cost, amount)
      values (p_id, v_desc.id, v_desc.qty_left, v_prev_unit, v_new_unit, v_amount);
      v_applied := v_applied + v_amount;

      -- Refresh product est cost from purchase lot when still present
      if v_desc.id = v_adj.source_lot_id then
        update public.erp_products
        set est_unit_cost = v_new_unit, est_cost_source = 'receipt', est_cost_at = now(), updated_by = p_actor
        where id = v_desc.product_id;
      end if;
    end loop;
    -- penny drift on last effect
    if round(v_applied, 4) <> round(v_adj.remaining_inventory_adjustment, 4) then
      update public.erp_vat_cost_adjustment_lot_effects e set
        amount = amount + (v_adj.remaining_inventory_adjustment - v_applied)
      where e.id = (
        select id from public.erp_vat_cost_adjustment_lot_effects
        where adjustment_id = p_id order by qty_left desc limit 1
      );
    end if;
  end if;

  update public.erp_vat_cost_adjustments set
    status = 'posted',
    posted_at = now(),
    posted_by = p_actor,
    approved_by = coalesce(approved_by, p_actor),
    approved_at = coalesce(approved_at, now()),
    updated_at = now(),
    updated_by = p_actor
  where id = p_id;

  -- Phase 8E: push former unallocated consumed share through production lineage
  perform public.erp_vat_adj_propagate(p_id, p_actor);

  perform public.erp_audit(p_actor, 'vat_adjustment', p_id, 'post', null,
    jsonb_build_object('adj_no', v_adj.adj_no, 'total_cost_adjustment', v_adj.total_cost_adjustment));
  return jsonb_build_object('id', p_id, 'adj_no', v_adj.adj_no, 'status', 'posted', 'preview', v_fresh);
end;
$$;
