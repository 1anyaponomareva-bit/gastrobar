-- Delivery address + phone on ERP warehouses (PDF header). Additive only.

alter table public.erp_warehouses
  add column if not exists address text,
  add column if not exists phone text;

update public.erp_warehouses
set
  address = 'Khối 12A tòa OC3 thuộc dự án Mường Thanh Viễn Triều, Phường Bắc Nha Trang, Khánh Hòa',
  phone = coalesce(nullif(btrim(phone), ''), '+84 98 863 15 07')
where code = 'prep-kitchen';

update public.erp_warehouses
set
  address = '152 Lk 77 Đường số 51' || chr(10) || 'Phường Nam Nha Trang, Tỉnh Khánh Hòa',
  phone = coalesce(nullif(btrim(phone), ''), '+84 98 863 15 07')
where code = 'warehouse';

create or replace function public.erp_save_ref(p_entity text, p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', p->>'name_en', ''));
  v_table text;
begin
  v_table := case p_entity when 'category' then 'erp_categories' when 'supplier' then 'erp_suppliers'
                           when 'warehouse' then 'erp_warehouses' when 'channel' then 'erp_sales_channels' end;
  if v_table is null then perform public.erp_raise('ERP_INVALID', 'entity'); end if;
  if v_name = '' then perform public.erp_raise('ERP_INVALID', 'name'); end if;

  if p_entity = 'category' then
    if v_id is null then
      insert into public.erp_categories (code, name_en, name_vn, sort)
      values (public.erp_unique_code('erp_categories', v_name), v_name, coalesce(btrim(p->>'name_vn'), ''),
              coalesce((select max(sort) + 1 from public.erp_categories), 0))
      returning id into v_id;
    else
      update public.erp_categories set name_en = v_name, name_vn = coalesce(btrim(p->>'name_vn'), '') where id = v_id;
    end if;
  elsif p_entity = 'supplier' then
    if v_id is null then
      insert into public.erp_suppliers (code, name, zalo_url, sort)
      values (public.erp_unique_code('erp_suppliers', v_name), v_name, nullif(btrim(p->>'zalo_url'), ''),
              coalesce((select max(sort) + 1 from public.erp_suppliers), 0))
      returning id into v_id;
    else
      update public.erp_suppliers set name = v_name, zalo_url = nullif(btrim(p->>'zalo_url'), '') where id = v_id;
    end if;
  elsif p_entity = 'warehouse' then
    if v_id is null then
      insert into public.erp_warehouses (code, name, kind, sort, address, phone)
      values (
        public.erp_unique_code('erp_warehouses', v_name),
        v_name,
        coalesce(nullif(p->>'kind', ''), 'other'),
        coalesce((select max(sort) + 1 from public.erp_warehouses), 0),
        case when p ? 'address' then nullif(btrim(p->>'address'), '') else null end,
        case when p ? 'phone' then nullif(btrim(p->>'phone'), '') else null end
      )
      returning id into v_id;
    else
      update public.erp_warehouses set
        name = v_name,
        kind = coalesce(nullif(p->>'kind', ''), kind),
        address = case when p ? 'address' then nullif(btrim(p->>'address'), '') else address end,
        phone = case when p ? 'phone' then nullif(btrim(p->>'phone'), '') else phone end
      where id = v_id;
    end if;
  else
    if v_id is null then
      insert into public.erp_sales_channels (code, name, commission_pct, sort)
      values (public.erp_unique_code('erp_sales_channels', v_name), v_name, nullif(p->>'commission_pct', '')::numeric,
              coalesce((select max(sort) + 1 from public.erp_sales_channels), 0))
      returning id into v_id;
    else
      update public.erp_sales_channels set name = v_name, commission_pct = nullif(p->>'commission_pct', '')::numeric
      where id = v_id;
    end if;
  end if;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_audit(p_actor, p_entity, v_id, 'save', null, p);
  return v_id;
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
    'warehouseAddress', (select nullif(btrim(address), '') from public.erp_warehouses where id = o.warehouse_id),
    'warehousePhone', (select nullif(btrim(phone), '') from public.erp_warehouses where id = o.warehouse_id),
    'kind', case when o.status in ('ordered', 'partial', 'closed') then 'final' else 'pre' end,
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
        'unit', public.erp_order_pdf_qty_unit(
          l.pack_label,
          coalesce((select pk.unit from public.erp_packs pk where pk.id = l.pack_id), l.unit, '')
        ),
        'qty', coalesce(l.pack_qty, l.qty)
      ) order by l.line_no, l.id)
      from public.erp_supplier_order_lines l
      where l.order_id = o.id and l.qty > 0
    ), '[]'::jsonb)
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
  if v.status = 'closed' then perform public.erp_raise('ERP_ORDER_CLOSED'); end if;
  if v.status <> 'draft' and v.placed_revision is not distinct from v.revision then
    return public.erp_order_to_json(v.id);
  end if;
  if not exists (select 1 from public.erp_supplier_order_lines where order_id = v.id) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v.order_no);
  end if;
  v_wh := coalesce(v.warehouse_id, public.erp_order_default_warehouse());
  if v_wh is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;
  perform public.erp_check_warehouse(v_wh, 'warehouse');

  update public.erp_supplier_orders
  set status = case when status = 'draft' then 'ordered' else status end,
      warehouse_id = v_wh,
      placed_revision = revision,
      placed_at = coalesce(placed_at, now()),
      placed_by = coalesce(placed_by, v_actor),
      ordered_at = coalesce(placed_at, now()),
      supplier_name = (select name from public.erp_suppliers where id = v.supplier_id),
      warehouse_name = (select name from public.erp_warehouses where id = v_wh),
      updated_by = v_actor,
      lock_version = lock_version + 1
  where id = v.id;

  update public.erp_supplier_orders
  set pdf_snapshot = public.erp_order_build_pdf_input(id)
  where id = v.id;

  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'place');
  return public.erp_order_to_json(v.id);
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
      and p.proname in ('erp_save_ref', 'erp_order_build_pdf_input', 'erp_order_place')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
