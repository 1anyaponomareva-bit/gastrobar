-- One catalog for Staff and ERP: erp_categories / erp_suppliers / erp_products / erp_product_packs.
-- Staff reads erp_staff_catalog() and saves through erp_save_staff_catalog(), which refuses a
-- catalog built from an outdated copy. Staff item / supplier / category ids are the ERP codes
-- and never change. Catalog writes never touch stock, lots, movements or documents.

-- ---------------------------------------------------------------------------
-- Staff save: full catalog in the Staff format (re-created with two fixes:
-- only products Staff can actually see are unlisted, and a new Staff pack
-- becomes the default instead of leaving two defaults).
-- ---------------------------------------------------------------------------

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
  v_pack_id uuid;
  v_type text;
  v_created integer := 0;
  v_updated integer := 0;
  v_review integer := 0;
  v_codes text[] := '{}';
  v_one_name boolean;
  v_old_pack text;
  v_is_new boolean;
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
    v_one_name := false;
    -- The Staff admin stores one "EN / VN" text in both fields.
    if v_name = v_name_vn then
      v_split := strpos(v_name, ' / ');
      if v_split > 0 then
        v_name_vn := btrim(substr(v_name, v_split + 3));
        v_name := btrim(left(v_name, v_split - 1));
      else
        v_one_name := true;
      end if;
    end if;
    select * into v_pack from public.erp_parse_pack(v_item->>'pack');
    v_type := case v_item->>'category' when 'disposable-tableware' then 'packaging'
                                       when 'supplies' then 'consumable' else 'ingredient' end;

    select target_id into v_id from public.erp_legacy_map
    where source = 'staff' and entity = 'item' and legacy_id = v_item->>'id';
    if v_id is null then
      select id into v_id from public.erp_products where code = v_item->>'id';
      -- A new Staff id that happens to equal the code of an ERP-only product is a different item.
      if v_id is not null and not (select staff_listed from public.erp_products where id = v_id) then
        perform public.erp_raise('ERP_DUPLICATE', 'item:' || (v_item->>'id'));
      end if;
    end if;

    v_is_new := v_id is null;
    if v_is_new then
      insert into public.erp_products (code, type, name_en, name_vn, category_id, staff_category, base_unit, brand, staff_listed,
                                       staff_unit, staff_pack, staff_supplier_id, staff_item_no, staff_hidden,
                                       staff_sort, created_by, updated_by)
      values (v_item->>'id', v_type, v_name, v_name_vn, v_cat, v_item->>'category', v_pack.base_unit, nullif(btrim(v_item->>'brand'), ''),
              true, v_item->>'unit', nullif(v_item->>'pack', ''), v_sup, nullif(v_item->>'itemNo', ''),
              coalesce((v_item->>'hidden')::boolean, false), v_i, p_actor, p_actor)
      returning id into v_id;
      v_created := v_created + 1;
    else
      select staff_pack into v_old_pack from public.erp_products where id = v_id;
      update public.erp_products set
        name_en = v_name,
        -- Staff shows the English name when there is no Vietnamese one; that is not a new VN name.
        name_vn = case when v_one_name and name_vn in ('', v_name) then name_vn else v_name_vn end,
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

    -- A purchase pack is created for a new item or a pack changed in Staff, so a pack deleted
    -- in the ERP does not come back on every Staff save.
    if not v_is_new and v_old_pack is not distinct from nullif(v_item->>'pack', '') then
      null;
    elsif v_pack.base_unit is not null
       and v_pack.base_unit = (select base_unit from public.erp_products where id = v_id) then
      v_pack_id := null;
      insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
      values (v_id, v_sup, coalesce(v_item->>'unit', '') || ' ' || (v_item->>'pack'), v_pack.qty, true)
      on conflict do nothing
      returning id into v_pack_id;
      if v_pack_id is not null then
        update public.erp_product_packs set is_default = false where product_id = v_id and id <> v_pack_id and is_default;
      end if;
    else
      v_review := v_review + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  -- Only products Staff could see (active category and supplier) can be removed from its list.
  update public.erp_products p set staff_listed = false, updated_by = p_actor
  where p.staff_listed and not (p.code = any (v_codes))
    and p.archived_at is null
    and exists (select 1 from public.erp_categories c where c.id = p.category_id and c.archived_at is null)
    and exists (select 1 from public.erp_suppliers s where s.id = p.staff_supplier_id and s.archived_at is null);

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

-- Fingerprint of what Staff sees; a save must be based on the current one.
create or replace function public.erp_staff_catalog_version()
returns text
language sql
stable
as $$
  select md5(public.erp_staff_catalog()::text);
$$;

-- Codes Staff must not give to new records: ERP rows that Staff does not see.
create or replace function public.erp_staff_reserved_ids()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(p.code order by p.code) from public.erp_products p
      where not (p.staff_listed and p.archived_at is null
                 and exists (select 1 from public.erp_categories c where c.id = p.category_id and c.archived_at is null)
                 and exists (select 1 from public.erp_suppliers s where s.id = p.staff_supplier_id and s.archived_at is null))),
      '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(code order by code) from public.erp_suppliers where archived_at is not null), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(code order by code) from public.erp_categories where archived_at is not null), '[]'::jsonb)
  );
$$;

create or replace function public.erp_save_staff_catalog(p_catalog jsonb, p_base_version text, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('erp_staff_catalog'));
  if p_base_version is null or p_base_version <> public.erp_staff_catalog_version() then
    perform public.erp_raise('ERP_STALE', 'staff catalog');
  end if;
  v_result := public.erp_sync_staff_catalog(p_catalog, p_actor);
  return v_result || jsonb_build_object('version', public.erp_staff_catalog_version());
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfer of records that exist only in the old Staff file. Adds missing
-- categories / suppliers / items by their Staff id and never changes rows that
-- already exist. Safe to run any number of times.
-- ---------------------------------------------------------------------------

create or replace function public.erp_add_staff_catalog(p_catalog jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_cat uuid;
  v_sup uuid;
  v_pack record;
  v_name text;
  v_name_vn text;
  v_split integer;
  v_sort integer;
  v_categories integer := 0;
  v_suppliers integer := 0;
  v_items integer := 0;
  v_skipped integer := 0;
  v_review integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('erp_staff_catalog'));

  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'categories', '[]'::jsonb))
  loop
    if not exists (select 1 from public.erp_categories where code = v_item->>'id') then
      insert into public.erp_categories (code, name_en, name_vn, sort)
      values (v_item->>'id', btrim(v_item->>'en'), coalesce(btrim(v_item->>'vn'), ''),
              coalesce((select max(sort) + 1 from public.erp_categories), 0))
      returning id into v_id;
      insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
      values ('staff', 'category', v_item->>'id', v_id) on conflict do nothing;
      v_categories := v_categories + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'suppliers', '[]'::jsonb))
  loop
    if not exists (select 1 from public.erp_suppliers where code = v_item->>'id') then
      insert into public.erp_suppliers (code, name, zalo_url, sort)
      values (v_item->>'id', btrim(v_item->>'label'), nullif(v_item->>'zaloUrl', ''),
              coalesce((select max(sort) + 1 from public.erp_suppliers), 0))
      returning id into v_id;
      insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
      values ('staff', 'supplier', v_item->>'id', v_id) on conflict do nothing;
      v_suppliers := v_suppliers + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'items', '[]'::jsonb))
  loop
    if exists (select 1 from public.erp_legacy_map where source = 'staff' and entity = 'item' and legacy_id = v_item->>'id')
       or exists (select 1 from public.erp_products where code = v_item->>'id') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select id into v_cat from public.erp_categories where code = v_item->>'category';
    select id into v_sup from public.erp_suppliers where code = v_item->>'supplier';
    v_name := btrim(v_item->>'name');
    v_name_vn := coalesce(btrim(v_item->>'nameVn'), '');
    if v_name = v_name_vn then
      v_split := strpos(v_name, ' / ');
      if v_split > 0 then
        v_name_vn := btrim(substr(v_name, v_split + 3));
        v_name := btrim(left(v_name, v_split - 1));
      end if;
    end if;
    -- Unit and pack size only when the pack text states them exactly; otherwise left for the user.
    select * into v_pack from public.erp_parse_pack(v_item->>'pack');
    v_sort := coalesce((select max(staff_sort) + 1 from public.erp_products), 0);
    insert into public.erp_products (code, type, name_en, name_vn, category_id, staff_category, base_unit, brand, staff_listed,
                                     staff_unit, staff_pack, staff_supplier_id, staff_item_no, staff_hidden,
                                     staff_sort, created_by, updated_by)
    values (v_item->>'id',
            case v_item->>'category' when 'disposable-tableware' then 'packaging' when 'supplies' then 'consumable' else 'ingredient' end,
            v_name, v_name_vn, v_cat, v_item->>'category', v_pack.base_unit, nullif(btrim(v_item->>'brand'), ''),
            true, v_item->>'unit', nullif(v_item->>'pack', ''), v_sup, nullif(v_item->>'itemNo', ''),
            coalesce((v_item->>'hidden')::boolean, false), v_sort, p_actor, p_actor)
    returning id into v_id;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'item', v_item->>'id', v_id) on conflict do nothing;
    if v_pack.base_unit is not null then
      insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
      values (v_id, v_sup, coalesce(v_item->>'unit', '') || ' ' || (v_item->>'pack'), v_pack.qty, true)
      on conflict do nothing;
    else
      v_review := v_review + 1;
    end if;
    v_items := v_items + 1;
  end loop;

  perform public.erp_audit(p_actor, 'staff_catalog', null, 'add_missing', null,
    jsonb_build_object('categories', v_categories, 'suppliers', v_suppliers, 'items', v_items, 'skipped', v_skipped));
  return jsonb_build_object('categories', v_categories, 'suppliers', v_suppliers, 'items', v_items,
                            'skipped', v_skipped, 'pack_review', v_review);
end;
$$;

-- ---------------------------------------------------------------------------
-- Product save from the ERP, now also with the Staff order settings.
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_product(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_old public.erp_products;
  v_unit text := nullif(p->>'base_unit', '');
  v_pack jsonb;
  v_used boolean;
  v_staff jsonb := p->'staff';
  v_listed boolean;
  v_sup uuid;
  v_missing text[] := '{}';
begin
  if v_id is null then
    insert into public.erp_products (code, type, name_en, created_by)
    values (public.erp_unique_code('erp_products', p->>'name_en'), p->>'type', btrim(p->>'name_en'), p_actor)
    returning id into v_id;
    v_old := null;
  else
    select * into v_old from public.erp_products where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_old.base_unit is not null and v_unit is distinct from v_old.base_unit then
      select exists (select 1 from public.erp_lots where product_id = v_id)
          or exists (select 1 from public.erp_recipe_lines where product_id = v_id)
          or exists (select 1 from public.erp_dish_lines where product_id = v_id)
          or exists (select 1 from public.erp_recipes where product_id = v_id)
        into v_used;
      if v_used then perform public.erp_raise('ERP_UNIT_LOCKED', v_old.name_en); end if;
    end if;
  end if;

  update public.erp_products set
    type = coalesce(nullif(p->>'type', ''), type),
    name_en = btrim(p->>'name_en'),
    name_vn = coalesce(btrim(p->>'name_vn'), ''),
    category_id = nullif(p->>'category_id', '')::uuid,
    base_unit = v_unit,
    unit_weight_kg = nullif(p->>'unit_weight_kg', '')::numeric,
    brand = nullif(btrim(p->>'brand'), ''),
    est_unit_cost = case when p ? 'est_unit_cost' then nullif(p->>'est_unit_cost', '')::numeric else est_unit_cost end,
    est_cost_source = case when p ? 'est_unit_cost'
                             and nullif(p->>'est_unit_cost', '')::numeric is distinct from v_old.est_unit_cost
                           then case when nullif(p->>'est_unit_cost', '') is null then null else 'manual' end
                           else est_cost_source end,
    est_cost_at = case when p ? 'est_unit_cost'
                         and nullif(p->>'est_unit_cost', '')::numeric is distinct from v_old.est_unit_cost
                       then now() else est_cost_at end,
    shelf_life_days = nullif(p->>'shelf_life_days', '')::integer,
    storage_conditions = nullif(btrim(p->>'storage_conditions'), ''),
    loss_clean_pct = case when p ? 'loss_clean_pct' then nullif(p->>'loss_clean_pct', '')::numeric else loss_clean_pct end,
    loss_boil_pct = case when p ? 'loss_boil_pct' then nullif(p->>'loss_boil_pct', '')::numeric else loss_boil_pct end,
    loss_fry_pct = case when p ? 'loss_fry_pct' then nullif(p->>'loss_fry_pct', '')::numeric else loss_fry_pct end,
    loss_stew_pct = case when p ? 'loss_stew_pct' then nullif(p->>'loss_stew_pct', '')::numeric else loss_stew_pct end,
    loss_bake_pct = case when p ? 'loss_bake_pct' then nullif(p->>'loss_bake_pct', '')::numeric else loss_bake_pct end,
    updated_by = p_actor
  where id = v_id;

  if p ? 'packs' then
    update public.erp_product_packs set archived_at = now()
    where product_id = v_id and archived_at is null
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p->'packs') x where nullif(x->>'id', '') is not null);
    for v_pack in select * from jsonb_array_elements(p->'packs')
    loop
      if nullif(v_pack->>'id', '') is null then
        insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
        values (v_id, nullif(v_pack->>'supplier_id', '')::uuid, btrim(v_pack->>'label'),
                (v_pack->>'qty_base')::numeric, coalesce((v_pack->>'is_default')::boolean, false));
      else
        update public.erp_product_packs set supplier_id = nullif(v_pack->>'supplier_id', '')::uuid,
          label = btrim(v_pack->>'label'), qty_base = (v_pack->>'qty_base')::numeric,
          is_default = coalesce((v_pack->>'is_default')::boolean, false)
        where id = (v_pack->>'id')::uuid and product_id = v_id;
      end if;
    end loop;
  end if;

  -- Staff order settings: shown in the Staff order list when listed.
  if jsonb_typeof(v_staff) = 'object' then
    v_listed := coalesce((v_staff->>'listed')::boolean, false);
    v_sup := nullif(v_staff->>'supplier_id', '')::uuid;
    if v_listed then
      if (select category_id from public.erp_products where id = v_id) is null then v_missing := array_append(v_missing, 'category'); end if;
      if v_sup is null or not exists (select 1 from public.erp_suppliers where id = v_sup and archived_at is null) then
        v_missing := array_append(v_missing, 'supplier');
      end if;
      if nullif(btrim(v_staff->>'unit'), '') is null then v_missing := array_append(v_missing, 'unit'); end if;
      if cardinality(v_missing) > 0 then perform public.erp_raise('ERP_STAFF_INCOMPLETE', array_to_string(v_missing, ',')); end if;
    end if;
    update public.erp_products set
      staff_listed = v_listed,
      staff_supplier_id = v_sup,
      staff_unit = nullif(btrim(v_staff->>'unit'), ''),
      staff_pack = nullif(btrim(v_staff->>'pack'), ''),
      staff_item_no = nullif(btrim(v_staff->>'item_no'), ''),
      staff_hidden = coalesce((v_staff->>'hidden')::boolean, false),
      staff_sort = case when v_listed and not coalesce(v_old.staff_listed, false)
                        then coalesce((select max(staff_sort) + 1 from public.erp_products), 0) else staff_sort end
    where id = v_id;
  end if;

  perform public.erp_audit(p_actor, 'product', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('erp_sync_staff_catalog', 'erp_staff_catalog_version', 'erp_staff_reserved_ids',
                                                       'erp_save_staff_catalog', 'erp_add_staff_catalog', 'erp_save_product')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
