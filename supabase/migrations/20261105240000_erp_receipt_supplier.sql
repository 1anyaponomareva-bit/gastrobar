-- Receipts saved without a header supplier still keep the pack / product supplier
-- on the lines. Fill the header from those lines on draft save. Posted documents
-- are locked by erp_save_document, so lots and FIFO are not rewritten.

create or replace function public.erp_inferred_line_supplier(p_pack uuid, p_product uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_pack uuid;
  v_ids uuid[];
begin
  if p_pack is not null then
    select supplier_id into v_pack
    from public.erp_product_packs
    where id = p_pack and archived_at is null;
    if v_pack is not null then return v_pack; end if;
  end if;
  if p_product is null then return null; end if;
  select array_agg(distinct sid) into v_ids
  from (
    select staff_supplier_id as sid from public.erp_products where id = p_product and staff_supplier_id is not null
    union
    select supplier_id from public.erp_product_packs
    where product_id = p_product and supplier_id is not null and archived_at is null
  ) s;
  if v_ids is not null and cardinality(v_ids) = 1 then
    return v_ids[1];
  end if;
  return null;
end;
$$;

create or replace function public.erp_apply_receipt_supplier(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_sid uuid;
begin
  select case when count(*) = 1 then (array_agg(sid))[1] end
  into v_sid
  from (
    select distinct public.erp_inferred_line_supplier(pack_id, product_id) as sid
    from public.erp_document_lines
    where document_id = p_id
  ) x
  where sid is not null;

  update public.erp_documents
  set supplier_id = v_sid
  where id = p_id
    and doc_type = 'receipt'
    and status = 'draft'
    and supplier_id is null
    and v_sid is not null;
end;
$$;

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
    current_date
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
        batch_no = nullif(btrim(v_line->>'batch_no'), ''),
        expires_at = nullif(v_line->>'expires_at', '')::date,
        reason = nullif(btrim(v_line->>'reason'), ''),
        count_mode = nullif(v_line->>'count_mode', '')
      where document_id = v_id and product_id = v_pid;
      if not found then
        insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                               unit_price, vat_rate, batch_no, expires_at, reason, count_mode)
        values (v_id, v_i, v_pid, v_qty, v_counted,
                nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
                nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
                nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
                nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''),
                nullif(v_line->>'count_mode', ''));
      end if;
    else
      insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                             unit_price, vat_rate, batch_no, expires_at, reason, count_mode)
      values (v_id, v_i, v_pid, v_qty, v_counted,
              nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
              nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
              nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
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

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('erp_inferred_line_supplier', 'erp_apply_receipt_supplier', 'erp_save_document')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
