-- Phase 8D: Input VAT Cost Adjustment documents.
-- Does NOT rewrite posted receipts / historical movements.
-- Production-chain propagation beyond write-offs → unallocated (Phase 8E).
-- NOT applied to production until Nikita's separate SQL OK.

-- ---------------------------------------------------------------------------
-- Lot bookkeeping for adjustments (original cost frozen)
-- ---------------------------------------------------------------------------
alter table public.erp_lots
  add column if not exists original_unit_cost numeric(18,6),
  add column if not exists cumulative_cost_adjustment numeric(18,4) not null default 0;

comment on column public.erp_lots.original_unit_cost is
  'Unit cost at first tax-aware receipt (or first adjustment snapshot). Never rewritten by later adjustments.';
comment on column public.erp_lots.cumulative_cost_adjustment is
  'Sum of posted Input VAT adjustments applied to this lot value (qty unchanged).';

-- Seed original_unit_cost for tax-aware lots that lack it
update public.erp_lots
set original_unit_cost = unit_cost
where tax_status_known is true and original_unit_cost is null and unit_cost is not null;

-- ---------------------------------------------------------------------------
-- Adjustment documents
-- ---------------------------------------------------------------------------
create sequence if not exists public.erp_vat_adj_no_seq;

create table if not exists public.erp_vat_cost_adjustments (
  id uuid primary key default gen_random_uuid(),
  adj_no text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'posted', 'reversed')),
  adj_date date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  source_document_id uuid not null references public.erp_documents (id),
  source_line_id uuid not null references public.erp_document_lines (id),
  source_lot_id uuid references public.erp_lots (id),
  supplier_id uuid references public.erp_suppliers (id),
  product_id uuid references public.erp_products (id),
  vat_invoice_number text,
  vat_invoice_date date,
  reason text not null
    check (reason in (
      'vat_invoice_received', 'vat_deduction_confirmed', 'partial_vat_deduction_confirmed',
      'vat_deduction_rejected', 'vat_deduction_reversed', 'accounting_correction', 'other'
    )),
  reason_note text,
  supporting_document_url text,
  previous_vat_deduction_status text,
  new_vat_deduction_status text not null
    check (new_vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  previous_deductible_vat_pct numeric(5,2),
  new_deductible_vat_pct numeric(5,2),
  previous_deductible_vat_amount numeric(18,4),
  new_deductible_vat_amount numeric(18,4),
  previous_effective_inventory_cost numeric(18,4),
  new_effective_inventory_cost numeric(18,4),
  vat_deduction_difference numeric(18,4),
  total_cost_adjustment numeric(18,4),
  remaining_inventory_adjustment numeric(18,4),
  consumed_cost_adjustment numeric(18,4),
  unallocated_adjustment numeric(18,4),
  original_qty numeric(18,6),
  remaining_qty numeric(18,6),
  consumed_qty numeric(18,6),
  preview_hash text,
  warnings jsonb not null default '[]'::jsonb,
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  approved_by text,
  approved_at timestamptz,
  posted_at timestamptz,
  posted_by text,
  reversed_at timestamptz,
  reversed_by text,
  reverse_of uuid references public.erp_vat_cost_adjustments (id),
  client_key uuid unique
);

create index if not exists erp_vat_adj_source_idx
  on public.erp_vat_cost_adjustments (source_document_id, source_line_id, created_at desc);
create index if not exists erp_vat_adj_status_idx
  on public.erp_vat_cost_adjustments (status, adj_date desc);

create table if not exists public.erp_vat_cost_adjustment_allocations (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.erp_vat_cost_adjustments (id) on delete cascade,
  bucket text not null check (bucket in (
    'remaining_raw', 'transferred', 'wip', 'semi_finished', 'finished_goods',
    'cogs', 'write_offs', 'unallocated'
  )),
  lot_id uuid references public.erp_lots (id),
  qty numeric(18,6) not null default 0,
  amount numeric(18,4) not null default 0,
  note text
);
create index if not exists erp_vat_adj_alloc_idx
  on public.erp_vat_cost_adjustment_allocations (adjustment_id);

create table if not exists public.erp_vat_cost_adjustment_lot_effects (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.erp_vat_cost_adjustments (id) on delete cascade,
  lot_id uuid not null references public.erp_lots (id),
  qty_left numeric(18,6) not null,
  previous_unit_cost numeric(18,6),
  new_unit_cost numeric(18,6),
  amount numeric(18,4) not null,
  unique (adjustment_id, lot_id)
);

comment on table public.erp_vat_cost_adjustments is
  'Phase 8D Input VAT / inventory cost adjustments. Never rewrites the source receipt.';

-- ---------------------------------------------------------------------------
-- Current effective VAT state for a purchase line (last posted adj or original)
-- ---------------------------------------------------------------------------
create or replace function public.erp_vat_adj_current_state(p_line uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_line public.erp_document_lines;
  v_doc public.erp_documents;
  v_adj public.erp_vat_cost_adjustments;
  v_net numeric;
  v_vat numeric;
  v_acq numeric;
  v_status text;
  v_pct numeric;
  v_split record;
  v_eff numeric;
begin
  select * into v_line from public.erp_document_lines where id = p_line;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'source_line'); end if;
  select * into v_doc from public.erp_documents where id = v_line.document_id;
  if v_doc.doc_type <> 'receipt' or v_doc.status <> 'posted' then
    perform public.erp_raise('ERP_INVALID', 'source_line_not_posted_receipt');
  end if;

  select * into v_adj
  from public.erp_vat_cost_adjustments
  where source_line_id = p_line and status = 'posted'
  order by posted_at desc nulls last, created_at desc
  limit 1;

  v_net := coalesce(v_line.net_amount, 0);
  v_vat := coalesce(v_line.vat_amount, 0);
  v_acq := coalesce(v_line.allocated_acquisition_cost, 0);

  if found then
    v_status := v_adj.new_vat_deduction_status;
    v_pct := v_adj.new_deductible_vat_pct;
    v_eff := v_adj.new_effective_inventory_cost;
    select * into v_split from public.erp_split_purchase_vat(v_vat, v_status, v_pct);
    return jsonb_build_object(
      'source_document_id', v_doc.id,
      'source_line_id', v_line.id,
      'supplier_id', v_doc.supplier_id,
      'product_id', v_line.product_id,
      'vat_invoice_number', coalesce(v_doc.vat_invoice_number, v_adj.vat_invoice_number),
      'vat_invoice_date', coalesce(v_doc.vat_invoice_date, v_adj.vat_invoice_date),
      'status', v_status,
      'deductible_vat_pct', v_pct,
      'deductible_vat_amount', v_split.deductible,
      'non_deductible_vat_amount', v_split.non_deductible,
      'pending_vat_amount', v_split.pending,
      'effective_inventory_cost', coalesce(v_eff, round(v_net + v_split.non_deductible + v_split.pending + v_acq, 4)),
      'net_purchase_cost', v_net,
      'original_vat_amount', v_vat,
      'allocated_acquisition_cost', v_acq,
      'from_adjustment_id', v_adj.id
    );
  end if;

  v_status := coalesce(nullif(v_line.vat_deduction_status, ''), 'pending');
  v_pct := v_line.deductible_vat_pct;
  select * into v_split from public.erp_split_purchase_vat(v_vat, v_status, v_pct);
  v_eff := coalesce(
    v_line.effective_inventory_cost,
    round(v_net + v_split.non_deductible + v_split.pending + v_acq, 4)
  );
  return jsonb_build_object(
    'source_document_id', v_doc.id,
    'source_line_id', v_line.id,
    'supplier_id', v_doc.supplier_id,
    'product_id', v_line.product_id,
    'vat_invoice_number', v_doc.vat_invoice_number,
    'vat_invoice_date', v_doc.vat_invoice_date,
    'status', v_status,
    'deductible_vat_pct', v_pct,
    'deductible_vat_amount', v_split.deductible,
    'non_deductible_vat_amount', v_split.non_deductible,
    'pending_vat_amount', v_split.pending,
    'effective_inventory_cost', v_eff,
    'net_purchase_cost', v_net,
    'original_vat_amount', v_vat,
    'allocated_acquisition_cost', v_acq,
    'from_adjustment_id', null
  );
end;
$$;

-- Lot scope: purchase lot + origin descendants
create or replace function public.erp_vat_adj_lot_scope(p_purchase_lot uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_lot public.erp_lots;
  v_original numeric;
  v_remaining numeric;
  v_transferred numeric;
  v_writeoff numeric;
begin
  select * into v_lot from public.erp_lots where id = p_purchase_lot;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'lot'); end if;
  v_original := v_lot.qty_in;
  select coalesce(sum(qty_left), 0) into v_remaining
  from public.erp_lots
  where id = p_purchase_lot or origin_lot_id = p_purchase_lot;
  select coalesce(sum(qty_left), 0) into v_transferred
  from public.erp_lots
  where origin_lot_id = p_purchase_lot and id <> p_purchase_lot;
  -- write-offs: outbound movements on purchase lot into writeoff docs
  select coalesce(sum(-m.qty), 0) into v_writeoff
  from public.erp_movements m
  join public.erp_documents d on d.id = m.document_id
  where m.lot_id = p_purchase_lot and m.qty < 0 and d.doc_type = 'writeoff';
  return jsonb_build_object(
    'purchase_lot_id', p_purchase_lot,
    'original_qty', v_original,
    'remaining_qty', v_remaining,
    'transferred_remaining_qty', v_transferred,
    'write_off_qty', least(v_writeoff, greatest(0, v_original - v_remaining)),
    'unit_cost', v_lot.unit_cost,
    'original_unit_cost', coalesce(v_lot.original_unit_cost, v_lot.unit_cost),
    'tax_status_known', v_lot.tax_status_known
  );
end;
$$;

create or replace function public.erp_vat_adj_preview(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_line uuid := nullif(p->>'source_line_id', '')::uuid;
  v_new_status text := nullif(p->>'new_vat_deduction_status', '');
  v_new_pct numeric := nullif(p->>'new_deductible_vat_pct', '')::numeric;
  v_state jsonb;
  v_lot uuid;
  v_scope jsonb;
  v_prev_ded numeric;
  v_net numeric;
  v_vat numeric;
  v_acq numeric;
  v_split record;
  v_new_eff numeric;
  v_new_ded numeric;
  v_diff numeric;
  v_adj numeric;
  v_orig numeric;
  v_rem numeric;
  v_cons numeric;
  v_xfer numeric;
  v_wo numeric;
  v_rem_adj numeric;
  v_xfer_adj numeric;
  v_wo_adj numeric;
  v_unalloc numeric;
  v_cons_adj numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_hash text;
begin
  if v_line is null then perform public.erp_raise('ERP_INVALID', 'source_line_id'); end if;
  if v_new_status is null or v_new_status not in ('pending', 'deductible', 'partial', 'non_deductible') then
    perform public.erp_raise('ERP_INVALID', 'new_vat_deduction_status');
  end if;
  if v_new_status = 'partial' and (v_new_pct is null or v_new_pct < 0 or v_new_pct > 100) then
    perform public.erp_raise('ERP_INVALID', 'new_deductible_vat_pct');
  end if;

  v_state := public.erp_vat_adj_current_state(v_line);
  if (v_state->>'status') = v_new_status
     and coalesce((v_state->>'deductible_vat_pct')::numeric, -1)
       = coalesce(case when v_new_status = 'partial' then v_new_pct else null end, -1) then
    perform public.erp_raise('ERP_INVALID', 'status_unchanged');
  end if;

  select l.id into v_lot
  from public.erp_lots l
  where l.source_line_id = v_line and l.origin_lot_id is null
  order by l.received_at, l.created_at
  limit 1;
  if v_lot is null then perform public.erp_raise('ERP_NOT_FOUND', 'purchase_lot'); end if;
  v_scope := public.erp_vat_adj_lot_scope(v_lot);

  v_net := (v_state->>'net_purchase_cost')::numeric;
  v_vat := (v_state->>'original_vat_amount')::numeric;
  v_acq := coalesce((v_state->>'allocated_acquisition_cost')::numeric, 0);
  v_prev_ded := coalesce((v_state->>'deductible_vat_amount')::numeric, 0);
  select * into v_split from public.erp_split_purchase_vat(v_vat, v_new_status, v_new_pct);
  v_new_ded := v_split.deductible;
  v_new_eff := round(v_net + v_split.non_deductible + v_split.pending + v_acq, 4);
  v_diff := round(v_new_ded - v_prev_ded, 4);
  v_adj := round(-v_diff, 4);

  v_orig := (v_scope->>'original_qty')::numeric;
  v_rem := (v_scope->>'remaining_qty')::numeric;
  v_xfer := (v_scope->>'transferred_remaining_qty')::numeric;
  v_wo := (v_scope->>'write_off_qty')::numeric;
  v_cons := greatest(0, v_orig - v_rem);

  if v_orig > 0 and v_adj <> 0 then
    v_rem_adj := round(v_adj * v_rem / v_orig, 4);
    v_cons_adj := round(v_adj - v_rem_adj, 4);
    if v_rem > 0 and v_xfer > 0 then
      v_xfer_adj := round(v_rem_adj * v_xfer / v_rem, 4);
      v_rem_adj := round(v_rem_adj - v_xfer_adj, 4);
    else
      v_xfer_adj := 0;
    end if;
    if v_cons > 0 then
      if v_wo > 0 then v_wo_adj := round(v_cons_adj * v_wo / v_cons, 4); else v_wo_adj := 0; end if;
      v_unalloc := round(v_cons_adj - v_wo_adj, 4);
    else
      v_wo_adj := 0; v_unalloc := 0;
    end if;
  else
    v_rem_adj := 0; v_xfer_adj := 0; v_wo_adj := 0; v_unalloc := 0; v_cons_adj := 0;
  end if;

  if v_cons > v_wo then
    v_warnings := v_warnings || jsonb_build_array(
      'Consumed quantity cannot be fully traced to production/COGS in Phase 8D; remainder is Unallocated Adjustment pending Phase 8E.'
    );
  end if;
  if coalesce((v_scope->>'tax_status_known')::boolean, false) is not true then
    v_warnings := v_warnings || jsonb_build_array('Purchase lot tax snapshot unknown (legacy); proceed with accounting review.');
  end if;

  v_hash := md5(jsonb_build_object(
    'line', v_line, 'lot', v_lot, 'new_status', v_new_status, 'new_pct', v_new_pct,
    'rem', v_rem, 'cons', v_cons, 'adj', v_adj, 'prev_status', v_state->>'status'
  )::text);

  return jsonb_build_object(
    'source_document_id', v_state->>'source_document_id',
    'source_line_id', v_line,
    'source_lot_id', v_lot,
    'supplier_id', v_state->>'supplier_id',
    'product_id', v_state->>'product_id',
    'vat_invoice_number', v_state->>'vat_invoice_number',
    'vat_invoice_date', v_state->>'vat_invoice_date',
    'previous', v_state,
    'new_vat_deduction_status', v_new_status,
    'new_deductible_vat_pct', case when v_new_status = 'partial' then v_new_pct else null end,
    'new_deductible_vat_amount', v_new_ded,
    'new_effective_inventory_cost', v_new_eff,
    'vat_deduction_difference', v_diff,
    'total_cost_adjustment', v_adj,
    'previous_unit_cost', case when v_orig > 0 then round((v_state->>'effective_inventory_cost')::numeric / v_orig, 6) end,
    'new_unit_cost', case when v_orig > 0 then round(v_new_eff / v_orig, 6) end,
    'original_qty', v_orig,
    'remaining_qty', v_rem,
    'consumed_qty', v_cons,
    'remaining_inventory_adjustment', round(v_rem_adj + v_xfer_adj, 4),
    'transferred_inventory_adjustment', v_xfer_adj,
    'write_off_adjustment', v_wo_adj,
    'unallocated_adjustment', v_unalloc,
    'consumed_cost_adjustment', round(v_wo_adj + v_unalloc, 4),
    'warnings', v_warnings,
    'preview_hash', v_hash,
    'scope', v_scope
  );
end;
$$;

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
      case when jsonb_array_length(coalesce(v_preview->'warnings', '[]'::jsonb)) > 0 then v_preview->'warnings'->>0 end);

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

  perform public.erp_audit(p_actor, 'vat_adjustment', p_id, 'post', null,
    jsonb_build_object('adj_no', v_adj.adj_no, 'total_cost_adjustment', v_adj.total_cost_adjustment));
  return jsonb_build_object('id', p_id, 'adj_no', v_adj.adj_no, 'status', 'posted', 'preview', v_fresh);
end;
$$;

create or replace function public.erp_vat_adj_reverse(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_adj public.erp_vat_cost_adjustments;
  v_rev uuid;
  v_eff record;
  v_lot public.erp_lots;
  v_value numeric;
  v_new_unit numeric;
begin
  select * into v_adj from public.erp_vat_cost_adjustments where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_adj.status <> 'posted' then perform public.erp_raise('ERP_INVALID', 'not_posted'); end if;
  if exists (select 1 from public.erp_vat_cost_adjustments where reverse_of = p_id and status = 'posted') then
    perform public.erp_raise('ERP_ALREADY_POSTED', 'already_reversed');
  end if;
  -- Only allow reverse if this is still the latest posted adj for the line
  if exists (
    select 1 from public.erp_vat_cost_adjustments
    where source_line_id = v_adj.source_line_id and status = 'posted' and posted_at > v_adj.posted_at
  ) then
    perform public.erp_raise('ERP_INVALID', 'not_latest_adjustment');
  end if;

  insert into public.erp_vat_cost_adjustments (
    adj_no, status, adj_date, source_document_id, source_line_id, source_lot_id, supplier_id, product_id,
    reason, reason_note, previous_vat_deduction_status, new_vat_deduction_status,
    previous_deductible_vat_pct, new_deductible_vat_pct,
    previous_deductible_vat_amount, new_deductible_vat_amount,
    previous_effective_inventory_cost, new_effective_inventory_cost,
    vat_deduction_difference, total_cost_adjustment,
    remaining_inventory_adjustment, consumed_cost_adjustment, unallocated_adjustment,
    original_qty, remaining_qty, consumed_qty, reverse_of, created_by, updated_by, posted_by, posted_at
  )
  values (
    'VA-' || lpad(nextval('public.erp_vat_adj_no_seq')::text, 6, '0'),
    'posted', (timezone('Asia/Ho_Chi_Minh', now()))::date,
    v_adj.source_document_id, v_adj.source_line_id, v_adj.source_lot_id, v_adj.supplier_id, v_adj.product_id,
    'vat_deduction_reversed', 'Auto reverse of ' || v_adj.adj_no,
    v_adj.new_vat_deduction_status, v_adj.previous_vat_deduction_status,
    v_adj.new_deductible_vat_pct, v_adj.previous_deductible_vat_pct,
    v_adj.new_deductible_vat_amount, v_adj.previous_deductible_vat_amount,
    v_adj.new_effective_inventory_cost, v_adj.previous_effective_inventory_cost,
    -coalesce(v_adj.vat_deduction_difference, 0), -coalesce(v_adj.total_cost_adjustment, 0),
    -coalesce(v_adj.remaining_inventory_adjustment, 0), -coalesce(v_adj.consumed_cost_adjustment, 0),
    -coalesce(v_adj.unallocated_adjustment, 0),
    v_adj.original_qty, v_adj.remaining_qty, v_adj.consumed_qty, p_id, p_actor, p_actor, p_actor, now()
  )
  returning id into v_rev;

  for v_eff in select * from public.erp_vat_cost_adjustment_lot_effects where adjustment_id = p_id
  loop
    select * into v_lot from public.erp_lots where id = v_eff.lot_id for update;
    if v_lot.qty_left > 0 and v_lot.unit_cost is not null then
      v_value := round(v_lot.qty_left * v_lot.unit_cost - v_eff.amount, 4);
      if v_value < 0 then perform public.erp_raise('ERP_NEGATIVE_LOT_COST', v_lot.id::text); end if;
      v_new_unit := round(v_value / v_lot.qty_left, 6);
      update public.erp_lots set
        unit_cost = v_new_unit,
        cumulative_cost_adjustment = coalesce(cumulative_cost_adjustment, 0) - v_eff.amount,
        vat_deduction_status = v_adj.previous_vat_deduction_status
      where id = v_lot.id;
      insert into public.erp_vat_cost_adjustment_lot_effects (adjustment_id, lot_id, qty_left, previous_unit_cost, new_unit_cost, amount)
      values (v_rev, v_lot.id, v_lot.qty_left, v_lot.unit_cost, v_new_unit, -v_eff.amount);
    end if;
  end loop;

  update public.erp_vat_cost_adjustments set
    status = 'reversed', reversed_at = now(), reversed_by = p_actor, updated_at = now(), updated_by = p_actor
  where id = p_id;

  perform public.erp_audit(p_actor, 'vat_adjustment', v_rev, 'reverse', p_id::text, jsonb_build_object('of', v_adj.adj_no));
  return v_rev;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_vat_adj_current_state', 'erp_vat_adj_lot_scope', 'erp_vat_adj_preview',
      'erp_vat_adj_save', 'erp_vat_adj_post', 'erp_vat_adj_reverse'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
