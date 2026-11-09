-- Store the human name of whoever tapped Order. Kitchen@gastrofood stays the
-- technical actor for RLS; display is placed_by_name, not the local-part "kitchen".
-- Additive: column + JSON fields. Does not drop data or change stock/receive.

alter table public.erp_supplier_orders
  add column if not exists placed_by_name text;

create or replace function public.erp_order_place(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_wh uuid;
  v_name text;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_order_assert_owner(v_actor, v);
  if v.status = 'closed' then perform public.erp_raise('ERP_ORDER_CLOSED'); end if;
  if v.status <> 'draft' and v.placed_revision is not distinct from v.revision then
    return public.erp_order_to_json(v.id);
  end if;
  if not exists (select 1 from public.erp_supplier_order_lines where order_id = v.id) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v.order_no);
  end if;
  v_wh := coalesce(v.warehouse_id, public.erp_order_default_warehouse());
  if v_wh is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;
  perform public.erp_check_warehouse(v_wh, 'warehouse');

  v_name := nullif(btrim(coalesce(v.placed_by_name, '')), '');
  if v_name is null and v_actor is distinct from 'kitchen@gastrofood' then
    select nullif(btrim(u.display_name), '')
      into v_name
    from public.erp_order_users u
    where u.email = v_actor
    limit 1;
  end if;

  update public.erp_supplier_orders
  set status = case when status = 'draft' then 'ordered' else status end,
      warehouse_id = v_wh,
      placed_revision = revision,
      placed_at = coalesce(placed_at, now()),
      placed_by = coalesce(placed_by, v_actor),
      placed_by_name = coalesce(placed_by_name, v_name),
      ordered_at = coalesce(placed_at, now()),
      supplier_name = (select name from public.erp_suppliers where id = v.supplier_id),
      warehouse_name = (select name from public.erp_warehouses where id = v_wh),
      updated_by = v_actor,
      lock_version = lock_version + 1
  where id = v.id;

  update public.erp_supplier_orders
  set pdf_snapshot = public.erp_order_build_pdf_input(id)
  where id = v.id;

  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'place');
  return public.erp_order_to_json(v.id);
end;
$$;

create or replace function public.erp_order_to_json(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v public.erp_supplier_orders;
  v_lines jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_line record;
  v_rec record;
  v_rlines jsonb;
  v_snap jsonb;
begin
  select * into v from public.erp_supplier_orders where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  v_snap := public.erp_order_pdf_input(p_id);

  for v_line in
    select id from public.erp_supplier_order_lines where order_id = p_id order by line_no, id
  loop
    v_lines := v_lines || public.erp_order_line_json(v_line.id);
  end loop;

  for v_rec in
    select r.*, d.doc_no, d.status as doc_status, d.posted_at, d.posted_by, d.created_at as doc_created
    from public.erp_order_receipts r
    left join public.erp_documents d on d.id = r.document_id
    where r.order_id = p_id
    order by r.created_at, r.id
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'orderLineId', l.order_line_id,
      'product_id', l.product_id,
      'pack_id', l.pack_id,
      'qty', l.qty,
      'packQty', l.pack_qty,
      'unitPrice', l.unit_price,
      'discrepancy', l.discrepancy,
      'reason', l.reason
    ) order by l.line_no), '[]'::jsonb)
    into v_rlines
    from public.erp_document_lines l
    where l.document_id = v_rec.document_id;

    v_receipts := v_receipts || jsonb_build_object(
      'id', v_rec.id,
      'documentId', v_rec.document_id,
      'docNo', v_rec.doc_no,
      'status', v_rec.doc_status,
      'reviewStatus', case
        when v_rec.doc_status = 'posted' then 'posted'
        when v_rec.doc_status = 'cancelled' then 'cancelled'
        when v_rec.needs_clarify then 'clarify'
        else 'pending'
      end,
      'needsClarify', v_rec.needs_clarify,
      'clarifyReason', v_rec.clarify_reason,
      'comment', v_rec.comment,
      'photos', coalesce(v_rec.photos, '[]'::jsonb),
      'createdBy', v_rec.created_by,
      'createdAt', v_rec.created_at,
      'postedAt', v_rec.posted_at,
      'postedBy', v_rec.posted_by,
      'lines', coalesce(v_rlines, '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'id', v.id,
    'orderNo', v.order_no,
    'status', v.status,
    'revision', v.revision,
    'placedRevision', v.placed_revision,
    'lastPdfRevision', v.last_pdf_revision,
    'supplierId', v.supplier_id,
    'supplierName', coalesce(v.supplier_name, (select name from public.erp_suppliers where id = v.supplier_id)),
    'warehouseId', v.warehouse_id,
    'warehouseName', coalesce(v.warehouse_name, (select name from public.erp_warehouses where id = v.warehouse_id)),
    'comment', v.comment,
    'expectedDelivery', v.expected_delivery,
    'author', v.created_by,
    'placedBy', v.placed_by,
    'placedByName', v.placed_by_name,
    'placedAt', v.placed_at,
    'receivedAt', v.received_at,
    'receivedBy', v.received_by,
    'orderedAt', v_snap->>'orderedAt',
    'createdAt', v.created_at,
    'updatedAt', v.updated_at,
    'closedAt', v.closed_at,
    'closeReason', v.close_reason,
    'snapshot', v_snap,
    'lines', v_lines,
    'receipts', v_receipts
  );
end;
$$;

create or replace function public.erp_order_list(p_actor text, p_admin boolean default false, p_status text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v jsonb := '[]'::jsonb;
  v_row record;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  for v_row in
    select o.*,
           coalesce(sum(p.remaining_qty), 0) as remaining_qty,
           coalesce(sum(p.accepted_qty), 0) as accepted_qty,
           coalesce(sum(p.posted_qty), 0) as posted_qty,
           coalesce(sum(p.ordered_qty), 0) as ordered_qty
    from public.erp_supplier_orders o
    left join public.erp_order_line_progress p on p.order_id = o.id
    where (p_status is null or o.status = p_status)
      and (
        coalesce(p_admin, false)
        or lower(o.created_by) = v_actor
        or exists (
          select 1 from public.erp_order_grants g
          where g.owner_email = lower(o.created_by) and g.grantee_email = v_actor
        )
      )
    group by o.id
    order by coalesce(o.placed_at, o.created_at) desc, o.created_at desc
  loop
    v := v || jsonb_build_object(
      'id', v_row.id,
      'orderNo', v_row.order_no,
      'status', v_row.status,
      'revision', v_row.revision,
      'supplierId', v_row.supplier_id,
      'supplierName', coalesce(v_row.supplier_name, (select name from public.erp_suppliers where id = v_row.supplier_id)),
      'warehouseId', v_row.warehouse_id,
      'warehouseName', coalesce(v_row.warehouse_name, (select name from public.erp_warehouses where id = v_row.warehouse_id)),
      'author', v_row.created_by,
      'placedBy', v_row.placed_by,
      'placedByName', v_row.placed_by_name,
      'placedAt', v_row.placed_at,
      'receivedAt', v_row.received_at,
      'receivedBy', v_row.received_by,
      'expectedDelivery', v_row.expected_delivery,
      'orderedQty', v_row.ordered_qty,
      'acceptedQty', v_row.accepted_qty,
      'postedQty', v_row.posted_qty,
      'remainingQty', v_row.remaining_qty
    );
  end loop;
  return v;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_order_place', 'erp_order_to_json', 'erp_order_list')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
