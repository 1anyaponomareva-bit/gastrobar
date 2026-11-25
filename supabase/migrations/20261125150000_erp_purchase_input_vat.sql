-- Phase 8B: purchase document Input VAT fields (additive).
-- Does NOT rewrite historical lots. New posts use effective inventory cost when status set.
-- NOT applied to production until Nikita's separate SQL OK.

-- Ensure Vietnam calendar helper exists (idempotent; also in 20261114153000).
create or replace function public.erp_business_today()
returns date
language sql
stable
as $$
  select (now() at time zone public.erp_business_tz())::date;
$$;

-- ---------------------------------------------------------------------------
-- Document header
-- ---------------------------------------------------------------------------
alter table public.erp_documents
  add column if not exists supplier_tax_code text,
  add column if not exists vat_invoice_number text,
  add column if not exists vat_invoice_serial text,
  add column if not exists vat_invoice_date date,
  add column if not exists invoice_attachment_url text,
  add column if not exists vat_verification_status text,
  add column if not exists payment_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_documents_vat_verification_check'
      and conrelid = 'public.erp_documents'::regclass
  ) then
    alter table public.erp_documents
      add constraint erp_documents_vat_verification_check
      check (
        vat_verification_status is null
        or vat_verification_status in ('missing', 'pending', 'verified', 'rejected')
      );
  end if;
end $$;

comment on column public.erp_documents.vat_verification_status is
  'missing = no invoice yet (stock still allowed); pending/verified/rejected for invoice check. Missing ≠ deductible.';

-- Optional supplier master tax code (defaults into document header)
alter table public.erp_suppliers
  add column if not exists tax_code text;

-- ---------------------------------------------------------------------------
-- Document lines
-- ---------------------------------------------------------------------------
alter table public.erp_document_lines
  add column if not exists vat_included boolean,
  add column if not exists vat_deduction_status text,
  add column if not exists deductible_vat_pct numeric(5,2),
  add column if not exists deductible_vat_amount numeric(18,4),
  add column if not exists non_deductible_vat_amount numeric(18,4),
  add column if not exists effective_inventory_cost numeric(18,4),
  add column if not exists net_unit_price numeric(18,6),
  add column if not exists gross_unit_price numeric(18,6);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_document_lines_vat_deduction_check'
      and conrelid = 'public.erp_document_lines'::regclass
  ) then
    alter table public.erp_document_lines
      add constraint erp_document_lines_vat_deduction_check
      check (
        vat_deduction_status is null
        or vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'erp_document_lines_deductible_pct_check'
      and conrelid = 'public.erp_document_lines'::regclass
  ) then
    alter table public.erp_document_lines
      add constraint erp_document_lines_deductible_pct_check
      check (deductible_vat_pct is null or (deductible_vat_pct >= 0 and deductible_vat_pct <= 100));
  end if;
end $$;

comment on column public.erp_document_lines.vat_deduction_status is
  'pending (default) | deductible | partial | non_deductible. Pending includes VAT in inventory cost until confirmed.';
comment on column public.erp_document_lines.effective_inventory_cost is
  'Net + non-deductible VAT (+ future allocated acquisition). Preview/post snapshot.';

-- ---------------------------------------------------------------------------
-- Helper: effective inventory cost from net/vat/status
-- ---------------------------------------------------------------------------
create or replace function public.erp_effective_inventory_cost(
  p_net numeric,
  p_vat numeric,
  p_status text,
  p_deductible_pct numeric default null
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_status text := coalesce(nullif(p_status, ''), 'pending');
  v_vat numeric := coalesce(p_vat, 0);
  v_net numeric := coalesce(p_net, 0);
  v_ded numeric := 0;
  v_pct numeric;
begin
  if v_vat <= 0 then return round(v_net, 4); end if;
  if v_status = 'deductible' then
    return round(v_net, 4);
  elsif v_status in ('non_deductible', 'pending') then
    return round(v_net + v_vat, 4);
  elsif v_status = 'partial' then
    v_pct := greatest(0, least(100, coalesce(p_deductible_pct, 0)));
    v_ded := round(v_vat * v_pct / 100.0, 4);
    return round(v_net + (v_vat - v_ded), 4);
  end if;
  return round(v_net + v_vat, 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- Save document: persist new header/line fields (based on vietnam_today save)
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

  perform public.erp_apply_receipt_supplier(v_id);
  perform public.erp_audit(p_actor, 'document', v_id, 'save');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post receipt: persist VAT split + effective inventory cost; lot.unit_cost = effective
-- Historical posted docs unchanged. Opening still uses net (no input VAT status).
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
  v_include boolean;
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

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_lines := v_lines + 1;
    v_product := public.erp_check_product(v_line.product_id);
    v_qty := v_line.qty;
    v_line_cost := 0;
    v_line_known := true;
    v_net := null; v_vat := null; v_gross := null; v_current := null; v_diff := null;
    v_ded := null; v_nonded := null; v_eff := null;

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
          v_eff := public.erp_effective_inventory_cost(v_net, v_vat, v_status, v_line.deductible_vat_pct);
          if v_status = 'deductible' then
            v_ded := v_vat; v_nonded := 0;
          elsif v_status = 'partial' then
            v_ded := round(v_vat * greatest(0, least(100, coalesce(v_line.deductible_vat_pct, 0))) / 100.0, 4);
            v_nonded := v_vat - v_ded;
          else
            v_ded := 0; v_nonded := v_vat;
          end if;
          v_unit_cost := v_eff / v_qty;
          v_line_cost := v_eff;
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
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_at, null, p_actor);
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

-- Persist supplier tax_code via erp_save_ref (based on Phase 7 channel finance save_ref).
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
      insert into public.erp_suppliers (code, name, zalo_url, tax_code, sort)
      values (public.erp_unique_code('erp_suppliers', v_name), v_name, nullif(btrim(p->>'zalo_url'), ''),
              nullif(btrim(p->>'tax_code'), ''),
              coalesce((select max(sort) + 1 from public.erp_suppliers), 0))
      returning id into v_id;
    else
      update public.erp_suppliers set
        name = v_name,
        zalo_url = nullif(btrim(p->>'zalo_url'), ''),
        tax_code = case when p ? 'tax_code' then nullif(btrim(p->>'tax_code'), '') else tax_code end
      where id = v_id;
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
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'erp_save_document', 'erp_post_document', 'erp_effective_inventory_cost',
      'erp_save_ref', 'erp_business_today'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
