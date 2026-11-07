-- Employee Order List catalog: one vertical list ordered by erp_products.staff_sort.
-- Additive: new functions + replace catalog reads. No drops of data.

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
    'nameEn', p.name_en,
    'nameVn', p.name_vn,
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
  v_p public.erp_products;
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
    order by p.staff_sort, p.name_en, coalesce(p.brand, ''), p.id
  loop
    v := v || public.erp_order_product_json(v_p, p_supplier);
  end loop;
  return v;
end;
$$;

create or replace function public.erp_order_reorder_products(p_ids uuid[])
returns jsonb
language plpgsql
as $$
declare
  v_i integer := 0;
  v_id uuid;
begin
  if p_ids is null then perform public.erp_raise('ERP_INVALID', 'ids'); end if;
  foreach v_id in array p_ids
  loop
    v_i := v_i + 1;
    update public.erp_products set staff_sort = v_i - 1, updated_at = now() where id = v_id;
  end loop;
  return public.erp_order_catalog_products(true);
end;
$$;

create or replace function public.erp_order_reorder_suppliers(p_ids uuid[])
returns jsonb
language plpgsql
as $$
declare
  v_i integer := 0;
  v_id uuid;
begin
  if p_ids is null then perform public.erp_raise('ERP_INVALID', 'ids'); end if;
  foreach v_id in array p_ids
  loop
    v_i := v_i + 1;
    update public.erp_suppliers set sort = v_i - 1 where id = v_id;
  end loop;
  return public.erp_order_list_suppliers();
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
        'erp_order_product_json', 'erp_order_catalog_products', 'erp_order_list_suppliers',
        'erp_order_supplier_products', 'erp_order_reorder_products', 'erp_order_reorder_suppliers'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
