-- Ingredients: order_pack_* on the product card = pack multiplier for weight
-- (e.g. bag × 5 kg). Fall back to purchase pack when order_pack is empty.
-- Semi-finished keep bag/pcs formula (pack_size > 1).

create or replace function public.erp_prep_stock_catalog()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, x.name_en, x.id), '[]'::jsonb)
  from (
    select
      p.id::text as id,
      coalesce(p.name_en, '') as name_en,
      coalesce(
        nullif(btrim(coalesce(p.names->>'ru', '')), ''),
        coalesce(m.name_ru, ''),
        ''
      ) as name_ru,
      coalesce(nullif(btrim(p.name_vn), ''), coalesce(m.name_vn, ''), '') as name_vn,
      coalesce(m.note, '') as note,
      coalesce(m.no_warehouse, false) as no_warehouse,
      coalesce(m.sort_order, p.staff_sort, 0) as sort_order,
      p.type as product_type,
      coalesce(p.base_unit, '') as base_unit,
      -- Semi-finished: pieces per bag
      case
        when p.type = 'semi_finished' then coalesce(nullif(btrim(p.order_pack_type), ''), 'bag')
        else null
      end as pack_type,
      case
        when p.type = 'semi_finished'
          and p.order_pack_content_qty is not null
          and p.order_pack_content_qty > 1
          then round(p.order_pack_content_qty)::int
        else null
      end as pack_size,
      case
        when p.type = 'semi_finished'
          then coalesce(nullif(btrim(p.order_pack_content_unit), ''), 'pcs')
        else null
      end as pack_unit,
      -- Ingredient multiplier: prefer card order_pack_*, else purchase pack
      case
        when p.type = 'semi_finished' then null
        when nullif(btrim(p.order_pack_type), '') is not null then btrim(p.order_pack_type)
        else coalesce(nullif(btrim(pk.name), ''), nullif(btrim(k.label), ''), 'pack')
      end as purchase_pack_label,
      case
        when p.type = 'semi_finished' then null
        when p.order_pack_content_qty is not null and p.order_pack_content_qty > 0
          then p.order_pack_content_qty
        else k.qty_base
      end as purchase_qty_base,
      case
        when p.type = 'semi_finished' then null
        when p.order_pack_content_qty is not null and p.order_pack_content_qty > 0
          then coalesce(nullif(btrim(p.order_pack_content_unit), ''), p.base_unit, 'kg')
        else coalesce(pk.unit, p.base_unit, 'kg')
      end as purchase_unit
    from public.erp_products p
    left join public.erp_prep_stock_items m
      on m.id = p.id::text and m.archived_at is null
    left join lateral (
      select kk.*
      from public.erp_product_packs kk
      where kk.product_id = p.id
        and kk.archived_at is null
      order by kk.is_default desc, kk.label
      limit 1
    ) k on true
    left join public.erp_packs pk on pk.id = k.pack_id
    where coalesce(p.staff_listed, false) = true
      and p.archived_at is null
  ) x;
$$;

create or replace function public.erp_order_product_json(p public.erp_products, p_supplier uuid default null)
returns jsonb
language plpgsql
stable
as $$
declare
  v_packs jsonb;
  v_supplier uuid;
  v_category_name text;
  v_category_name_vn text;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id,
    'pack_id', k.pack_id,
    'label', coalesce(nullif(btrim(pk.name), ''), k.label),
    'nameVn', coalesce(nullif(btrim(pk.name_vn), ''), ''),
    'name_vn', coalesce(nullif(btrim(pk.name_vn), ''), ''),
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

  select name_en, coalesce(name_vn, '')
    into v_category_name, v_category_name_vn
  from public.erp_categories
  where id = p.category_id and archived_at is null;

  return jsonb_build_object(
    'id', p.id,
    'code', p.code,
    'productCode', p.product_code,
    'nameEn', p.name_en,
    'nameVn', coalesce(p.name_vn, ''),
    'brand', p.brand,
    'type', p.type,
    'unit', p.base_unit,
    'itemNo', coalesce(p.staff_item_no, p.product_code),
    'categoryId', p.category_id,
    'categoryName', v_category_name,
    'categoryNameVn', v_category_name_vn,
    'supplierId', v_supplier,
    'sort', p.staff_sort,
    'hidden', coalesce(p.staff_hidden, false),
    'accountable', coalesce(p.staff_listed, false),
    'estUnitCost', p.est_unit_cost,
    'orderPackType', p.order_pack_type,
    'orderPackContentQty', p.order_pack_content_qty,
    'orderPackContentUnit', coalesce(
      nullif(btrim(p.order_pack_content_unit), ''),
      case when p.order_pack_content_qty is not null then p.base_unit else null end
    ),
    'packs', coalesce(v_packs, '[]'::jsonb)
  );
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_prep_stock_catalog', 'erp_order_product_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
