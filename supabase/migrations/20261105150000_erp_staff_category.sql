-- Staff catalog re-import must not undo a category corrected in the ERP.
-- staff_category keeps the category code last received from Staff; the ERP category
-- is replaced only when that source value actually changes. For products imported
-- before this column existed the source value is unknown, so the first sync only
-- records it and keeps the category the ERP already has.

alter table public.erp_products add column if not exists staff_category text;

create or replace function public.erp_sync_staff_catalog(p_catalog jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_i integer;
  v_id uuid;
  v_cat uuid;
  v_sup uuid;
  v_name text;
  v_name_vn text;
  v_split integer;
  v_pack record;
  v_type text;
  v_created integer := 0;
  v_updated integer := 0;
  v_review integer := 0;
  v_codes text[] := '{}';
begin
  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'categories', '[]'::jsonb))
  loop
    insert into public.erp_categories (code, name_en, name_vn, sort)
    values (v_item->>'id', btrim(v_item->>'en'), coalesce(btrim(v_item->>'vn'), ''), v_i)
    on conflict (code) do update set name_en = excluded.name_en, name_vn = excluded.name_vn,
      sort = excluded.sort, archived_at = null
    returning id into v_id;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'category', v_item->>'id', v_id) on conflict do nothing;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'suppliers', '[]'::jsonb))
  loop
    insert into public.erp_suppliers (code, name, zalo_url, sort)
    values (v_item->>'id', btrim(v_item->>'label'), nullif(v_item->>'zaloUrl', ''), v_i)
    on conflict (code) do update set name = excluded.name, zalo_url = excluded.zalo_url,
      sort = excluded.sort, archived_at = null
    returning id into v_id;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'supplier', v_item->>'id', v_id) on conflict do nothing;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'items', '[]'::jsonb))
  loop
    v_codes := v_codes || (v_item->>'id');
    select id into v_cat from public.erp_categories where code = v_item->>'category';
    select id into v_sup from public.erp_suppliers where code = v_item->>'supplier';
    v_name := btrim(v_item->>'name');
    v_name_vn := coalesce(btrim(v_item->>'nameVn'), '');
    -- The Staff admin stores one "EN / VN" text in both fields.
    if v_name = v_name_vn then
      v_split := strpos(v_name, ' / ');
      if v_split > 0 then
        v_name_vn := btrim(substr(v_name, v_split + 3));
        v_name := btrim(left(v_name, v_split - 1));
      end if;
    end if;
    select * into v_pack from public.erp_parse_pack(v_item->>'pack');
    v_type := case v_item->>'category' when 'disposable-tableware' then 'packaging'
                                       when 'supplies' then 'consumable' else 'ingredient' end;

    select target_id into v_id from public.erp_legacy_map
    where source = 'staff' and entity = 'item' and legacy_id = v_item->>'id';
    if v_id is null then
      select id into v_id from public.erp_products where code = v_item->>'id';
    end if;

    if v_id is null then
      insert into public.erp_products (code, type, name_en, name_vn, category_id, staff_category, base_unit, brand, staff_listed,
                                       staff_unit, staff_pack, staff_supplier_id, staff_item_no, staff_hidden,
                                       staff_sort, created_by, updated_by)
      values (v_item->>'id', v_type, v_name, v_name_vn, v_cat, v_item->>'category', v_pack.base_unit, nullif(btrim(v_item->>'brand'), ''),
              true, v_item->>'unit', nullif(v_item->>'pack', ''), v_sup, nullif(v_item->>'itemNo', ''),
              coalesce((v_item->>'hidden')::boolean, false), v_i, p_actor, p_actor)
      returning id into v_id;
      v_created := v_created + 1;
    else
      update public.erp_products set
        name_en = v_name, name_vn = v_name_vn,
        category_id = case when staff_category is null then coalesce(category_id, v_cat)
                           when staff_category is distinct from v_item->>'category' then v_cat
                           else category_id end,
        staff_category = v_item->>'category',
        brand = nullif(btrim(v_item->>'brand'), ''),
        staff_listed = true, staff_unit = v_item->>'unit', staff_pack = nullif(v_item->>'pack', ''),
        staff_supplier_id = v_sup, staff_item_no = nullif(v_item->>'itemNo', ''),
        staff_hidden = coalesce((v_item->>'hidden')::boolean, false), staff_sort = v_i,
        base_unit = coalesce(base_unit, v_pack.base_unit), updated_by = p_actor
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'item', v_item->>'id', v_id) on conflict do nothing;

    if v_pack.base_unit is not null
       and v_pack.base_unit = (select base_unit from public.erp_products where id = v_id) then
      insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
      values (v_id, v_sup, coalesce(v_item->>'unit', '') || ' ' || (v_item->>'pack'), v_pack.qty, true)
      on conflict do nothing;
    else
      v_review := v_review + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  update public.erp_products set staff_listed = false, updated_by = p_actor
  where staff_listed and not (code = any (v_codes));

  update public.erp_categories c set archived_at = now()
  where archived_at is null
    and not exists (select 1 from jsonb_array_elements(coalesce(p_catalog->'categories', '[]'::jsonb)) x where x->>'id' = c.code)
    and not exists (select 1 from public.erp_products p where p.category_id = c.id and p.archived_at is null)
    and not exists (select 1 from public.erp_dishes d where d.category_id = c.id and d.archived_at is null);
  update public.erp_suppliers s set archived_at = now()
  where archived_at is null
    and not exists (select 1 from jsonb_array_elements(coalesce(p_catalog->'suppliers', '[]'::jsonb)) x where x->>'id' = s.code)
    and not exists (select 1 from public.erp_products p where p.staff_supplier_id = s.id and p.archived_at is null)
    and not exists (select 1 from public.erp_product_packs k where k.supplier_id = s.id and k.archived_at is null);

  perform public.erp_audit(p_actor, 'staff_catalog', null, 'sync', null,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'pack_review', v_review));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'pack_review', v_review);
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'erp_sync_staff_catalog'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
