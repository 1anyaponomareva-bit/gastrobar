-- English pack name stays erp_packs.name. Add optional Vietnamese name_vn.
-- Additive: nullable column, no backfill, no drops. Existing rows keep empty VN.

alter table public.erp_packs add column if not exists name_vn text;

comment on column public.erp_packs.name_vn is 'Optional Vietnamese pack name. English is erp_packs.name.';

create or replace function public.erp_save_pack(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', p->>'label', ''));
  v_name_vn text := nullif(btrim(coalesce(p->>'name_vn', '')), '');
  v_unit text := nullif(p->>'unit', '');
  v_qty numeric := nullif(p->>'qty_base', '')::numeric;
  v_old public.erp_packs;
  v_found uuid;
begin
  if v_name is null or length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if length(v_name) > 80 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if p ? 'name_vn' and length(btrim(coalesce(p->>'name_vn', ''))) > 80 then
    perform public.erp_raise('ERP_INVALID', 'name_vn');
  end if;
  if v_unit not in ('kg', 'l', 'pcs') then perform public.erp_raise('ERP_INVALID', 'unit'); end if;
  if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty_base'); end if;
  if v_id is not null then v_id := public.erp_canonical_pack_id(v_id); end if;
  if v_id is null then
    select id into v_found
    from public.erp_packs
    where archived_at is null
      and lower(btrim(name)) = lower(v_name)
      and unit = v_unit
      and qty_base = v_qty
    order by id
    limit 1;
    if v_found is not null then return v_found; end if;
    insert into public.erp_packs (name, name_vn, unit, qty_base, created_by, updated_by)
    values (v_name, case when p ? 'name_vn' then v_name_vn else null end, v_unit, v_qty, p_actor, p_actor)
    returning id into v_id;
  else
    select * into v_old from public.erp_packs where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_old.archived_at is not null then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    update public.erp_packs
    set name = v_name,
        name_vn = case when p ? 'name_vn' then v_name_vn else name_vn end,
        unit = v_unit,
        qty_base = v_qty,
        updated_by = p_actor
    where id = v_id;
    update public.erp_product_packs
    set label = v_name, qty_base = v_qty
    where pack_id = v_id;
  end if;
  perform public.erp_audit(p_actor, 'pack', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

-- Order catalog: keep EN label and VN name separate so the UI language switcher can pick one.
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
      and p.proname in ('erp_save_pack', 'erp_order_product_json')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
