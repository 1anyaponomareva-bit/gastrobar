-- Order List catalog: keep EN and VN category names separate so the UI language switcher can pick one.
-- Additive function replace only. No data dropped.

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
    'unit', p.base_unit,
    'itemNo', coalesce(p.staff_item_no, p.product_code),
    'categoryId', p.category_id,
    'categoryName', v_category_name,
    'categoryNameVn', v_category_name_vn,
    'supplierId', v_supplier,
    'sort', p.staff_sort,
    'hidden', coalesce(p.staff_hidden, false),
    'estUnitCost', p.est_unit_cost,
    'packs', coalesce(v_packs, '[]'::jsonb)
  );
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
      and p.proname = 'erp_order_product_json'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
