-- TEMPORARY until the full site: «Товар получен» only flags the supplier order.
-- It does not create an unpublished ERP receipt (поставка), does not set
-- source_order_id, and does not move warehouse stock. Restore
-- receive → draft receipt → admin post later.

alter table public.erp_supplier_orders
  add column if not exists received_at timestamptz;
alter table public.erp_supplier_orders
  add column if not exists received_by text;
alter table public.erp_supplier_orders
  add column if not exists receive_keys text[] not null default '{}';

alter table public.erp_supplier_order_lines
  add column if not exists received_qty numeric(18,6) not null default 0;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'erp_supplier_orders'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.erp_supplier_orders drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.erp_supplier_orders
  add constraint erp_supplier_orders_status_check
  check (status in ('draft', 'ordered', 'partial', 'received', 'closed'));

create or replace view public.erp_order_line_progress as
select
  ol.id as line_id,
  ol.order_id,
  ol.qty as ordered_qty,
  coalesce(ol.closed_qty, 0) as closed_qty,
  coalesce(ol.received_qty, 0) + coalesce((
    select sum(l.qty)
    from public.erp_document_lines l
    join public.erp_documents d on d.id = l.document_id
    where l.order_line_id = ol.id
      and d.doc_type = 'receipt'
      and d.status in ('draft', 'posted')
  ), 0) as accepted_qty,
  coalesce((
    select sum(l.qty)
    from public.erp_document_lines l
    join public.erp_documents d on d.id = l.document_id
    where l.order_line_id = ol.id
      and d.doc_type = 'receipt'
      and d.status = 'posted'
  ), 0) as posted_qty,
  greatest(
    0,
    ol.qty
      - coalesce(ol.closed_qty, 0)
      - coalesce(ol.received_qty, 0)
      - coalesce((
          select sum(l.qty)
          from public.erp_document_lines l
          join public.erp_documents d on d.id = l.document_id
          where l.order_line_id = ol.id
            and d.doc_type = 'receipt'
            and d.status in ('draft', 'posted')
        ), 0)
  ) as remaining_qty
from public.erp_supplier_order_lines ol;

create or replace function public.erp_order_refresh_status(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_remaining numeric;
  v_accepted numeric;
  v_close text;
  v_received timestamptz;
begin
  select status, close_reason, received_at
    into v_status, v_close, v_received
  from public.erp_supplier_orders where id = p_id;
  if not found or v_status = 'draft' then return; end if;
  select coalesce(sum(remaining_qty), 0), coalesce(sum(accepted_qty), 0)
    into v_remaining, v_accepted
  from public.erp_order_line_progress
  where order_id = p_id;
  update public.erp_supplier_orders
  set status = case
        when v_remaining <= 0 and coalesce(v_close, '') <> '' then 'closed'
        when v_remaining <= 0 and v_received is not null then 'received'
        when v_remaining <= 0 then 'closed'
        when v_accepted > 0 then 'partial'
        else 'ordered'
      end,
      closed_at = case
        when v_remaining <= 0 and coalesce(v_close, '') <> '' then coalesce(closed_at, now())
        else closed_at
      end
  where id = p_id;
end;
$$;

create or replace function public.erp_order_receive(p_id uuid, p_payload jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_key text;
  v_line jsonb;
  v_ol public.erp_supplier_order_lines;
  v_qty numeric;
  v_pack_qty numeric;
  v_i integer := 0;
begin
  -- TEMPORARY: flag received qty on the order only. Do not create erp_documents,
  -- erp_order_receipts, or stock movements. Full unpublished receipt path comes later.
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  v_key := nullif(btrim(coalesce(p_payload->>'idempotencyKey', p_payload->>'idempotency_key', '')), '');
  if v_key is null then perform public.erp_raise('ERP_INVALID', 'idempotencyKey'); end if;

  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_order_assert_see(v_actor, v, false);
  if v.status = 'draft' then perform public.erp_raise('ERP_INVALID', 'not_placed'); end if;
  if v.status = 'closed' then perform public.erp_raise('ERP_ORDER_CLOSED'); end if;
  if v_key = any(coalesce(v.receive_keys, '{}')) then
    return public.erp_order_to_json(v.id);
  end if;
  if v.status = 'received' then
    return public.erp_order_to_json(v.id);
  end if;
  if v.warehouse_id is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    select * into v_ol
    from public.erp_supplier_order_lines
    where id = nullif(coalesce(v_line->>'orderLineId', v_line->>'order_line_id', v_line->>'id'), '')::uuid
      and order_id = v.id;
    if not found then perform public.erp_raise('ERP_INVALID', 'order_line_id'); end if;

    v_pack_qty := nullif(coalesce(v_line->>'packQty', v_line->>'pack_qty'), '')::numeric;
    v_qty := nullif(coalesce(v_line->>'qty', v_line->>'actualQty', v_line->>'actual_qty'), '')::numeric;
    if v_qty is null and v_pack_qty is not null then
      v_qty := round(v_pack_qty * coalesce(v_ol.pack_qty_base, 1), 6);
    end if;
    if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_ol.name_en); end if;

    update public.erp_supplier_order_lines
    set received_qty = coalesce(received_qty, 0) + v_qty
    where id = v_ol.id;
    v_i := v_i + 1;
  end loop;

  if v_i = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT'); end if;

  update public.erp_supplier_orders
  set received_at = coalesce(received_at, now()),
      received_by = coalesce(received_by, v_actor),
      receive_keys = array_append(coalesce(receive_keys, '{}'), v_key),
      updated_by = v_actor
  where id = v.id;

  perform public.erp_order_refresh_status(v.id);
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'receive', null,
    jsonb_build_object('temporary', true, 'idempotency_key', v_key));
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

revoke all on public.erp_order_line_progress from public, anon, authenticated;
grant select on public.erp_order_line_progress to service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_order_receive', 'erp_order_refresh_status', 'erp_order_to_json', 'erp_order_list')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
