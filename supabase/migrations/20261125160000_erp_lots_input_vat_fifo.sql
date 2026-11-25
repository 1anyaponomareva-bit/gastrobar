-- Phase 8C: FIFO lot Input VAT snapshots + acquisition cost allocation.
-- Does NOT rewrite historical lots (tax_status_known stays false).
-- NOT applied to production until Nikita's separate SQL OK.

-- ---------------------------------------------------------------------------
-- Lot enrichment (new posts only fill snapshots; legacy rows stay unknown)
-- ---------------------------------------------------------------------------
alter table public.erp_lots
  add column if not exists base_unit text,
  add column if not exists original_net_cost numeric(18,4),
  add column if not exists original_vat_amount numeric(18,4),
  add column if not exists original_gross_cost numeric(18,4),
  add column if not exists vat_rate_snapshot numeric(5,2),
  add column if not exists vat_deduction_status text,
  add column if not exists deductible_vat_amount numeric(18,4),
  add column if not exists non_deductible_vat_amount numeric(18,4),
  add column if not exists pending_vat_amount numeric(18,4),
  add column if not exists allocated_acquisition_cost numeric(18,4),
  add column if not exists effective_inventory_cost numeric(18,4),
  add column if not exists tax_status_known boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_lots_vat_deduction_check'
      and conrelid = 'public.erp_lots'::regclass
  ) then
    alter table public.erp_lots
      add constraint erp_lots_vat_deduction_check
      check (
        vat_deduction_status is null
        or vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')
      );
  end if;
end $$;

comment on column public.erp_lots.tax_status_known is
  'false = Legacy/Unknown historical lot; do not auto-recalculate. true = tax snapshot from purchase post.';
comment on column public.erp_lots.unit_cost is
  'FIFO unit cost = effective inventory cost / qty_in for tax-aware purchase lots.';
comment on column public.erp_lots.pending_vat_amount is
  'VAT temporarily in inventory under Pending; exclusive of non_deductible_vat_amount (no double-count).';
comment on column public.erp_lots.effective_inventory_cost is
  'Net + non-deductible VAT + pending VAT + allocated acquisition (line total at receipt).';

-- Existing lots remain Legacy / Unknown
update public.erp_lots set tax_status_known = false where tax_status_known is distinct from false;

-- ---------------------------------------------------------------------------
-- Line: pending VAT + allocated acquisition
-- ---------------------------------------------------------------------------
alter table public.erp_document_lines
  add column if not exists pending_vat_amount numeric(18,4),
  add column if not exists allocated_acquisition_cost numeric(18,4);

-- ---------------------------------------------------------------------------
-- Document acquisition costs (transport / delivery / handling / other)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_document_acquisition_costs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.erp_documents (id) on delete cascade,
  kind text not null check (kind in ('transport', 'delivery', 'handling', 'other')),
  amount numeric(18,4) not null default 0 check (amount >= 0),
  vat_rate numeric(5,2) check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100)),
  vat_included boolean not null default false,
  vat_deduction_status text not null default 'pending'
    check (vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  deductible_vat_pct numeric(5,2) check (deductible_vat_pct is null or (deductible_vat_pct >= 0 and deductible_vat_pct <= 100)),
  net_amount numeric(18,4),
  vat_amount numeric(18,4),
  inventory_amount numeric(18,4),
  unique (document_id, kind)
);
create index if not exists erp_doc_acq_doc_idx on public.erp_document_acquisition_costs (document_id);

comment on table public.erp_document_acquisition_costs is
  'Phase 8C receipt acquisition fees. Only non-deductible + pending VAT of fees enter inventory_amount.';

-- ---------------------------------------------------------------------------
-- Helpers: VAT split + effective cost (pending exclusive of non-deductible)
-- ---------------------------------------------------------------------------
create or replace function public.erp_split_purchase_vat(
  p_vat numeric,
  p_status text,
  p_deductible_pct numeric default null
)
returns table (deductible numeric, non_deductible numeric, pending numeric)
language plpgsql
immutable
as $$
declare
  v_status text := coalesce(nullif(p_status, ''), 'pending');
  v_vat numeric := coalesce(p_vat, 0);
  v_pct numeric;
  v_ded numeric;
begin
  if v_vat <= 0 then
    return query select 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;
  if v_status = 'deductible' then
    return query select round(v_vat, 4), 0::numeric, 0::numeric;
  elsif v_status = 'non_deductible' then
    return query select 0::numeric, round(v_vat, 4), 0::numeric;
  elsif v_status = 'pending' then
    return query select 0::numeric, 0::numeric, round(v_vat, 4);
  elsif v_status = 'partial' then
    v_pct := greatest(0, least(100, coalesce(p_deductible_pct, 0)));
    v_ded := round(v_vat * v_pct / 100.0, 4);
    return query select v_ded, round(v_vat - v_ded, 4), 0::numeric;
  else
    return query select 0::numeric, 0::numeric, round(v_vat, 4);
  end if;
end;
$$;

drop function if exists public.erp_effective_inventory_cost(numeric, numeric, text, numeric);
drop function if exists public.erp_effective_inventory_cost(numeric, numeric, text, numeric, numeric);

create or replace function public.erp_effective_inventory_cost(
  p_net numeric,
  p_vat numeric,
  p_status text,
  p_deductible_pct numeric default null,
  p_allocated_acq numeric default 0
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_split record;
begin
  select * into v_split from public.erp_split_purchase_vat(p_vat, p_status, p_deductible_pct);
  return round(
    coalesce(p_net, 0) + coalesce(v_split.non_deductible, 0) + coalesce(v_split.pending, 0) + coalesce(p_allocated_acq, 0),
    4
  );
end;
$$;

create or replace function public.erp_acquisition_inventory_amount(
  p_amount numeric,
  p_vat_rate numeric,
  p_vat_included boolean,
  p_status text,
  p_deductible_pct numeric default null
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_rate numeric := coalesce(p_vat_rate, 0);
  v_amt numeric := coalesce(p_amount, 0);
  v_net numeric;
  v_gross numeric;
  v_vat numeric;
  v_split record;
begin
  if v_amt <= 0 then return 0; end if;
  if v_rate > 0 then
    if coalesce(p_vat_included, false) then
      v_gross := round(v_amt, 4);
      v_net := round(v_gross / (1 + v_rate / 100), 4);
    else
      v_net := round(v_amt, 4);
      v_gross := round(v_net * (1 + v_rate / 100), 4);
    end if;
  else
    v_net := round(v_amt, 4);
    v_gross := v_net;
  end if;
  v_vat := v_gross - v_net;
  select * into v_split from public.erp_split_purchase_vat(v_vat, p_status, p_deductible_pct);
  return round(v_net + coalesce(v_split.non_deductible, 0) + coalesce(v_split.pending, 0), 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- Receive lot: optional tax / acquisition snapshot (default null = legacy path)
-- Drop 11-arg overload so CREATE OR REPLACE does not leave a parallel signature.
-- ---------------------------------------------------------------------------
drop function if exists public.erp_receive_lot(uuid, uuid, uuid, uuid, numeric, numeric, text, date, timestamptz, uuid, text);

create or replace function public.erp_receive_lot(
  p_doc uuid, p_line uuid, p_product uuid, p_warehouse uuid, p_qty numeric, p_unit_cost numeric,
  p_batch text, p_expires date, p_received_at timestamptz, p_origin uuid, p_actor text,
  p_snapshot jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_lot uuid;
  v_unit text;
begin
  select base_unit into v_unit from public.erp_products where id = p_product;
  insert into public.erp_lots (
    product_id, warehouse_id, origin_lot_id, source_document_id, source_line_id,
    batch_no, received_at, expires_at, unit_cost, qty_in, qty_left, base_unit,
    original_net_cost, original_vat_amount, original_gross_cost,
    vat_rate_snapshot, vat_deduction_status,
    deductible_vat_amount, non_deductible_vat_amount, pending_vat_amount,
    allocated_acquisition_cost, effective_inventory_cost, tax_status_known
  )
  values (
    p_product, p_warehouse, p_origin, p_doc, p_line,
    p_batch, p_received_at, p_expires, p_unit_cost, p_qty, p_qty,
    coalesce(nullif(p_snapshot->>'base_unit', ''), v_unit),
    nullif(p_snapshot->>'original_net_cost', '')::numeric,
    nullif(p_snapshot->>'original_vat_amount', '')::numeric,
    nullif(p_snapshot->>'original_gross_cost', '')::numeric,
    nullif(p_snapshot->>'vat_rate_snapshot', '')::numeric,
    nullif(p_snapshot->>'vat_deduction_status', ''),
    nullif(p_snapshot->>'deductible_vat_amount', '')::numeric,
    nullif(p_snapshot->>'non_deductible_vat_amount', '')::numeric,
    nullif(p_snapshot->>'pending_vat_amount', '')::numeric,
    nullif(p_snapshot->>'allocated_acquisition_cost', '')::numeric,
    nullif(p_snapshot->>'effective_inventory_cost', '')::numeric,
    coalesce((p_snapshot->>'tax_status_known')::boolean, false)
  )
  returning id into v_lot;
  insert into public.erp_movements (document_id, line_id, lot_id, product_id, warehouse_id, qty, unit_cost, amount, created_by)
  values (p_doc, p_line, v_lot, p_product, p_warehouse, p_qty, p_unit_cost,
          case when p_unit_cost is null then null else round(p_qty * p_unit_cost, 4) end, p_actor);
  return v_lot;
end;
$$;

-- ---------------------------------------------------------------------------
-- Save: persist acquisition_costs[] on receipt documents
-- ---------------------------------------------------------------------------
create or replace function public.erp_save_document_acquisition_costs(p_doc uuid, p_costs jsonb)
returns void
language plpgsql
as $$
declare
  v_row jsonb;
  v_kind text;
  v_amount numeric;
  v_rate numeric;
  v_included boolean;
  v_status text;
  v_pct numeric;
  v_net numeric;
  v_vat numeric;
  v_inv numeric;
  v_gross numeric;
begin
  delete from public.erp_document_acquisition_costs where document_id = p_doc;
  if p_costs is null or jsonb_typeof(p_costs) <> 'array' then return; end if;
  for v_row in select * from jsonb_array_elements(p_costs)
  loop
    v_kind := nullif(btrim(v_row->>'kind'), '');
    if v_kind is null or v_kind not in ('transport', 'delivery', 'handling', 'other') then continue; end if;
    v_amount := coalesce(nullif(v_row->>'amount', '')::numeric, 0);
    if v_amount < 0 then v_amount := 0; end if;
    v_rate := nullif(v_row->>'vat_rate', '')::numeric;
    v_included := coalesce((v_row->>'vat_included')::boolean, false);
    v_status := coalesce(nullif(v_row->>'vat_deduction_status', ''), 'pending');
    v_pct := nullif(v_row->>'deductible_vat_pct', '')::numeric;
    v_inv := public.erp_acquisition_inventory_amount(v_amount, v_rate, v_included, v_status, v_pct);
    if coalesce(v_rate, 0) > 0 then
      if v_included then
        v_gross := round(v_amount, 4);
        v_net := round(v_gross / (1 + v_rate / 100), 4);
      else
        v_net := round(v_amount, 4);
        v_gross := round(v_net * (1 + v_rate / 100), 4);
      end if;
      v_vat := v_gross - v_net;
    else
      v_net := round(v_amount, 4);
      v_vat := 0;
    end if;
    insert into public.erp_document_acquisition_costs (
      document_id, kind, amount, vat_rate, vat_included, vat_deduction_status, deductible_vat_pct,
      net_amount, vat_amount, inventory_amount
    ) values (p_doc, v_kind, v_amount, v_rate, v_included, v_status, v_pct, v_net, v_vat, v_inv)
    on conflict (document_id, kind) do update set
      amount = excluded.amount,
      vat_rate = excluded.vat_rate,
      vat_included = excluded.vat_included,
      vat_deduction_status = excluded.vat_deduction_status,
      deductible_vat_pct = excluded.deductible_vat_pct,
      net_amount = excluded.net_amount,
      vat_amount = excluded.vat_amount,
      inventory_amount = excluded.inventory_amount;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Save document: also persist acquisition_costs (based on Phase 8B save)
-- ---------------------------------------------------------------------------
create or replace function public.erp_save_document(p_doc jsonb, p_actor text)
returns uuid
language plpgsql
set timezone to 'Asia/Ho_Chi_Minh'
as $$
declare
  v_id uuid := nullif(p_doc->>'id', '')::uuid;
  v_type text := p_doc->>'doc_type';
  v_key uuid := nullif(p_doc->>'client_key', '')::uuid;
  v_reason uuid := nullif(p_doc->>'reason_id', '')::uuid;
  v_existing public.erp_documents;
  v_prefix text;
  v_line jsonb;
  v_dish jsonb;
  v_i integer := 0;
  v_counted boolean;
  v_qty numeric;
  v_tz text := public.erp_business_tz();
  v_date date;
  v_at timestamptz;
  v_has_moves boolean := false;
  v_pid uuid;
begin
  if v_id is null and v_key is not null then
    select id into v_id from public.erp_documents where client_key = v_key;
  end if;
  if v_id is not null then
    select * into v_existing from public.erp_documents where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_existing.status = 'posted' and v_key is not null and v_existing.client_key is not distinct from v_key then
      perform public.erp_raise('ERP_ALREADY_POSTED', v_existing.doc_no);
    end if;
    if v_existing.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_existing.doc_no); end if;
    if p_doc ? 'lock_version' and (p_doc->>'lock_version')::integer <> v_existing.lock_version then
      perform public.erp_raise('ERP_STALE');
    end if;
    v_type := v_existing.doc_type;
  elsif v_type not in ('opening', 'receipt', 'transfer', 'writeoff', 'count', 'production') then
    perform public.erp_raise('ERP_INVALID', 'doc_type');
  end if;

  if v_reason is not null and to_regclass('public.erp_writeoff_reasons') is not null
     and (v_id is null or v_existing.reason_id is distinct from v_reason) then
    perform 1 from public.erp_writeoff_reasons where id = v_reason and archived_at is null;
    if not found then perform public.erp_raise('ERP_REASON_ARCHIVED'); end if;
  end if;

  if v_id is null then
    v_prefix := case v_type when 'opening' then 'OB' when 'receipt' then 'RC' when 'transfer' then 'TR'
                            when 'writeoff' then 'WO' when 'count' then 'IC' else 'PR' end;
    insert into public.erp_documents (doc_no, doc_type, client_key, created_by, updated_by)
    values (v_prefix || '-' || lpad(nextval('public.erp_document_no_seq')::text, 6, '0'), v_type, v_key, p_actor, p_actor)
    returning id into v_id;
  end if;

  v_at := coalesce(public.erp_parse_at(p_doc->>'occurred_at'), public.erp_parse_at(p_doc->>'counted_at'));
  v_date := coalesce(
    nullif(p_doc->>'doc_date', '')::date,
    (v_at at time zone v_tz)::date,
    public.erp_business_today()
  );
  v_at := coalesce(v_at, v_date::timestamp at time zone v_tz);

  update public.erp_documents set
    doc_date = v_date,
    occurred_at = v_at,
    counted_at = case when v_type = 'count' then v_at else counted_at end,
    doc_time = coalesce(nullif(p_doc->>'doc_time', '')::time, (v_at at time zone v_tz)::time, doc_time),
    reason_id = v_reason,
    count_kind = case when v_type = 'count' then coalesce(nullif(p_doc->>'count_kind', ''), count_kind, 'partial') else count_kind end,
    count_scope = case when v_type = 'count' then coalesce(p_doc->'count_scope', count_scope) else count_scope end,
    accept_stale = coalesce((p_doc->>'accept_stale')::boolean, accept_stale),
    correction_of = coalesce(nullif(p_doc->>'correction_of', '')::uuid, correction_of),
    warehouse_id = nullif(p_doc->>'warehouse_id', '')::uuid,
    target_warehouse_id = nullif(p_doc->>'target_warehouse_id', '')::uuid,
    supplier_id = nullif(p_doc->>'supplier_id', '')::uuid,
    reason = nullif(btrim(p_doc->>'reason'), ''),
    comment = nullif(btrim(p_doc->>'comment'), ''),
    prices_include_vat = coalesce((p_doc->>'prices_include_vat')::boolean, false),
    supplier_tax_code = case when p_doc ? 'supplier_tax_code' then nullif(btrim(p_doc->>'supplier_tax_code'), '') else supplier_tax_code end,
    vat_invoice_number = case when p_doc ? 'vat_invoice_number' then nullif(btrim(p_doc->>'vat_invoice_number'), '') else vat_invoice_number end,
    vat_invoice_serial = case when p_doc ? 'vat_invoice_serial' then nullif(btrim(p_doc->>'vat_invoice_serial'), '') else vat_invoice_serial end,
    vat_invoice_date = case when p_doc ? 'vat_invoice_date' then nullif(p_doc->>'vat_invoice_date', '')::date else vat_invoice_date end,
    invoice_attachment_url = case when p_doc ? 'invoice_attachment_url' then nullif(btrim(p_doc->>'invoice_attachment_url'), '') else invoice_attachment_url end,
    vat_verification_status = case when p_doc ? 'vat_verification_status' then nullif(btrim(p_doc->>'vat_verification_status'), '') else vat_verification_status end,
    payment_status = case when p_doc ? 'payment_status' then nullif(btrim(p_doc->>'payment_status'), '') else payment_status end,
    recipe_id = nullif(p_doc->>'recipe_id', '')::uuid,
    output_product_id = nullif(p_doc->>'output_product_id', '')::uuid,
    plan_output_qty = nullif(p_doc->>'plan_output_qty', '')::numeric,
    output_qty = nullif(p_doc->>'output_qty', '')::numeric,
    output_pieces = nullif(p_doc->>'output_pieces', '')::integer,
    output_weight_kg = nullif(p_doc->>'output_weight_kg', '')::numeric,
    batch_no = nullif(btrim(p_doc->>'batch_no'), ''),
    expires_at = nullif(p_doc->>'expires_at', '')::date,
    responsible = nullif(btrim(p_doc->>'responsible'), ''),
    lock_version = lock_version + 1,
    updated_by = p_actor
  where id = v_id;

  select exists (select 1 from public.erp_movements where document_id = v_id) into v_has_moves;
  if not v_has_moves then
    delete from public.erp_document_lines where document_id = v_id;
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_doc->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    if v_type = 'count' then
      if v_line ? 'counted' then
        v_counted := coalesce((v_line->>'counted')::boolean, false);
      elsif v_line ? 'fact_qty' then
        v_counted := nullif(v_line->>'fact_qty', '') is not null;
      elsif v_line ? 'qty' then
        v_counted := true;
      else
        v_counted := false;
      end if;
      v_qty := case
        when v_line ? 'fact_qty' then coalesce(nullif(v_line->>'fact_qty', '')::numeric, 0)
        else coalesce(nullif(v_line->>'qty', '')::numeric, 0)
      end;
    else
      v_counted := true;
      v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    end if;
    v_pid := (v_line->>'product_id')::uuid;
    if v_has_moves then
      update public.erp_document_lines set
        line_no = v_i, qty = v_qty, counted = v_counted,
        planned_qty = nullif(v_line->>'planned_qty', '')::numeric,
        pack_id = nullif(v_line->>'pack_id', '')::uuid,
        pack_qty = nullif(v_line->>'pack_qty', '')::numeric,
        unit_price = nullif(v_line->>'unit_price', '')::numeric,
        vat_rate = nullif(v_line->>'vat_rate', '')::numeric,
        vat_included = case when v_line ? 'vat_included' then (v_line->>'vat_included')::boolean else vat_included end,
        vat_deduction_status = case when v_line ? 'vat_deduction_status' then nullif(v_line->>'vat_deduction_status', '') else vat_deduction_status end,
        deductible_vat_pct = case when v_line ? 'deductible_vat_pct' then nullif(v_line->>'deductible_vat_pct', '')::numeric else deductible_vat_pct end,
        batch_no = nullif(btrim(v_line->>'batch_no'), ''),
        expires_at = nullif(v_line->>'expires_at', '')::date,
        reason = nullif(btrim(v_line->>'reason'), ''),
        count_mode = nullif(v_line->>'count_mode', '')
      where document_id = v_id and product_id = v_pid;
      if not found then
        insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                               unit_price, vat_rate, vat_included, vat_deduction_status, deductible_vat_pct,
                                               batch_no, expires_at, reason, count_mode)
        values (v_id, v_i, v_pid, v_qty, v_counted,
                nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
                nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
                nullif(v_line->>'vat_rate', '')::numeric,
                case when v_line ? 'vat_included' then (v_line->>'vat_included')::boolean else null end,
                coalesce(nullif(v_line->>'vat_deduction_status', ''), case when v_type = 'receipt' then 'pending' else null end),
                nullif(v_line->>'deductible_vat_pct', '')::numeric,
                nullif(btrim(v_line->>'batch_no'), ''),
                nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''),
                nullif(v_line->>'count_mode', ''));
      end if;
    else
      insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                             unit_price, vat_rate, vat_included, vat_deduction_status, deductible_vat_pct,
                                             batch_no, expires_at, reason, count_mode)
      values (v_id, v_i, v_pid, v_qty, v_counted,
              nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
              nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
              nullif(v_line->>'vat_rate', '')::numeric,
              case when v_line ? 'vat_included' then (v_line->>'vat_included')::boolean else null end,
              coalesce(nullif(v_line->>'vat_deduction_status', ''), case when v_type = 'receipt' then 'pending' else null end),
              nullif(v_line->>'deductible_vat_pct', '')::numeric,
              nullif(btrim(v_line->>'batch_no'), ''),
              nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''),
              nullif(v_line->>'count_mode', ''));
    end if;
  end loop;

  if v_type = 'count' then
    delete from public.erp_count_dish_lines where document_id = v_id;
    for v_dish in select * from jsonb_array_elements(coalesce(p_doc->'dish_lines', '[]'::jsonb))
    loop
      insert into public.erp_count_dish_lines (document_id, dish_id, counted, qty)
      values (
        v_id, (v_dish->>'dish_id')::uuid,
        coalesce((v_dish->>'counted')::boolean, nullif(v_dish->>'qty', '') is not null),
        coalesce(nullif(v_dish->>'qty', '')::numeric, 0)
      )
      on conflict (document_id, dish_id) do update set counted = excluded.counted, qty = excluded.qty;
    end loop;
    perform public.erp_count_rebuild_components(v_id);
    perform public.erp_count_sync(v_id, coalesce((p_doc->>'rebuild_lines')::boolean, false));
  end if;

  if v_type = 'receipt' and p_doc ? 'acquisition_costs' then
    perform public.erp_save_document_acquisition_costs(v_id, p_doc->'acquisition_costs');
  end if;
  perform public.erp_apply_receipt_supplier(v_id);
  perform public.erp_audit(p_actor, 'document', v_id, 'save');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post: allocate acquisition, write lot tax snapshots, effective FIFO unit_cost
-- ---------------------------------------------------------------------------
create or replace function public.erp_post_document(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_settings public.erp_settings;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_out public.erp_products;
  v_taken record;
  v_now timestamptz := now();
  v_qty numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_rate numeric;
  v_unit_cost numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_current numeric;
  v_diff numeric;
  v_lines integer := 0;
  v_batch text;
  v_expires date;
  v_at timestamptz;
  v_status text;
  v_eff numeric;
  v_ded numeric;
  v_nonded numeric;
  v_pending numeric;
  v_acq numeric;
  v_acq_total numeric := 0;
  v_net_sum numeric := 0;
  v_snapshot jsonb;
  v_include boolean;
  v_line_rec record;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type = 'count' then
    return public.erp_post_count(p_id, p_actor);
  end if;
  if v_doc.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_doc.doc_no); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_settings from public.erp_settings where id = 1;
  v_at := coalesce(v_doc.occurred_at, v_doc.doc_date::timestamp at time zone public.erp_business_tz(), v_now);

  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  if v_doc.doc_type in ('transfer', 'production') then
    perform public.erp_check_warehouse(v_doc.target_warehouse_id, 'target_warehouse');
  end if;
  if v_doc.doc_type = 'transfer' and v_doc.warehouse_id = v_doc.target_warehouse_id then
    perform public.erp_raise('ERP_SAME_WAREHOUSE');
  end if;
  if v_doc.doc_type = 'production' then
    if v_doc.output_product_id is null then perform public.erp_raise('ERP_INVALID', 'output_product_id'); end if;
    if v_doc.output_qty is null or v_doc.output_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'output_qty'); end if;
    v_out := public.erp_check_product(v_doc.output_product_id);
  end if;

  -- Phase 8C: allocate document acquisition inventory amounts by line net weight (receipt only)
  if v_doc.doc_type = 'receipt' and coalesce(v_settings.input_vat_enabled, false) then
    select coalesce(sum(inventory_amount), 0) into v_acq_total
    from public.erp_document_acquisition_costs where document_id = p_id;
    if v_acq_total > 0 then
      v_net_sum := 0;
      for v_line_rec in
        select id, qty, unit_price, vat_rate, vat_included, vat_deduction_status, deductible_vat_pct, product_id
        from public.erp_document_lines where document_id = p_id
      loop
        if v_line_rec.unit_price is null or v_line_rec.qty is null or v_line_rec.qty <= 0 then continue; end if;
        v_rate := coalesce(v_line_rec.vat_rate, public.erp_effective_input_vat_rate(v_line_rec.product_id), 8);
        v_include := coalesce(v_line_rec.vat_included, v_doc.prices_include_vat);
        if v_include then
          v_gross := round(v_line_rec.qty * v_line_rec.unit_price, 4);
          v_net := round(v_gross / (1 + v_rate / 100), 4);
        else
          v_net := round(v_line_rec.qty * v_line_rec.unit_price, 4);
        end if;
        v_net_sum := v_net_sum + v_net;
        update public.erp_document_lines set allocated_acquisition_cost = v_net where id = v_line_rec.id; -- temp store net
      end loop;
      if v_net_sum > 0 then
        for v_line_rec in select id, allocated_acquisition_cost as line_net from public.erp_document_lines where document_id = p_id
        loop
          update public.erp_document_lines set
            allocated_acquisition_cost = case
              when coalesce(v_line_rec.line_net, 0) > 0
                then round(v_acq_total * v_line_rec.line_net / v_net_sum, 4)
              else 0
            end
          where id = v_line_rec.id;
        end loop;
        -- Fix rounding drift on last positive line
        select coalesce(sum(allocated_acquisition_cost), 0) into v_acq from public.erp_document_lines where document_id = p_id;
        if v_acq is distinct from v_acq_total then
          update public.erp_document_lines set
            allocated_acquisition_cost = allocated_acquisition_cost + (v_acq_total - v_acq)
          where id = (
            select id from public.erp_document_lines
            where document_id = p_id and coalesce(allocated_acquisition_cost, 0) > 0
            order by line_no desc limit 1
          );
        end if;
      end if;
    else
      update public.erp_document_lines set allocated_acquisition_cost = 0 where document_id = p_id;
    end if;
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_lines := v_lines + 1;
    v_product := public.erp_check_product(v_line.product_id);
    v_qty := v_line.qty;
    v_line_cost := 0;
    v_line_known := true;
    v_net := null; v_vat := null; v_gross := null; v_current := null; v_diff := null;
    v_ded := null; v_nonded := null; v_pending := null; v_acq := null; v_eff := null; v_snapshot := null;

    if v_doc.doc_type in ('opening', 'receipt') then
      if v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en); end if;
      if v_line.unit_price is null then
        v_unit_cost := null;
      else
        v_rate := coalesce(v_line.vat_rate, public.erp_effective_input_vat_rate(v_line.product_id), 8);
        v_include := coalesce(v_line.vat_included, v_doc.prices_include_vat);
        if v_settings.input_vat_enabled and v_doc.doc_type = 'receipt' then
          if v_include then
            v_gross := round(v_qty * v_line.unit_price, 4);
            v_net := round(v_gross / (1 + v_rate / 100), 4);
          else
            v_net := round(v_qty * v_line.unit_price, 4);
            v_gross := round(v_net * (1 + v_rate / 100), 4);
          end if;
          v_vat := v_gross - v_net;
          v_status := coalesce(nullif(v_line.vat_deduction_status, ''), 'pending');
          select s.deductible, s.non_deductible, s.pending
            into v_ded, v_nonded, v_pending
          from public.erp_split_purchase_vat(v_vat, v_status, v_line.deductible_vat_pct) s;
          v_acq := coalesce(v_line.allocated_acquisition_cost, 0);
          v_eff := public.erp_effective_inventory_cost(v_net, v_vat, v_status, v_line.deductible_vat_pct, v_acq);
          v_unit_cost := v_eff / v_qty;
          v_line_cost := v_eff;
          v_snapshot := jsonb_build_object(
            'base_unit', v_product.base_unit,
            'original_net_cost', v_net,
            'original_vat_amount', v_vat,
            'original_gross_cost', v_gross,
            'vat_rate_snapshot', v_rate,
            'vat_deduction_status', v_status,
            'deductible_vat_amount', v_ded,
            'non_deductible_vat_amount', v_nonded,
            'pending_vat_amount', v_pending,
            'allocated_acquisition_cost', v_acq,
            'effective_inventory_cost', v_eff,
            'tax_status_known', true
          );
        else
          v_net := round(v_qty * v_line.unit_price, 4);
          v_gross := v_net;
          v_vat := 0;
          v_unit_cost := v_net / v_qty;
          v_line_cost := v_net;
          v_eff := v_net;
          v_ded := 0; v_nonded := 0;
        end if;
      end if;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, v_unit_cost,
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_at, null, p_actor,
                                     v_snapshot);
      v_line_known := v_unit_cost is not null;
      if v_doc.doc_type = 'receipt' and v_unit_cost is not null then
        update public.erp_products
        set est_unit_cost = v_unit_cost, est_cost_source = 'receipt', est_cost_at = v_now, updated_by = p_actor
        where id = v_product.id;
      end if;

    elsif v_doc.doc_type in ('transfer', 'writeoff', 'production') then
      if v_qty <= 0 then
        if v_doc.doc_type = 'production' then continue; end if;
        perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en);
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost + v_taken.qty * v_taken.unit_cost; end if;
        if v_doc.doc_type = 'transfer' then
          perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.target_warehouse_id, v_taken.qty,
                                         v_taken.unit_cost, v_taken.batch_no, v_taken.expires_at,
                                         v_taken.received_at, v_taken.origin_lot_id, p_actor);
        end if;
      end loop;
    end if;

    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      net_amount = v_net, vat_amount = v_vat, gross_amount = v_gross,
      net_unit_price = case when v_net is not null and v_qty > 0 then round(v_net / v_qty, 6) else null end,
      gross_unit_price = case when v_gross is not null and v_qty > 0 then round(v_gross / v_qty, 6) else null end,
      deductible_vat_amount = v_ded,
      non_deductible_vat_amount = v_nonded,
      pending_vat_amount = v_pending,
      allocated_acquisition_cost = coalesce(v_acq, allocated_acquisition_cost),
      effective_inventory_cost = coalesce(v_eff, case when v_line_known then v_line_cost else null end),
      vat_deduction_status = coalesce(vat_deduction_status, case when v_doc.doc_type = 'receipt' then 'pending' else vat_deduction_status end),
      system_qty = v_current, diff_qty = v_diff,
      cost_amount = case when v_line_known then v_line_cost else null end,
      unit_cost = case when v_line_known and v_qty > 0 then round(v_line_cost / v_qty, 6) else null end,
      cost_known = v_line_known
    where id = v_line.id;

    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  if v_lines = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no); end if;
  if v_doc.doc_type = 'production' and not exists (
    select 1 from public.erp_document_lines where document_id = p_id and qty > 0
  ) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no);
  end if;

  if v_doc.doc_type = 'production' then
    v_batch := coalesce(v_doc.batch_no, v_doc.doc_no);
    v_expires := coalesce(v_doc.expires_at,
                          case when v_out.shelf_life_days is null then null else v_doc.doc_date + v_out.shelf_life_days end);
    v_unit_cost := case when v_known then round(v_total / v_doc.output_qty, 6) else null end;
    perform public.erp_receive_lot(p_id, null, v_out.id, v_doc.target_warehouse_id, v_doc.output_qty, v_unit_cost,
                                   v_batch, v_expires, v_at, null, p_actor);
    update public.erp_documents set output_unit_cost = v_unit_cost, batch_no = v_batch, expires_at = v_expires
    where id = p_id;
  end if;

  -- Missing invoice does not block posting; mark verification missing when empty.
  update public.erp_documents set
    status = 'posted', posted_at = v_now, posted_by = p_actor,
    occurred_at = coalesce(occurred_at, v_at),
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known,
    vat_verification_status = case
      when doc_type = 'receipt' and vat_verification_status is null
           and vat_invoice_number is null then 'missing'
      else vat_verification_status
    end
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known);
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
      'erp_split_purchase_vat', 'erp_effective_inventory_cost', 'erp_acquisition_inventory_amount',
      'erp_receive_lot', 'erp_save_document', 'erp_save_document_acquisition_costs', 'erp_post_document'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
