-- Frozen OrderPdfInput snapshot + revision rules.
-- POST pdf bumps revision and freezes names/units/qty; it does not place the order.
-- Filename identity is revision (…_rN_…), stored here as pdf_snapshot.

alter table public.erp_supplier_orders
  add column if not exists pdf_snapshot jsonb;
alter table public.erp_supplier_orders
  add column if not exists last_pdf_revision integer;
alter table public.erp_supplier_orders
  add column if not exists ordered_at timestamptz;

drop index if exists public.erp_supplier_orders_open_uidx;
drop index if exists public.erp_supplier_orders_draft_uidx;
create unique index if not exists erp_supplier_orders_draft_uidx
  on public.erp_supplier_orders (lower(created_by), supplier_id)
  where status = 'draft';

create or replace function public.erp_order_build_pdf_input(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  o public.erp_supplier_orders;
  v_at timestamptz;
begin
  select * into o from public.erp_supplier_orders where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  v_at := coalesce(o.ordered_at, o.placed_at, o.created_at, now());
  return jsonb_build_object(
    'orderNo', o.order_no,
    'revision', o.revision,
    'orderedAt', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'supplierName', coalesce(o.supplier_name, (select name from public.erp_suppliers where id = o.supplier_id), ''),
    'warehouseName', coalesce(o.warehouse_name, (select name from public.erp_warehouses where id = o.warehouse_id)),
    'comment', o.comment,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nameEn', l.name_en,
        'nameVn', coalesce(l.name_vn, ''),
        'brand', coalesce(l.brand, ''),
        'packLabel', coalesce(l.pack_label, ''),
        'unit', coalesce(l.unit, ''),
        'qty', coalesce(l.pack_qty, l.qty)
      ) order by l.line_no, l.id)
      from public.erp_supplier_order_lines l
      where l.order_id = o.id and l.qty > 0
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.erp_order_pdf_input(p_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (select pdf_snapshot from public.erp_supplier_orders where id = p_id and pdf_snapshot is not null),
    public.erp_order_build_pdf_input(p_id)
  );
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

drop function if exists public.erp_order_replace_lines(uuid, uuid, jsonb, boolean);

create or replace function public.erp_order_replace_lines(p_order uuid, p_supplier uuid, p_lines jsonb, p_keep_accepted boolean)
returns void
language plpgsql
as $$
declare
  v_line jsonb;
  v_i integer := 0;
  v_product uuid;
  v_pack uuid;
  v_p public.erp_products;
  v_link public.erp_product_packs;
  v_pack_row public.erp_packs;
  v_qty numeric;
  v_pack_qty numeric;
  v_price numeric;
  v_qty_base numeric;
  v_unit text;
  v_existing uuid;
  v_accepted numeric;
  v_keep uuid[] := '{}';
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_product := nullif(coalesce(v_line->>'product_id', v_line->>'productId'), '')::uuid;
    if v_product is null then perform public.erp_raise('ERP_INVALID', 'product_id'); end if;
    select * into v_p from public.erp_products where id = v_product;
    if not found then perform public.erp_raise('ERP_PRODUCT_NOT_FOUND'); end if;
    if not p_keep_accepted and v_p.archived_at is not null then
      perform public.erp_raise('ERP_PRODUCT_ARCHIVED', v_p.name_en);
    end if;
    if v_p.base_unit is null then perform public.erp_raise('ERP_PRODUCT_NO_UNIT', v_p.name_en); end if;

    v_pack := nullif(coalesce(v_line->>'pack_id', v_line->>'packId', v_line->>'packLinkId'), '')::uuid;
    v_link := null;
    v_pack_row := null;
    if v_pack is not null then
      select * into v_link from public.erp_product_packs
      where id = v_pack and product_id = v_product and archived_at is null;
      if v_link.id is null then
        select * into v_link
        from public.erp_product_packs
        where product_id = v_product and pack_id = v_pack and archived_at is null
          and (supplier_id = p_supplier or supplier_id is null)
        order by case when supplier_id = p_supplier then 0 else 1 end
        limit 1;
      end if;
    end if;
    if v_link.id is null then
      select * into v_link
      from public.erp_product_packs
      where product_id = v_product and archived_at is null
        and (supplier_id = p_supplier or supplier_id is null)
      order by case when supplier_id = p_supplier then 0 else 1 end,
               case when is_default then 0 else 1 end,
               label
      limit 1;
    end if;
    if v_link.pack_id is not null then
      select * into v_pack_row from public.erp_packs where id = v_link.pack_id;
    elsif v_pack is not null and exists (select 1 from public.erp_packs where id = v_pack) then
      select * into v_pack_row from public.erp_packs where id = v_pack;
    end if;

    v_qty_base := coalesce(v_link.qty_base, v_pack_row.qty_base, 1);
    v_pack_qty := nullif(coalesce(v_line->>'packQty', v_line->>'pack_qty'), '')::numeric;
    v_qty := nullif(coalesce(v_line->>'qty', v_line->>'orderedQty'), '')::numeric;
    if v_pack_qty is not null then
      v_qty := round(v_pack_qty * v_qty_base, 6);
    end if;
    if v_qty is null or v_qty <= 0 then continue; end if;

    if v_line ? 'unitPrice' or v_line ? 'unit_price' then
      v_price := nullif(coalesce(v_line->>'unitPrice', v_line->>'unit_price'), '')::numeric;
    else
      v_price := v_p.est_unit_cost;
    end if;

    v_unit := case
      when v_pack_qty is not null then coalesce(
        nullif(btrim(split_part(coalesce(v_pack_row.name, v_link.label, ''), ' ', 1)), ''),
        v_pack_row.unit,
        v_p.base_unit
      )
      else v_p.base_unit
    end;

    v_i := v_i + 1;
    v_existing := null;
    select ol.id into v_existing
    from public.erp_supplier_order_lines ol
    where ol.order_id = p_order
      and ol.product_id = v_product
      and ol.pack_id is not distinct from coalesce(v_link.pack_id, v_pack_row.id)
    order by ol.line_no
    limit 1;

    if v_existing is not null then
      select accepted_qty into v_accepted from public.erp_order_line_progress where line_id = v_existing;
      if p_keep_accepted and coalesce(v_accepted, 0) > v_qty then
        v_qty := v_accepted;
        if v_qty_base > 0 then v_pack_qty := round(v_qty / v_qty_base, 6); end if;
      end if;
      update public.erp_supplier_order_lines set
        line_no = v_i,
        qty = v_qty,
        pack_qty = v_pack_qty,
        pack_qty_base = v_qty_base,
        pack_id = coalesce(v_link.pack_id, v_pack_row.id),
        pack_link_id = v_link.id,
        unit_price = v_price,
        name_en = v_p.name_en,
        name_vn = coalesce(v_p.name_vn, ''),
        brand = v_p.brand,
        pack_label = coalesce(nullif(btrim(v_pack_row.name), ''), nullif(btrim(v_link.label), ''), v_p.base_unit),
        unit = v_unit
      where id = v_existing;
      v_keep := v_keep || v_existing;
    else
      insert into public.erp_supplier_order_lines (
        order_id, line_no, product_id, pack_id, pack_link_id, qty, pack_qty, pack_qty_base, unit_price,
        name_en, name_vn, brand, pack_label, unit
      ) values (
        p_order, v_i, v_product,
        coalesce(v_link.pack_id, v_pack_row.id),
        v_link.id,
        v_qty, v_pack_qty, v_qty_base, v_price,
        v_p.name_en, coalesce(v_p.name_vn, ''), v_p.brand,
        coalesce(nullif(btrim(v_pack_row.name), ''), nullif(btrim(v_link.label), ''), v_p.base_unit),
        v_unit
      )
      returning id into v_existing;
      v_keep := v_keep || v_existing;
    end if;
  end loop;

  if p_keep_accepted then
    delete from public.erp_supplier_order_lines ol
    where ol.order_id = p_order
      and not (ol.id = any (v_keep))
      and coalesce((select accepted_qty from public.erp_order_line_progress p where p.line_id = ol.id), 0) = 0
      and coalesce(ol.closed_qty, 0) = 0;
  else
    delete from public.erp_supplier_order_lines ol
    where ol.order_id = p_order
      and not (ol.id = any (v_keep));
  end if;
end;
$$;

create or replace function public.erp_order_save_draft(p_supplier uuid, p_doc jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v_id uuid;
  v_existing public.erp_supplier_orders;
  v_wh uuid;
  v_comment text;
  v_date date;
  v_keep boolean := false;
  v_bump boolean := false;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  perform 1 from public.erp_suppliers where id = p_supplier and archived_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'supplier'); end if;

  select * into v_existing
  from public.erp_supplier_orders
  where supplier_id = p_supplier
    and lower(created_by) = v_actor
    and status = 'draft'
  for update;

  if p_doc ? 'warehouseId' or p_doc ? 'warehouse_id' then
    v_wh := nullif(coalesce(p_doc->>'warehouseId', p_doc->>'warehouse_id'), '')::uuid;
  else
    v_wh := coalesce(v_existing.warehouse_id, public.erp_order_default_warehouse());
  end if;
  if v_wh is null then
    v_wh := public.erp_order_default_warehouse();
  end if;
  if v_wh is not null then
    perform public.erp_check_warehouse(v_wh, 'warehouse');
  end if;

  v_comment := nullif(btrim(coalesce(p_doc->>'comment', '')), '');
  v_date := nullif(coalesce(p_doc->>'expectedDelivery', p_doc->>'expected_delivery'), '')::date;

  if v_existing.id is null then
    begin
      insert into public.erp_supplier_orders (
        order_no, supplier_id, warehouse_id, status, revision, created_by, updated_by, comment, expected_delivery,
        supplier_name, warehouse_name
      ) values (
        'ORD-' || lpad(nextval('public.erp_supplier_order_no_seq')::text, 6, '0'),
        p_supplier, v_wh, 'draft', 1, v_actor, v_actor, v_comment, v_date,
        (select name from public.erp_suppliers where id = p_supplier),
        (select name from public.erp_warehouses where id = v_wh)
      )
      returning id into v_id;
    exception when unique_violation then
      select * into v_existing
      from public.erp_supplier_orders
      where supplier_id = p_supplier and lower(created_by) = v_actor
        and status = 'draft'
      for update;
      v_id := v_existing.id;
    end;
  else
    v_id := v_existing.id;
  end if;

  if v_existing.id is not null then
    v_keep := false;
    v_bump := v_existing.last_pdf_revision is not null;
    update public.erp_supplier_orders
    set warehouse_id = v_wh,
        comment = v_comment,
        expected_delivery = v_date,
        updated_by = v_actor,
        lock_version = lock_version + 1,
        revision = case when v_bump then revision + 1 else greatest(revision, 1) end,
        supplier_name = (select name from public.erp_suppliers where id = p_supplier),
        warehouse_name = (select name from public.erp_warehouses where id = v_wh)
    where id = v_id;
  end if;

  perform public.erp_order_replace_lines(v_id, p_supplier, coalesce(p_doc->'lines', '[]'::jsonb), v_keep);
  perform public.erp_order_refresh_status(v_id);
  perform public.erp_audit(v_actor, 'supplier_order', v_id, 'save_draft');
  return public.erp_order_to_json(v_id);
end;
$$;

create or replace function public.erp_order_get_draft(p_supplier uuid, p_actor text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v_id uuid;
  v_wh uuid;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  perform 1 from public.erp_suppliers where id = p_supplier and archived_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'supplier'); end if;
  select id into v_id
  from public.erp_supplier_orders
  where supplier_id = p_supplier
    and lower(created_by) = v_actor
    and status = 'draft'
  order by created_at desc
  limit 1;
  if v_id is not null then
    return public.erp_order_to_json(v_id);
  end if;
  v_wh := public.erp_order_default_warehouse();
  return jsonb_build_object(
    'id', null,
    'orderNo', null,
    'status', 'draft',
    'revision', 0,
    'supplierId', p_supplier,
    'supplierName', (select name from public.erp_suppliers where id = p_supplier),
    'warehouseId', v_wh,
    'warehouseName', (select name from public.erp_warehouses where id = v_wh),
    'comment', null,
    'expectedDelivery', null,
    'author', v_actor,
    'snapshot', null,
    'lines', '[]'::jsonb,
    'receipts', '[]'::jsonb
  );
end;
$$;

create or replace function public.erp_order_pdf_revision(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_supplier uuid;
  v_snap jsonb;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then
    v_supplier := p_id;
    select * into v
    from public.erp_supplier_orders
    where supplier_id = v_supplier
      and lower(created_by) = v_actor
      and status = 'draft'
    for update;
    if not found then
      perform public.erp_order_save_draft(v_supplier, '{}'::jsonb, v_actor);
      select * into v
      from public.erp_supplier_orders
      where supplier_id = v_supplier
        and lower(created_by) = v_actor
        and status in ('draft', 'ordered', 'partial')
      for update;
    end if;
  end if;
  perform public.erp_order_assert_owner(v_actor, v);

  update public.erp_supplier_orders
  set revision = case
        when revision <= 0 then 1
        when last_pdf_revision is not distinct from revision then revision + 1
        else greatest(revision, 1)
      end,
      ordered_at = coalesce(ordered_at, now()),
      supplier_name = coalesce(supplier_name, (select name from public.erp_suppliers where id = v.supplier_id)),
      warehouse_name = coalesce(warehouse_name, (select name from public.erp_warehouses where id = warehouse_id)),
      updated_by = v_actor,
      lock_version = lock_version + 1
  where id = v.id
  returning * into v;

  v_snap := public.erp_order_build_pdf_input(v.id);
  update public.erp_supplier_orders
  set pdf_snapshot = v_snap, last_pdf_revision = revision
  where id = v.id
  returning * into v;

  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'pdf_revision');
  return jsonb_build_object(
    'id', v.id,
    'orderNo', v.order_no,
    'revision', v.revision,
    'status', v.status,
    'placed', v.status <> 'draft',
    'pdfUrl', '/api/orders/' || v.id::text || '/pdf?rev=' || v.revision::text,
    'snapshot', v_snap
  );
end;
$$;

create or replace function public.erp_order_place(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_wh uuid;
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

  update public.erp_supplier_orders
  set status = case when status = 'draft' then 'ordered' else status end,
      warehouse_id = v_wh,
      placed_revision = revision,
      placed_at = coalesce(placed_at, now()),
      placed_by = coalesce(placed_by, v_actor),
      ordered_at = coalesce(placed_at, now()),
      supplier_name = (select name from public.erp_suppliers where id = v.supplier_id),
      warehouse_name = (select name from public.erp_warehouses where id = v_wh),
      updated_by = v_actor,
      lock_version = lock_version + 1
  where id = v.id;
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'place');
  return public.erp_order_to_json(v.id);
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
      and p.proname in (
        'erp_order_build_pdf_input', 'erp_order_pdf_input', 'erp_order_to_json',
        'erp_order_replace_lines', 'erp_order_save_draft', 'erp_order_get_draft',
        'erp_order_pdf_revision', 'erp_order_place'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
