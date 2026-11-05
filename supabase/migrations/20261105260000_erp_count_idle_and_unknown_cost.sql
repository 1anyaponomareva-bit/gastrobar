-- Surplus lots keep a null unit_cost when last_lot and product_reference are missing
-- (unknown is not written as 0). Compatible: functions only.

create or replace function public.erp_post_count(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_at timestamptz;
  v_hash text;
  v_book record;
  v_cost record;
  v_source text;
  v_taken record;
  v_fact numeric;
  v_diff numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_missing text;
  v_conflict text;
  v_live numeric;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type <> 'count' then perform public.erp_raise('ERP_INVALID', 'doc_type'); end if;
  if v_doc.status = 'posted' then
    return jsonb_build_object(
      'id', p_id, 'doc_no', v_doc.doc_no, 'total_cost', v_doc.total_cost,
      'cost_known', v_doc.cost_known, 'idempotent', true
    );
  end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  if v_doc.superseded_by is not null then perform public.erp_raise('ERP_COUNT_SUPERSEDED', v_doc.doc_no); end if;
  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  perform 1 from public.erp_warehouses where id = v_doc.warehouse_id for update;

  v_at := coalesce(v_doc.counted_at, v_doc.occurred_at, public.erp_doc_at(v_doc), now());
  if v_doc.count_kind is null then
    update public.erp_documents set count_kind = 'partial', counted_at = v_at, occurred_at = v_at where id = p_id;
    v_doc.count_kind := 'partial';
  end if;

  perform public.erp_count_rebuild_components(p_id);
  perform public.erp_count_sync(p_id, false);
  select snapshot_hash into v_hash from public.erp_documents where id = p_id;
  if v_doc.snapshot_hash is not null and v_hash is distinct from v_doc.snapshot_hash and not v_doc.accept_stale then
    perform public.erp_raise('ERP_COUNT_STALE', coalesce(v_doc.snapshot_hash, '') || '>' || coalesce(v_hash, ''));
  end if;

  select string_agg(pr.name_en, ', ' order by pr.name_en) into v_missing
  from public.erp_document_lines l
  join public.erp_products pr on pr.id = l.product_id
  where l.document_id = p_id and not l.counted;
  if v_missing is not null then perform public.erp_raise('ERP_COUNT_INCOMPLETE', v_missing); end if;
  if not exists (select 1 from public.erp_document_lines where document_id = p_id) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no);
  end if;

  select string_agg(distinct d.doc_no || ':' || pr.name_en, ', ') into v_conflict
  from public.erp_document_lines l
  join public.erp_products pr on pr.id = l.product_id
  join public.erp_document_lines o on o.product_id = l.product_id
  join public.erp_documents d on d.id = o.document_id
  where l.document_id = p_id
    and d.id <> p_id and d.doc_type = 'count' and d.status = 'posted' and d.warehouse_id = v_doc.warehouse_id
    and d.superseded_by is null
    and (
      o.last_count_id is not distinct from l.last_count_id
      or public.erp_doc_at(d) = v_at
    )
    and public.erp_doc_at(d) <= v_at
    and not exists (
      select 1 from public.erp_documents later
      join public.erp_document_lines ll on ll.document_id = later.id and ll.product_id = l.product_id
      where later.doc_type = 'count' and later.status = 'posted' and later.warehouse_id = v_doc.warehouse_id
        and later.superseded_by is null
        and public.erp_doc_at(later) > public.erp_doc_at(d)
        and public.erp_doc_at(later) < v_at
    );
  if v_conflict is not null then perform public.erp_raise('ERP_COUNT_OVERLAP', v_conflict); end if;

  if v_doc.count_kind = 'full' then
    update public.erp_documents d set superseded_by = p_id, superseded_at = now(), updated_by = p_actor
    where d.doc_type = 'count' and d.status = 'draft' and d.warehouse_id = v_doc.warehouse_id
      and d.id <> p_id and d.superseded_by is null
      and coalesce(d.count_kind, 'partial') = 'partial';
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_product := public.erp_check_product(v_line.product_id);
    if v_line.count_mode = 'explode' then
      update public.erp_document_lines set
        system_qty = book_qty, diff_qty = 0, cost_amount = 0, cost_known = true, surplus_cost_source = null
      where id = v_line.id;
      continue;
    end if;
    perform 1 from public.erp_lots
    where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0 for update;
    select * into v_book from public.erp_count_book(v_doc.warehouse_id, v_product.id, v_at, v_doc.created_at, v_doc.id);
    v_fact := v_line.qty + coalesce(v_line.in_composition_qty, 0);
    v_diff := v_fact - v_book.book_qty;
    v_line_cost := 0;
    v_line_known := true;
    v_source := null;
    if v_diff < 0 then
      select coalesce(sum(qty_left), 0) into v_live
      from public.erp_lots where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0;
      if v_live < -v_diff then
        perform public.erp_raise('ERP_COUNT_LATER_STOCK',
          format('%s: need %s, current %s after later movements', v_product.name_en, round(-v_diff, 3), round(v_live, 3)));
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, -v_diff, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost - v_taken.qty * v_taken.unit_cost; end if;
      end loop;
    elsif v_diff > 0 then
      select * into v_cost from public.erp_count_surplus_cost(v_product.id, v_doc.warehouse_id);
      v_source := v_cost.source;
      -- Null cost stays null on the lot and the movement. Never coerce unknown to 0.
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_diff, v_cost.unit_cost,
                                     v_doc.doc_no, null, v_at, null, p_actor);
      v_line_known := v_cost.unit_cost is not null;
      v_line_cost := case when v_cost.unit_cost is null then null else v_diff * v_cost.unit_cost end;
    end if;
    v_line_cost := case when v_line_cost is null then null else round(v_line_cost, 4) end;
    update public.erp_document_lines set
      system_qty = v_book.book_qty, book_qty = v_book.book_qty, diff_qty = v_diff,
      opening_qty = v_book.opening_qty, in_qty = v_book.in_qty, out_qty = v_book.out_qty,
      period_start = v_book.period_start, last_count_id = v_book.last_count_id,
      count_moves = v_book.moves,
      cost_amount = case when v_line_known then v_line_cost else null end,
      cost_known = v_line_known,
      surplus_cost_source = v_source
    where id = v_line.id;
    if v_line_known then v_total := v_total + coalesce(v_line_cost, 0); else v_known := false; end if;
  end loop;

  update public.erp_documents set
    status = 'posted', posted_at = now(), posted_by = p_actor,
    counted_at = v_at, occurred_at = v_at,
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known,
    accept_stale = false
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known, 'idempotent', false);
end;
$$;
