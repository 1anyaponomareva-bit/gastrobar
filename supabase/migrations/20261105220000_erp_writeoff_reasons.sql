-- Write-offs: a reasons reference linked to documents, the time of a write-off, and a key that
-- makes a repeated "save/post" of a new document return the same document instead of a copy.
-- Only adds a table, columns, an index and functions; no data changes. Safe to run again.

create table if not exists public.erp_writeoff_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  color text not null default '#3b82f6' check (color ~ '^#[0-9a-f]{6}$'),
  -- Where the write-off counts in P&L, as in Poster: cost of goods or expenses.
  pnl_block text not null default 'cost' check (pnl_block in ('cost', 'expense')),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists erp_writeoff_reasons_name_idx
  on public.erp_writeoff_reasons (lower(btrim(name))) where archived_at is null;

alter table public.erp_writeoff_reasons enable row level security;
revoke all on public.erp_writeoff_reasons from public, anon, authenticated;
grant all on public.erp_writeoff_reasons to service_role;

-- Archived reasons stay referenced by old documents; a reason is never deleted.
alter table public.erp_documents add column if not exists reason_id uuid references public.erp_writeoff_reasons (id);
alter table public.erp_documents add column if not exists doc_time time;
alter table public.erp_documents add column if not exists client_key uuid;
create unique index if not exists erp_documents_client_key_idx on public.erp_documents (client_key) where client_key is not null;
create index if not exists erp_documents_reason_idx on public.erp_documents (reason_id) where reason_id is not null;

create or replace function public.erp_save_writeoff_reason(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_color text := lower(coalesce(nullif(btrim(p->>'color'), ''), '#3b82f6'));
  v_block text := coalesce(nullif(p->>'pnl_block', ''), 'cost');
  v_archived boolean := coalesce((p->>'archived')::boolean, false);
begin
  if length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_id is null then
    insert into public.erp_writeoff_reasons (name, color, pnl_block, sort, created_by, updated_by)
    values (v_name, v_color, v_block, coalesce((select max(sort) + 1 from public.erp_writeoff_reasons), 0), p_actor, p_actor)
    returning id into v_id;
    perform public.erp_audit(p_actor, 'writeoff_reason', v_id, 'create');
    return v_id;
  end if;
  perform 1 from public.erp_writeoff_reasons where id = v_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  update public.erp_writeoff_reasons set
    name = v_name, color = v_color, pnl_block = v_block,
    archived_at = case when v_archived then coalesce(archived_at, now()) else null end,
    updated_at = now(), updated_by = p_actor
  where id = v_id;
  perform public.erp_audit(p_actor, 'writeoff_reason', v_id, case when v_archived then 'archive' else 'save' end);
  return v_id;
end;
$$;

revoke all on function public.erp_save_writeoff_reason(jsonb, text) from public, anon, authenticated;
grant execute on function public.erp_save_writeoff_reason(jsonb, text) to service_role;

-- As before, plus: reason_id (an archived reason may stay on a draft that already had it, but
-- cannot be newly chosen), doc_time, and client_key — a new document sent again with the same
-- key is the same document: a draft is updated, a posted or cancelled one is refused.
create or replace function public.erp_save_document(p_doc jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p_doc->>'id', '')::uuid;
  v_type text := p_doc->>'doc_type';
  v_key uuid := nullif(p_doc->>'client_key', '')::uuid;
  v_reason uuid := nullif(p_doc->>'reason_id', '')::uuid;
  v_existing public.erp_documents;
  v_prefix text;
  v_line jsonb;
  v_i integer := 0;
begin
  if v_id is null and v_key is not null then
    select id into v_id from public.erp_documents where client_key = v_key;
  end if;
  if v_id is not null then
    select * into v_existing from public.erp_documents where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_existing.status = 'posted' and v_key is not null and v_existing.client_key = v_key then
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

  if v_reason is not null and (v_existing.id is null or v_existing.reason_id is distinct from v_reason) then
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

  update public.erp_documents set
    doc_date = coalesce(nullif(p_doc->>'doc_date', '')::date, current_date),
    doc_time = nullif(p_doc->>'doc_time', '')::time,
    warehouse_id = nullif(p_doc->>'warehouse_id', '')::uuid,
    target_warehouse_id = nullif(p_doc->>'target_warehouse_id', '')::uuid,
    supplier_id = nullif(p_doc->>'supplier_id', '')::uuid,
    reason = nullif(btrim(p_doc->>'reason'), ''),
    reason_id = v_reason,
    comment = nullif(btrim(p_doc->>'comment'), ''),
    prices_include_vat = coalesce((p_doc->>'prices_include_vat')::boolean, false),
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

  delete from public.erp_document_lines where document_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_doc->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    insert into public.erp_document_lines (document_id, line_no, product_id, qty, planned_qty, pack_id, pack_qty,
                                           unit_price, vat_rate, batch_no, expires_at, reason)
    values (v_id, v_i, (v_line->>'product_id')::uuid, coalesce(nullif(v_line->>'qty', '')::numeric, 0),
            nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
            nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
            nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
            nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''));
  end loop;

  perform public.erp_audit(p_actor, 'document', v_id, 'save');
  return v_id;
end;
$$;

-- As before, except that a write-off no longer needs a reason: one without a reason is shown as
-- "No reason". Everything else (stock check, FIFO lots, one transaction, no double posting) is unchanged.
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
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_doc.doc_no); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_settings from public.erp_settings where id = 1;

  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  if v_doc.doc_type in ('transfer', 'production') then
    perform public.erp_check_warehouse(v_doc.target_warehouse_id, 'target_warehouse');
  end if;
  if v_doc.doc_type = 'transfer' and v_doc.warehouse_id = v_doc.target_warehouse_id then
    perform public.erp_raise('ERP_SAME_WAREHOUSE');
  end if;

  if v_doc.doc_type = 'production' then
    if v_doc.output_product_id is null then perform public.erp_raise('ERP_INVALID', 'output_product_id'); end if;
    if v_doc.output_qty is null then perform public.erp_raise('ERP_INVALID', 'output_qty'); end if;
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

    if v_doc.doc_type in ('opening', 'receipt') then
      if v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en); end if;
      if v_line.unit_price is null then
        v_unit_cost := null;
      else
        v_rate := coalesce(v_line.vat_rate, v_settings.default_input_vat_rate, 0);
        if v_settings.input_vat_enabled and v_doc.doc_type = 'receipt' then
          if v_doc.prices_include_vat then
            v_gross := round(v_qty * v_line.unit_price, 4);
            v_net := round(v_gross / (1 + v_rate / 100), 4);
          else
            v_net := round(v_qty * v_line.unit_price, 4);
            v_gross := round(v_net * (1 + v_rate / 100), 4);
          end if;
          v_vat := v_gross - v_net;
        else
          v_net := round(v_qty * v_line.unit_price, 4);
          v_gross := v_net;
          v_vat := 0;
        end if;
        -- Recoverable input VAT is not part of the inventory cost.
        v_unit_cost := v_net / v_qty;
      end if;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, v_unit_cost,
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_now, null, p_actor);
      v_line_known := v_unit_cost is not null;
      v_line_cost := v_net;
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

    elsif v_doc.doc_type = 'count' then
      perform 1 from public.erp_lots
      where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0 for update;
      select coalesce(sum(qty_left), 0) into v_current from public.erp_lots
      where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0;
      v_diff := v_qty - v_current;
      if v_diff < 0 then
        for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, -v_diff, p_actor)
        loop
          if v_taken.unit_cost is null then v_line_known := false;
          else v_line_cost := v_line_cost - v_taken.qty * v_taken.unit_cost; end if;
        end loop;
      elsif v_diff > 0 then
        -- Surplus is valued at the latest known lot cost here, else the current estimate, else unknown.
        select l.unit_cost into v_unit_cost from public.erp_lots l
        where l.product_id = v_product.id and l.warehouse_id = v_doc.warehouse_id and l.unit_cost is not null
        order by l.received_at desc, l.created_at desc limit 1;
        v_unit_cost := coalesce(v_unit_cost, v_product.est_unit_cost);
        perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_diff, v_unit_cost,
                                       v_doc.doc_no, null, v_now, null, p_actor);
        v_line_known := v_unit_cost is not null;
        v_line_cost := case when v_unit_cost is null then 0 else v_diff * v_unit_cost end;
      end if;
    end if;

    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      net_amount = v_net, vat_amount = v_vat, gross_amount = v_gross,
      system_qty = v_current, diff_qty = v_diff,
      cost_amount = case when v_line_known then v_line_cost else null end,
      unit_cost = case when v_line_known and v_qty > 0 and v_doc.doc_type <> 'count' then round(v_line_cost / v_qty, 6) else null end,
      cost_known = v_line_known
    where id = v_line.id;

    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  if v_lines = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no); end if;

  if v_doc.doc_type = 'production' then
    v_batch := coalesce(v_doc.batch_no, v_doc.doc_no);
    v_expires := coalesce(v_doc.expires_at,
                          case when v_out.shelf_life_days is null then null else v_doc.doc_date + v_out.shelf_life_days end);
    v_unit_cost := case when v_known then round(v_total / v_doc.output_qty, 6) else null end;
    perform public.erp_receive_lot(p_id, null, v_out.id, v_doc.target_warehouse_id, v_doc.output_qty, v_unit_cost,
                                   v_batch, v_expires, v_now, null, p_actor);
    update public.erp_documents set output_unit_cost = v_unit_cost, batch_no = v_batch, expires_at = v_expires
    where id = p_id;
  end if;

  update public.erp_documents set
    status = 'posted', posted_at = v_now, posted_by = p_actor,
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known);
end;
$$;
