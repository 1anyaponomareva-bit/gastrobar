-- PDF QTY is the ordered pack count + pack container (box/pack), not stock kg/l.

create or replace function public.erp_order_pdf_qty_unit(p_label text, p_fallback text)
returns text
language plpgsql
immutable
as $$
declare
  v_label text := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
  v_head text;
  v_rest text;
begin
  v_head := lower(split_part(v_label, ' ', 1));
  v_rest := btrim(substr(v_label, char_length(split_part(v_label, ' ', 1)) + 1));
  if v_rest <> '' and v_head in ('box', 'pack', 'pcs', 'pc', 'btl', 'bottle', 'can', 'bag') then
    if v_head = 'pc' then return 'pcs'; end if;
    if v_head = 'bottle' then return 'btl'; end if;
    return v_head;
  end if;
  return coalesce(nullif(btrim(p_fallback), ''), '');
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

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_order_pdf_qty_unit', 'erp_order_build_pdf_input')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
