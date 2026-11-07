-- PDF snapshot includes pack SKU + bilingual names. Additive function replace only.

create or replace function public.erp_order_product_json(p public.erp_products, p_supplier uuid default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_packs jsonb;
  v_supplier uuid;
  v_category_name text;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id,
    'pack_id', k.pack_id,
    'label', coalesce(nullif(btrim(pk.name), ''), k.label),
    'qtyBase', k.qty_base,
    'qty_base', k.qty_base,
    'isDefault', k.is_default,
    'is_default', k.is_default,
    'unit', coalesce(pk.unit, p.base_unit),
    'code', k.code,
    'supplierId', k.supplier_id
  ) order by k.is_default desc, k.label), '[]'::jsonb)
  into v_packs
  from public.erp_product_packs k
  left join public.erp_packs pk on pk.id = k.pack_id
  where k.product_id = p.id
    and k.archived_at is null
    and (p_supplier is null or k.supplier_id = p_supplier or k.supplier_id is null);

  v_supplier := coalesce(
    (
      select k.supplier_id
      from public.erp_product_packs k
      where k.product_id = p.id and k.archived_at is null and k.supplier_id is not null
      order by k.is_default desc, k.label
      limit 1
    ),
    p.staff_supplier_id
  );
  if p_supplier is not null then
    v_supplier := p_supplier;
  end if;

  select name_en into v_category_name
  from public.erp_categories
  where id = p.category_id and archived_at is null;

  return jsonb_build_object(
    'id', p.id,
    'code', p.code,
    'productCode', p.product_code,
    'nameEn', p.name_en,
    'nameVn', coalesce(p.name_vn, ''),
    'brand', p.brand,
    'unit', p.base_unit,
    'itemNo', coalesce(p.staff_item_no, p.product_code),
    'categoryId', p.category_id,
    'categoryName', v_category_name,
    'supplierId', v_supplier,
    'sort', p.staff_sort,
    'hidden', coalesce(p.staff_hidden, false),
    'estUnitCost', p.est_unit_cost,
    'packs', coalesce(v_packs, '[]'::jsonb)
  );
end;
$$;

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
        'packCode', coalesce(
          nullif(btrim((select k.code from public.erp_product_packs k where k.id = l.pack_link_id)), ''),
          nullif(btrim((select p.product_code from public.erp_products p where p.id = l.product_id)), '')
        ),
        'unit', coalesce(l.unit, ''),
        'qty', coalesce(l.pack_qty, l.qty)
      ) order by l.line_no, l.id)
      from public.erp_supplier_order_lines l
      where l.order_id = o.id and l.qty > 0
    ), '[]'::jsonb)
  );
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
    'packCode', coalesce(
      nullif(btrim((select k.code from public.erp_product_packs k where k.id = ol.pack_link_id)), ''),
      nullif(btrim((select p.product_code from public.erp_products p where p.id = ol.product_id)), '')
    ),
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

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_order_product_json', 'erp_order_build_pdf_input', 'erp_order_line_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
