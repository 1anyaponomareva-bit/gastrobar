-- Phase 8E: production cost lineage snapshots + VAT adjustment propagation.
-- Also Phase 8D hardening: backdated adjustment confirmation.
-- NOT applied to production until Nikita's separate SQL OK.

-- ---------------------------------------------------------------------------
-- 8D: backdated posting guard fields
-- ---------------------------------------------------------------------------
alter table public.erp_vat_cost_adjustments
  add column if not exists backdated_confirmed_by text,
  add column if not exists backdated_confirmed_at timestamptz;

comment on column public.erp_vat_cost_adjustments.backdated_confirmed_by is
  'Required when adj_date < Vietnam business today (no full period-close table yet).';

-- ---------------------------------------------------------------------------
-- Production cost lineage (written on production post; never rewritten)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_production_lot_components (
  id uuid primary key default gen_random_uuid(),
  production_document_id uuid not null references public.erp_documents (id),
  production_line_id uuid references public.erp_document_lines (id),
  output_lot_id uuid not null references public.erp_lots (id),
  input_lot_id uuid not null references public.erp_lots (id),
  purchase_lot_id uuid references public.erp_lots (id),
  product_id uuid not null references public.erp_products (id),
  qty_consumed numeric(18,6) not null check (qty_consumed > 0),
  unit_cost numeric(18,6),
  cost_amount numeric(18,4),
  cost_share numeric(18,8),
  created_at timestamptz not null default now()
);
create index if not exists erp_plc_output_idx on public.erp_production_lot_components (output_lot_id);
create index if not exists erp_plc_purchase_idx on public.erp_production_lot_components (purchase_lot_id);
create index if not exists erp_plc_doc_idx on public.erp_production_lot_components (production_document_id);

comment on table public.erp_production_lot_components is
  'Phase 8E immutable snapshot: which input FIFO lots (and root purchase lot) funded each production output lot.';

create table if not exists public.erp_vat_adj_propagation (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.erp_vat_cost_adjustments (id) on delete cascade,
  bucket text not null,
  lot_id uuid references public.erp_lots (id),
  production_document_id uuid references public.erp_documents (id),
  component_id uuid references public.erp_production_lot_components (id),
  qty numeric(18,6) not null default 0,
  amount numeric(18,4) not null default 0,
  note text
);
create index if not exists erp_vap_adj_idx on public.erp_vat_adj_propagation (adjustment_id);

-- ---------------------------------------------------------------------------
-- Patch erp_vat_adj_save to persist backdated confirmation flag
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

-- ---------------------------------------------------------------------------
-- Snapshot production inputs when an output lot is created
-- ---------------------------------------------------------------------------
create or replace function public.erp_lots_snapshot_production_components()
returns trigger
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_total numeric;
begin
  select * into v_doc from public.erp_documents where id = new.source_document_id;
  if not found or v_doc.doc_type <> 'production' then return new; end if;

  select coalesce(sum(round((-m.qty) * coalesce(m.unit_cost, 0), 4)), 0) into v_total
  from public.erp_movements m
  where m.document_id = new.source_document_id and m.qty < 0;

  insert into public.erp_production_lot_components (
    production_document_id, production_line_id, output_lot_id, input_lot_id, purchase_lot_id,
    product_id, qty_consumed, unit_cost, cost_amount, cost_share
  )
  select
    m.document_id,
    m.line_id,
    new.id,
    m.lot_id,
    coalesce(il.origin_lot_id, case when il.tax_status_known then il.id else il.origin_lot_id end, il.id),
    m.product_id,
    -m.qty,
    m.unit_cost,
    round((-m.qty) * coalesce(m.unit_cost, 0), 4),
    case when v_total > 0 then round(((-m.qty) * coalesce(m.unit_cost, 0)) / v_total, 8) else null end
  from public.erp_movements m
  join public.erp_lots il on il.id = m.lot_id
  where m.document_id = new.source_document_id and m.qty < 0;

  return new;
end;
$$;

drop trigger if exists erp_lots_snapshot_production_components on public.erp_lots;
create trigger erp_lots_snapshot_production_components
  after insert on public.erp_lots
  for each row execute function public.erp_lots_snapshot_production_components();

-- ---------------------------------------------------------------------------
-- Propagate consumed VAT adjustment through production lineage (BFS)
-- ---------------------------------------------------------------------------
create or replace function public.erp_vat_adj_propagate(p_adj uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_adj public.erp_vat_cost_adjustments;
  v_budget numeric;
  v_applied numeric := 0;
  v_wo numeric;
  v_queue uuid[];
  v_seen uuid[] := array[]::uuid[];
  v_cur uuid;
  v_comp record;
  v_out public.erp_lots;
  v_open_cost numeric;
  v_share_amt numeric;
  v_new_unit numeric;
  v_value numeric;
  v_depth int := 0;
begin
  select * into v_adj from public.erp_vat_cost_adjustments where id = p_adj;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;

  delete from public.erp_vat_adj_propagation where adjustment_id = p_adj;

  v_wo := coalesce(v_adj.unallocated_adjustment, 0);
  -- write-off bucket already recorded in allocations; only propagate former unallocated
  v_budget := v_wo;
  if v_budget = 0 or v_adj.source_lot_id is null then
    return jsonb_build_object('applied', 0, 'remaining_unallocated', v_budget);
  end if;

  v_queue := array[v_adj.source_lot_id];

  while array_length(v_queue, 1) is not null and v_depth < 50 and abs(v_budget - v_applied) > 0.0001 loop
    v_cur := v_queue[1];
    v_queue := v_queue[2:];
    if v_cur = any(v_seen) then
      v_depth := v_depth + 1;
      continue;
    end if;
    v_seen := v_seen || v_cur;

    for v_comp in
      select * from public.erp_production_lot_components
      where purchase_lot_id = v_cur or input_lot_id = v_cur
    loop
      select * into v_out from public.erp_lots where id = v_comp.output_lot_id for update;
      if not found then continue; end if;

      -- Open share of this component still sitting in the output lot
      if v_out.qty_in > 0 and v_out.qty_left > 0 and v_comp.cost_amount is not null then
        v_open_cost := round(v_comp.cost_amount * (v_out.qty_left / v_out.qty_in), 4);
        -- Allocate from remaining budget proportional to this open cost vs purchase consumed value
        -- Use component cost_share of the consumed adjustment budget once per edge
        v_share_amt := round(v_budget * coalesce(v_comp.cost_share, 0) * (v_out.qty_left / nullif(v_out.qty_in, 0)), 4);
        if v_share_amt = 0 then continue; end if;

        if v_out.unit_cost is null then
          insert into public.erp_vat_adj_propagation (adjustment_id, bucket, lot_id, production_document_id, component_id, qty, amount, note)
          values (p_adj, 'unallocated', v_out.id, v_comp.production_document_id, v_comp.id, v_out.qty_left, v_share_amt, 'output lot cost unknown');
          continue;
        end if;

        v_value := round(v_out.qty_left * v_out.unit_cost + v_share_amt, 4);
        if v_value < 0 then perform public.erp_raise('ERP_NEGATIVE_LOT_COST', v_out.id::text); end if;
        v_new_unit := round(v_value / v_out.qty_left, 6);
        update public.erp_lots set
          original_unit_cost = coalesce(original_unit_cost, unit_cost),
          unit_cost = v_new_unit,
          cumulative_cost_adjustment = coalesce(cumulative_cost_adjustment, 0) + v_share_amt
        where id = v_out.id;

        insert into public.erp_vat_adj_propagation (adjustment_id, bucket, lot_id, production_document_id, component_id, qty, amount, note)
        values (
          p_adj,
          case when exists (select 1 from public.erp_products p where p.id = v_out.product_id and p.type = 'finished')
            then 'finished_goods' else 'semi_finished' end,
          v_out.id, v_comp.production_document_id, v_comp.id, v_out.qty_left, v_share_amt, null
        );
        insert into public.erp_vat_cost_adjustment_lot_effects (adjustment_id, lot_id, qty_left, previous_unit_cost, new_unit_cost, amount)
        values (p_adj, v_out.id, v_out.qty_left, v_out.unit_cost, v_new_unit, v_share_amt)
        on conflict (adjustment_id, lot_id) do update set
          amount = public.erp_vat_cost_adjustment_lot_effects.amount + excluded.amount,
          new_unit_cost = excluded.new_unit_cost;

        v_applied := round(v_applied + v_share_amt, 4);
        -- Continue BFS into further productions that used this output
        if not (v_out.id = any(v_seen)) then
          v_queue := v_queue || v_out.id;
        end if;
      elsif v_out.qty_left <= 0 then
        -- Fully consumed output — follow downstream without valuing here
        if not (v_out.id = any(v_seen)) then
          v_queue := v_queue || v_out.id;
        end if;
      end if;
    end loop;
    v_depth := v_depth + 1;
  end loop;

  -- Rewrite unallocated allocation row to residual
  update public.erp_vat_cost_adjustment_allocations
  set amount = round(v_budget - v_applied, 4),
      note = case when round(v_budget - v_applied, 4) = 0 then 'Fully propagated via production lineage'
                 else 'Residual unallocated — no reliable open production stock; manual review'
            end
  where adjustment_id = p_adj and bucket = 'unallocated';

  update public.erp_vat_cost_adjustments
  set unallocated_adjustment = round(v_budget - v_applied, 4),
      consumed_cost_adjustment = coalesce(consumed_cost_adjustment, 0) -- keep; detail in propagation
  where id = p_adj;

  return jsonb_build_object(
    'applied', v_applied,
    'remaining_unallocated', round(v_budget - v_applied, 4),
    'visited', v_seen
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Replace erp_vat_adj_post: backdated guard + propagate after remaining lots
-- ---------------------------------------------------------------------------
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
  -- Backdated: adj_date before Vietnam today requires explicit confirmation (no period-close table yet).
  if v_adj.adj_date < public.erp_business_today()
     and (v_adj.backdated_confirmed_by is null or v_adj.backdated_confirmed_at is null) then
    perform public.erp_raise('ERP_BACKDATED', 'confirm_backdated_required');
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

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_vat_adj_save', 'erp_vat_adj_post', 'erp_vat_adj_propagate',
      'erp_lots_snapshot_production_components'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
