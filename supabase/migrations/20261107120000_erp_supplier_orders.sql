-- Supplier orders (employee /orders + admin purchasing).
-- Drafts and placed documents live in these tables; each receive creates an existing
-- unpublished ERP receipt (erp_documents.doc_type = 'receipt'). Stock / FIFO / lots
-- move only when admin posts that receipt via erp_post_document.
-- Additive: does not drop catalog tables or rewrite existing products/packs/suppliers.

create sequence if not exists public.erp_supplier_order_no_seq;

create table if not exists public.erp_order_users (
  email text primary key check (position('@' in email) > 1),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.erp_order_grants (
  owner_email text not null,
  grantee_email text not null,
  created_at timestamptz not null default now(),
  primary key (owner_email, grantee_email),
  check (owner_email <> grantee_email)
);

create table if not exists public.erp_supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  supplier_id uuid not null references public.erp_suppliers (id),
  warehouse_id uuid references public.erp_warehouses (id),
  status text not null default 'draft' check (status in ('draft', 'ordered', 'partial', 'closed')),
  revision integer not null default 0 check (revision >= 0),
  placed_revision integer check (placed_revision >= 0),
  comment text,
  expected_delivery date,
  supplier_name text,
  warehouse_name text,
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  placed_at timestamptz,
  placed_by text,
  closed_at timestamptz,
  closed_by text,
  close_reason text
);

create unique index if not exists erp_supplier_orders_draft_uidx
  on public.erp_supplier_orders (lower(created_by), supplier_id)
  where status = 'draft';
create index if not exists erp_supplier_orders_actor_idx
  on public.erp_supplier_orders (lower(created_by), created_at desc);
create index if not exists erp_supplier_orders_supplier_idx
  on public.erp_supplier_orders (supplier_id, status);

create table if not exists public.erp_supplier_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.erp_supplier_orders (id) on delete cascade,
  line_no integer not null default 0,
  product_id uuid not null references public.erp_products (id),
  pack_id uuid references public.erp_packs (id),
  pack_link_id uuid references public.erp_product_packs (id),
  qty numeric(18,6) not null check (qty > 0),
  pack_qty numeric(18,6),
  pack_qty_base numeric(18,6),
  unit_price numeric(18,6) check (unit_price >= 0),
  name_en text not null,
  name_vn text not null default '',
  brand text,
  pack_label text,
  unit text,
  closed_qty numeric(18,6) not null default 0 check (closed_qty >= 0),
  close_reason text
);
create index if not exists erp_supplier_order_lines_order_idx
  on public.erp_supplier_order_lines (order_id, line_no);

create table if not exists public.erp_order_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.erp_supplier_orders (id),
  document_id uuid unique references public.erp_documents (id),
  idempotency_key text not null,
  comment text,
  photos jsonb not null default '[]'::jsonb,
  needs_clarify boolean not null default false,
  clarify_reason text,
  clarify_at timestamptz,
  clarify_by text,
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  unique (order_id, idempotency_key)
);
create index if not exists erp_order_receipts_order_idx
  on public.erp_order_receipts (order_id, created_at);

alter table public.erp_documents
  add column if not exists source_order_id uuid references public.erp_supplier_orders (id);
create index if not exists erp_documents_source_order_idx
  on public.erp_documents (source_order_id)
  where source_order_id is not null;

alter table public.erp_document_lines
  add column if not exists order_line_id uuid references public.erp_supplier_order_lines (id);
alter table public.erp_document_lines
  add column if not exists discrepancy text;
create index if not exists erp_document_lines_order_line_idx
  on public.erp_document_lines (order_line_id)
  where order_line_id is not null;

drop trigger if exists erp_supplier_orders_touch on public.erp_supplier_orders;
create trigger erp_supplier_orders_touch before update on public.erp_supplier_orders
  for each row execute function public.erp_touch_updated_at();

-- Archived products may still be posted on a receipt that fulfills an already placed order.
create or replace function public.erp_check_product(p_product uuid)
returns public.erp_products
language plpgsql
as $$
declare
  v public.erp_products;
begin
  select * into v from public.erp_products where id = p_product;
  if not found then perform public.erp_raise('ERP_PRODUCT_NOT_FOUND', p_product::text); end if;
  if v.archived_at is not null
     and coalesce(current_setting('erp.order_fulfillment', true), '') is distinct from '1' then
    perform public.erp_raise('ERP_PRODUCT_ARCHIVED', v.name_en);
  end if;
  if v.base_unit is null then perform public.erp_raise('ERP_PRODUCT_NO_UNIT', v.name_en); end if;
  return v;
end;
$$;

create or replace function public.erp_order_default_warehouse()
returns uuid
language sql
stable
as $$
  select id
  from public.erp_warehouses
  where archived_at is null and kind = 'prep_kitchen'
  order by sort, name
  limit 1;
$$;

create or replace function public.erp_order_norm_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

create or replace function public.erp_order_can_see(p_actor text, p_order public.erp_supplier_orders, p_admin boolean)
returns boolean
language sql
stable
as $$
  select p_admin
      or public.erp_order_norm_email(p_order.created_by) = public.erp_order_norm_email(p_actor)
      or exists (
        select 1 from public.erp_order_grants g
        where g.owner_email = public.erp_order_norm_email(p_order.created_by)
          and g.grantee_email = public.erp_order_norm_email(p_actor)
      );
$$;

create or replace function public.erp_order_assert_see(p_actor text, p_order public.erp_supplier_orders, p_admin boolean)
returns void
language plpgsql
as $$
begin
  if p_actor is null or btrim(p_actor) = '' then
    perform public.erp_raise('ERP_FORBIDDEN', 'actor');
  end if;
  if not public.erp_order_can_see(p_actor, p_order, coalesce(p_admin, false)) then
    perform public.erp_raise('ERP_FORBIDDEN');
  end if;
end;
$$;

create or replace function public.erp_order_assert_owner(p_actor text, p_order public.erp_supplier_orders)
returns void
language plpgsql
as $$
begin
  if public.erp_order_norm_email(p_order.created_by) is distinct from public.erp_order_norm_email(p_actor) then
    perform public.erp_raise('ERP_FORBIDDEN');
  end if;
end;
$$;

create or replace view public.erp_order_line_progress as
select
  ol.id as line_id,
  ol.order_id,
  ol.qty as ordered_qty,
  coalesce(ol.closed_qty, 0) as closed_qty,
  coalesce((
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
begin
  select status into v_status from public.erp_supplier_orders where id = p_id;
  if not found or v_status = 'draft' then return; end if;
  select coalesce(sum(remaining_qty), 0), coalesce(sum(accepted_qty), 0)
    into v_remaining, v_accepted
  from public.erp_order_line_progress
  where order_id = p_id;
  update public.erp_supplier_orders
  set status = case
        when v_remaining <= 0 then 'closed'
        when v_accepted > 0 then 'partial'
        else 'ordered'
      end,
      closed_at = case when v_remaining <= 0 then coalesce(closed_at, now()) else null end
  where id = p_id;
end;
$$;

create or replace function public.erp_order_line_json(p_line_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', ol.id,
    'product_id', ol.product_id,
    'pack_id', ol.pack_id,
    'packLinkId', ol.pack_link_id,
    'nameEn', ol.name_en,
    'nameVn', ol.name_vn,
    'brand', ol.brand,
    'packLabel', ol.pack_label,
    'unit', ol.unit,
    'qty', ol.qty,
    'packQty', ol.pack_qty,
    'packQtyBase', ol.pack_qty_base,
    'unitPrice', ol.unit_price,
    'orderedQty', p.ordered_qty,
    'acceptedQty', p.accepted_qty,
    'postedQty', p.posted_qty,
    'remainingQty', p.remaining_qty,
    'closedQty', p.closed_qty,
    'closeReason', ol.close_reason
  )
  from public.erp_supplier_order_lines ol
  join public.erp_order_line_progress p on p.line_id = ol.id
  where ol.id = p_line_id;
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
begin
  select * into v from public.erp_supplier_orders where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;

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
    'supplierId', v.supplier_id,
    'supplierName', coalesce(v.supplier_name, (select name from public.erp_suppliers where id = v.supplier_id)),
    'warehouseId', v.warehouse_id,
    'warehouseName', coalesce(v.warehouse_name, (select name from public.erp_warehouses where id = v.warehouse_id)),
    'comment', v.comment,
    'expectedDelivery', v.expected_delivery,
    'author', v.created_by,
    'placedBy', v.placed_by,
    'placedAt', v.placed_at,
    'createdAt', v.created_at,
    'updatedAt', v.updated_at,
    'closedAt', v.closed_at,
    'closeReason', v.close_reason,
    'lines', v_lines,
    'receipts', v_receipts
  );
end;
$$;

create or replace function public.erp_order_list_suppliers()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'name', s.name,
    'zaloUrl', s.zalo_url
  ) order by s.sort, s.name), '[]'::jsonb)
  from public.erp_suppliers s
  where s.archived_at is null
    and exists (
      select 1
      from public.erp_products p
      where p.archived_at is null
        and p.base_unit is not null
        and coalesce(p.staff_hidden, false) = false
        and (
          p.staff_supplier_id = s.id
          or exists (
            select 1 from public.erp_product_packs k
            where k.product_id = p.id
              and k.supplier_id = s.id
              and k.archived_at is null
          )
        )
    );
$$;

create or replace function public.erp_order_supplier_products(p_supplier uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v jsonb := '[]'::jsonb;
  v_p record;
  v_packs jsonb;
begin
  perform 1 from public.erp_suppliers where id = p_supplier and archived_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'supplier'); end if;

  for v_p in
    select p.*
    from public.erp_products p
    where p.archived_at is null
      and p.base_unit is not null
      and coalesce(p.staff_hidden, false) = false
      and (
        p.staff_supplier_id = p_supplier
        or exists (
          select 1 from public.erp_product_packs k
          where k.product_id = p.id and k.supplier_id = p_supplier and k.archived_at is null
        )
      )
    order by p.name_en, coalesce(p.brand, ''), p.id
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id,
      'pack_id', k.pack_id,
      'label', coalesce(nullif(btrim(pk.name), ''), k.label),
      'qtyBase', k.qty_base,
      'isDefault', k.is_default,
      'unit', pk.unit
    ) order by k.is_default desc, k.label), '[]'::jsonb)
    into v_packs
    from public.erp_product_packs k
    left join public.erp_packs pk on pk.id = k.pack_id
    where k.product_id = v_p.id
      and k.archived_at is null
      and (k.supplier_id = p_supplier or k.supplier_id is null);

    v := v || jsonb_build_object(
      'id', v_p.id,
      'code', v_p.code,
      'nameEn', v_p.name_en,
      'nameVn', v_p.name_vn,
      'brand', v_p.brand,
      'unit', v_p.base_unit,
      'estUnitCost', v_p.est_unit_cost,
      'packs', coalesce(v_packs, '[]'::jsonb)
    );
  end loop;
  return v;
end;
$$;

drop function if exists public.erp_order_replace_lines(uuid, uuid, jsonb, boolean);
create or replace function public.erp_order_replace_lines(p_order uuid, p_supplier uuid, p_lines jsonb, p_freeze boolean)
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
begin
  if not p_freeze then
    delete from public.erp_supplier_order_lines where order_id = p_order;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_product := nullif(coalesce(v_line->>'product_id', v_line->>'productId'), '')::uuid;
    if v_product is null then perform public.erp_raise('ERP_INVALID', 'product_id'); end if;
    select * into v_p from public.erp_products where id = v_product;
    if not found then perform public.erp_raise('ERP_PRODUCT_NOT_FOUND'); end if;
    if not p_freeze and v_p.archived_at is not null then
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
      if v_link.pack_id is not null then
        select * into v_pack_row from public.erp_packs where id = v_link.pack_id;
      elsif exists (select 1 from public.erp_packs where id = v_pack) then
        select * into v_pack_row from public.erp_packs where id = v_pack;
      end if;
    end if;

    v_qty_base := coalesce(v_link.qty_base, v_pack_row.qty_base, 1);
    v_pack_qty := nullif(coalesce(v_line->>'packQty', v_line->>'pack_qty'), '')::numeric;
    v_qty := nullif(coalesce(v_line->>'qty', v_line->>'orderedQty'), '')::numeric;
    if v_qty is null and v_pack_qty is not null then
      v_qty := round(v_pack_qty * v_qty_base, 6);
    end if;
    if v_qty is null or v_qty <= 0 then continue; end if;
    if v_pack_qty is null and v_qty_base > 0 then
      v_pack_qty := round(v_qty / v_qty_base, 6);
    end if;

    if v_line ? 'unitPrice' or v_line ? 'unit_price' then
      v_price := nullif(coalesce(v_line->>'unitPrice', v_line->>'unit_price'), '')::numeric;
    else
      v_price := v_p.est_unit_cost;
    end if;

    v_i := v_i + 1;
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
      v_p.base_unit
    );
  end loop;
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
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  perform 1 from public.erp_suppliers where id = p_supplier and archived_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'supplier'); end if;

  select * into v_existing
  from public.erp_supplier_orders
  where supplier_id = p_supplier and status = 'draft' and lower(created_by) = v_actor
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
    if exists (select 1 from public.erp_locations where id = v_wh)
       and not exists (select 1 from public.erp_warehouses where id = v_wh) then
      perform public.erp_raise('ERP_WAREHOUSE_NOT_FOUND', 'warehouse');
    end if;
  end if;

  v_comment := nullif(btrim(coalesce(p_doc->>'comment', '')), '');
  v_date := nullif(coalesce(p_doc->>'expectedDelivery', p_doc->>'expected_delivery'), '')::date;

  if v_existing.id is null then
    begin
      insert into public.erp_supplier_orders (
        order_no, supplier_id, warehouse_id, status, created_by, updated_by, comment, expected_delivery
      ) values (
        'ORD-' || lpad(nextval('public.erp_supplier_order_no_seq')::text, 6, '0'),
        p_supplier, v_wh, 'draft', v_actor, v_actor, v_comment, v_date
      )
      returning id into v_id;
    exception when unique_violation then
      select * into v_existing
      from public.erp_supplier_orders
      where supplier_id = p_supplier and status = 'draft' and lower(created_by) = v_actor
      for update;
      v_id := v_existing.id;
      update public.erp_supplier_orders
      set warehouse_id = v_wh,
          comment = v_comment,
          expected_delivery = v_date,
          updated_by = v_actor,
          lock_version = lock_version + 1
      where id = v_id;
    end;
  else
    v_id := v_existing.id;
    update public.erp_supplier_orders
    set warehouse_id = v_wh,
        comment = v_comment,
        expected_delivery = v_date,
        updated_by = v_actor,
        lock_version = lock_version + 1
    where id = v_id;
  end if;

  perform public.erp_order_replace_lines(v_id, p_supplier, coalesce(p_doc->'lines', '[]'::jsonb), false);
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
  where supplier_id = p_supplier and status = 'draft' and lower(created_by) = v_actor;
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
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then
    v_supplier := p_id;
    select * into v
    from public.erp_supplier_orders
    where supplier_id = v_supplier and status = 'draft' and lower(created_by) = v_actor
    for update;
    if not found then
      perform public.erp_order_save_draft(v_supplier, '{}'::jsonb, v_actor);
      select * into v
      from public.erp_supplier_orders
      where supplier_id = v_supplier and status = 'draft' and lower(created_by) = v_actor
      for update;
    end if;
  end if;
  perform public.erp_order_assert_owner(v_actor, v);
  update public.erp_supplier_orders
  set revision = revision + 1, updated_by = v_actor, lock_version = lock_version + 1
  where id = v.id
  returning * into v;
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'pdf_revision');
  return jsonb_build_object(
    'id', v.id,
    'orderNo', v.order_no,
    'revision', v.revision,
    'status', v.status,
    'pdfUrl', '/api/orders/' || v.id::text || '/pdf?rev=' || v.revision::text,
    'placed', v.status <> 'draft'
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
  if v.status <> 'draft' then
    return public.erp_order_to_json(v.id);
  end if;
  if not exists (select 1 from public.erp_supplier_order_lines where order_id = v.id) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v.order_no);
  end if;
  v_wh := coalesce(v.warehouse_id, public.erp_order_default_warehouse());
  if v_wh is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;
  perform public.erp_check_warehouse(v_wh, 'warehouse');

  update public.erp_supplier_orders
  set status = 'ordered',
      warehouse_id = v_wh,
      placed_revision = revision,
      placed_at = now(),
      placed_by = v_actor,
      supplier_name = (select name from public.erp_suppliers where id = v.supplier_id),
      warehouse_name = (select name from public.erp_warehouses where id = v_wh),
      updated_by = v_actor,
      lock_version = lock_version + 1
  where id = v.id;
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'place');
  return public.erp_order_to_json(v.id);
end;
$$;

create or replace function public.erp_order_get(p_id uuid, p_actor text, p_admin boolean default false)
returns jsonb
language plpgsql
stable
as $$
declare
  v public.erp_supplier_orders;
begin
  select * into v from public.erp_supplier_orders where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_order_assert_see(p_actor, v, coalesce(p_admin, false));
  return public.erp_order_to_json(v.id);
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

create or replace function public.erp_order_receive(p_id uuid, p_payload jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_key text;
  v_rid uuid;
  v_doc uuid;
  v_clarify boolean := false;
  v_line jsonb;
  v_ol public.erp_supplier_order_lines;
  v_prog public.erp_order_line_progress;
  v_qty numeric;
  v_pack_qty numeric;
  v_price numeric;
  v_product uuid;
  v_disc text;
  v_doc_lines jsonb := '[]'::jsonb;
  v_meta jsonb := '[]'::jsonb;
  v_i integer := 0;
  v_remaining numeric;
  v_doc_json jsonb;
  v_rec public.erp_document_lines;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  v_key := nullif(btrim(coalesce(p_payload->>'idempotencyKey', p_payload->>'idempotency_key', '')), '');
  if v_key is null then perform public.erp_raise('ERP_INVALID', 'idempotencyKey'); end if;

  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_order_assert_see(v_actor, v, false);
  if v.status = 'draft' then perform public.erp_raise('ERP_INVALID', 'not_placed'); end if;
  if v.status = 'closed' and not exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  ) then
    perform public.erp_raise('ERP_ORDER_CLOSED');
  end if;
  if v.warehouse_id is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;

  select id, document_id, needs_clarify
    into v_rid, v_doc, v_clarify
  from public.erp_order_receipts
  where order_id = v.id and idempotency_key = v_key;

  if v_rid is not null and v_doc is not null and not v_clarify then
    return public.erp_order_to_json(v.id);
  end if;

  if v_rid is null then
    insert into public.erp_order_receipts (order_id, idempotency_key, created_by, comment, photos)
    values (
      v.id, v_key, v_actor,
      nullif(btrim(coalesce(p_payload->>'comment', '')), ''),
      coalesce(p_payload->'photos', '[]'::jsonb)
    )
    returning id into v_rid;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    select * into v_ol
    from public.erp_supplier_order_lines
    where id = nullif(coalesce(v_line->>'orderLineId', v_line->>'order_line_id', v_line->>'id'), '')::uuid
      and order_id = v.id;
    if not found then perform public.erp_raise('ERP_INVALID', 'order_line_id'); end if;
    select * into v_prog from public.erp_order_line_progress where line_id = v_ol.id;
    v_remaining := v_prog.remaining_qty;
    -- When editing the same clarifying receipt, its current qty is already in accepted.
    if v_clarify and v_doc is not null then
      v_remaining := v_remaining + coalesce((
        select sum(qty) from public.erp_document_lines
        where document_id = v_doc and order_line_id = v_ol.id
      ), 0);
    end if;

    v_pack_qty := nullif(coalesce(v_line->>'packQty', v_line->>'pack_qty'), '')::numeric;
    v_qty := nullif(v_line->>'qty', '')::numeric;
    if v_qty is null and v_pack_qty is not null then
      v_qty := round(v_pack_qty * coalesce(v_ol.pack_qty_base, 1), 6);
    end if;
    if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_ol.name_en); end if;

    v_product := coalesce(
      nullif(coalesce(v_line->>'product_id', v_line->>'productId'), '')::uuid,
      v_ol.product_id
    );
    v_disc := null;
    if v_product is distinct from v_ol.product_id then
      v_disc := 'substitution';
    elsif v_qty > v_remaining then
      v_disc := 'over_qty';
    end if;

    if v_line ? 'unitPrice' or v_line ? 'unit_price' then
      v_price := nullif(coalesce(v_line->>'unitPrice', v_line->>'unit_price'), '')::numeric;
    else
      v_price := v_ol.unit_price;
    end if;

    v_i := v_i + 1;
    v_doc_lines := v_doc_lines || jsonb_build_object(
      'product_id', v_product,
      'qty', v_qty,
      'pack_id', v_ol.pack_id,
      'pack_qty', coalesce(v_pack_qty, v_ol.pack_qty),
      'unit_price', v_price,
      'reason', nullif(btrim(coalesce(v_line->>'note', v_line->>'reason', '')), '')
    );
    v_meta := v_meta || jsonb_build_object(
      'line_no', v_i,
      'order_line_id', v_ol.id,
      'discrepancy', v_disc
    );
  end loop;

  if v_i = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT'); end if;

  v_doc_json := jsonb_build_object(
    'doc_type', 'receipt',
    'warehouse_id', v.warehouse_id,
    'supplier_id', v.supplier_id,
    'comment', coalesce(p_payload->>'comment', ''),
    'lines', v_doc_lines
  );
  if v_doc is not null then
    v_doc_json := v_doc_json || jsonb_build_object('id', v_doc);
  end if;

  v_doc := public.erp_save_document(v_doc_json, v_actor);
  update public.erp_documents
  set source_order_id = v.id
  where id = v_doc;

  for v_rec in
    select * from public.erp_document_lines where document_id = v_doc
  loop
    update public.erp_document_lines l
    set order_line_id = (m->>'order_line_id')::uuid,
        discrepancy = nullif(m->>'discrepancy', '')
    from jsonb_array_elements(v_meta) m
    where l.id = v_rec.id and (m->>'line_no')::integer = v_rec.line_no;
  end loop;

  update public.erp_order_receipts
  set document_id = v_doc,
      comment = nullif(btrim(coalesce(p_payload->>'comment', comment, '')), ''),
      photos = coalesce(p_payload->'photos', photos, '[]'::jsonb),
      needs_clarify = false,
      clarify_reason = case when needs_clarify then null else clarify_reason end,
      updated_at = now()
  where id = v_rid;

  perform public.erp_order_refresh_status(v.id);
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'receive', null,
    jsonb_build_object('document_id', v_doc, 'idempotency_key', v_key));
  return public.erp_order_to_json(v.id);
end;
$$;

drop function if exists public.erp_order_close_remainder(uuid, text, text, jsonb);
drop function if exists public.erp_order_close_remainder(uuid, text, text, jsonb, boolean);
create or replace function public.erp_order_close_remainder(p_id uuid, p_reason text, p_actor text, p_lines jsonb default null, p_admin boolean default false)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_line jsonb;
  v_ol uuid;
  v_prog public.erp_order_line_progress;
  v_any boolean := false;
begin
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  if v_reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;
  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if coalesce(p_admin, false) then
    perform public.erp_order_assert_see(v_actor, v, true);
  else
    perform public.erp_order_assert_owner(v_actor, v);
  end if;
  if v.status = 'draft' then perform public.erp_raise('ERP_INVALID', 'not_placed'); end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    update public.erp_supplier_order_lines ol
    set closed_qty = ol.closed_qty + p.remaining_qty,
        close_reason = v_reason
    from public.erp_order_line_progress p
    where ol.id = p.line_id and ol.order_id = v.id and p.remaining_qty > 0;
    v_any := found;
  else
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_ol := nullif(coalesce(v_line->>'id', v_line->>'orderLineId', v_line->>'order_line_id'), '')::uuid;
      select * into v_prog from public.erp_order_line_progress where line_id = v_ol and order_id = v.id;
      if not found then perform public.erp_raise('ERP_INVALID', 'order_line_id'); end if;
      if v_prog.remaining_qty > 0 then
        update public.erp_supplier_order_lines
        set closed_qty = closed_qty + v_prog.remaining_qty, close_reason = v_reason
        where id = v_ol;
        v_any := true;
      end if;
    end loop;
  end if;

  update public.erp_supplier_orders
  set close_reason = v_reason, closed_by = v_actor, updated_by = v_actor
  where id = v.id;
  perform public.erp_order_refresh_status(v.id);
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'close_remainder', v_reason);
  return public.erp_order_to_json(v.id);
end;
$$;

create or replace function public.erp_order_return_to_clarify(p_document uuid, p_reason text, p_actor text, p_admin boolean)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_rec public.erp_order_receipts;
  v_doc public.erp_documents;
begin
  if not coalesce(p_admin, false) then perform public.erp_raise('ERP_FORBIDDEN'); end if;
  if v_reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;
  select * into v_doc from public.erp_documents where id = p_document for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type <> 'receipt' then perform public.erp_raise('ERP_INVALID', 'doc_type'); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_rec from public.erp_order_receipts where document_id = p_document for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'order_receipt'); end if;
  update public.erp_order_receipts
  set needs_clarify = true,
      clarify_reason = v_reason,
      clarify_at = now(),
      clarify_by = v_actor,
      updated_at = now()
  where id = v_rec.id;
  perform public.erp_audit(v_actor, 'supplier_order', v_rec.order_id, 'return_to_clarify', v_reason,
    jsonb_build_object('document_id', p_document));
  return public.erp_order_to_json(v_rec.order_id);
end;
$$;

-- Admin posting of an order receipt: existing erp_post_document, with a GUC so a
-- product archived after the order was placed can still land in stock.
create or replace function public.erp_order_admin_post(p_id uuid, p_actor text, p_admin boolean)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_result jsonb;
begin
  if not coalesce(p_admin, false) then perform public.erp_raise('ERP_FORBIDDEN'); end if;
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.source_order_id is null then
    return public.erp_post_document(p_id, p_actor);
  end if;
  perform set_config('erp.order_fulfillment', '1', true);
  v_result := public.erp_post_document(p_id, p_actor);
  perform public.erp_order_refresh_status(v_doc.source_order_id);
  return v_result;
end;
$$;

create or replace function public.erp_order_grant(p_owner text, p_grantee text)
returns void
language plpgsql
as $$
declare
  v_owner text := public.erp_order_norm_email(p_owner);
  v_grantee text := public.erp_order_norm_email(p_grantee);
begin
  if v_owner = '' or v_grantee = '' or v_owner = v_grantee then
    perform public.erp_raise('ERP_INVALID', 'grant');
  end if;
  insert into public.erp_order_grants (owner_email, grantee_email)
  values (v_owner, v_grantee)
  on conflict do nothing;
end;
$$;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'erp_order_users',
    'erp_order_grants',
    'erp_supplier_orders',
    'erp_supplier_order_lines',
    'erp_order_receipts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  revoke all on public.erp_order_line_progress from public, anon, authenticated;
  grant select on public.erp_order_line_progress to service_role;
  revoke all on sequence public.erp_supplier_order_no_seq from public, anon, authenticated;
  grant usage, select on sequence public.erp_supplier_order_no_seq to service_role;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'erp_order\_%'
        or p.proname = 'erp_check_product'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
