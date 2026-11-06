-- Optional supplier SKU on a product↔pack link (erp_product_packs.code).
-- Independent of erp_products.product_code (ingredient article). Nullable, trimmed empty → null, not unique.
-- Additive: ALTER ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE functions. Does not rewrite pack ids.

alter table public.erp_product_packs add column if not exists code text;

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
  v_link uuid;
  v_catalog uuid;
  v_pack_unit text;
  v_pack_code text;
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
    product_code = case when p ? 'product_code' then nullif(btrim(p->>'product_code'), '') else product_code end,
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
      v_link := nullif(v_pack->>'id', '')::uuid;
      v_catalog := public.erp_canonical_pack_id(nullif(v_pack->>'pack_id', '')::uuid);
      v_pack_code := case when v_pack ? 'code' then nullif(btrim(v_pack->>'code'), '') else null end;
      if v_catalog is not null then
        select unit into v_pack_unit from public.erp_packs where id = v_catalog and archived_at is null;
        if v_pack_unit is null then perform public.erp_raise('ERP_NOT_FOUND', 'pack'); end if;
        if v_unit is not null and v_pack_unit is distinct from v_unit then perform public.erp_raise('ERP_PACK_UNIT'); end if;
      end if;
      if v_link is null then
        insert into public.erp_product_packs (product_id, pack_id, supplier_id, label, qty_base, is_default, code)
        values (
          v_id,
          v_catalog,
          nullif(v_pack->>'supplier_id', '')::uuid,
          btrim(coalesce(v_pack->>'label', v_pack->>'name', '')),
          coalesce(nullif(v_pack->>'qty_base', '')::numeric, 0),
          coalesce((v_pack->>'is_default')::boolean, false),
          v_pack_code
        );
      else
        update public.erp_product_packs set
          supplier_id = nullif(v_pack->>'supplier_id', '')::uuid,
          is_default = coalesce((v_pack->>'is_default')::boolean, false),
          pack_id = coalesce(v_catalog, pack_id),
          code = case when v_pack ? 'code' then v_pack_code else code end
        where id = v_link and product_id = v_id;
        update public.erp_product_packs k
        set label = pck.name, qty_base = pck.qty_base
        from public.erp_packs pck
        where k.id = v_link and k.pack_id = pck.id;
      end if;
    end loop;
  end if;

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
      'unit', pk.unit,
      'code', k.code
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

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('erp_save_product', 'erp_order_supplier_products')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
