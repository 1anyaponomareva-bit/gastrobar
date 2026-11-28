-- Accountable Item (= staff_listed) + structured order packing for Orders.
-- Does not change stock, recipes, prices, or finance.

comment on column public.erp_products.staff_listed is
  'Accountable Item / Подотчётный товар / Hàng Hóa Cần Theo Dõi. When true (and not hidden/archived), product appears in Orders.';

alter table public.erp_products
  add column if not exists order_pack_type text,
  add column if not exists order_pack_content_qty numeric(18,4),
  add column if not exists order_pack_content_unit text;

comment on column public.erp_products.order_pack_type is
  'Orders packing container type (e.g. pack/bag). Structured; not free-text staff_pack.';
comment on column public.erp_products.order_pack_content_qty is
  'Units of content in one Orders pack (e.g. 2 pcs, 200 g).';
comment on column public.erp_products.order_pack_content_unit is
  'Content unit inside one Orders pack (pcs, g, …).';

-- Products already reachable in Orders stay visible after staff_listed filter.
update public.erp_products p
set staff_listed = true
where p.archived_at is null
  and p.base_unit is not null
  and coalesce(p.staff_hidden, false) = false
  and coalesce(p.staff_listed, false) = false
  and (
    p.staff_supplier_id is not null
    or exists (
      select 1
      from public.erp_product_packs k
      where k.product_id = p.id
        and k.supplier_id is not null
        and k.archived_at is null
    )
  );

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
    'orderPackContentUnit', p.order_pack_content_unit,
    'packs', coalesce(v_packs, '[]'::jsonb)
  );
end;
$$;

create or replace function public.erp_order_catalog_products(p_include_hidden boolean default false)
returns jsonb
language plpgsql
stable
as $$
declare
  v jsonb := '[]'::jsonb;
  v_p public.erp_products;
begin
  for v_p in
    select p.*
    from public.erp_products p
    where p.archived_at is null
      and p.base_unit is not null
      and coalesce(p.staff_listed, false) = true
      and (p_include_hidden or coalesce(p.staff_hidden, false) = false)
      and (
        p.staff_supplier_id is not null
        or exists (
          select 1 from public.erp_product_packs k
          where k.product_id = p.id and k.supplier_id is not null and k.archived_at is null
        )
      )
    order by p.staff_sort, p.name_en, p.id
  loop
    v := v || public.erp_order_product_json(v_p, null);
  end loop;
  return v;
end;
$$;

-- Keep supplier chips / counts aligned with accountable filter.
create or replace function public.erp_order_list_suppliers()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'name', s.name,
    'zaloUrl', s.zalo_url,
    'sort', s.sort,
    'productCount', (
      select count(*)::int
      from public.erp_products p
      where p.archived_at is null
        and p.base_unit is not null
        and coalesce(p.staff_listed, false) = true
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
    )
  ) order by s.sort, s.name), '[]'::jsonb)
  from public.erp_suppliers s
  where s.archived_at is null
    and exists (
      select 1
      from public.erp_products p
      where p.archived_at is null
        and p.base_unit is not null
        and coalesce(p.staff_listed, false) = true
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

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'erp_order_product_json',
        'erp_order_catalog_products',
        'erp_order_list_suppliers'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
