-- Order line JSON includes the product accounting unit (kg, l, …)
-- so receive “other” can offer that unit, not the pack word box/pack.

create or replace function public.erp_order_line_json(p_line_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', ol.id,
    'product_id', ol.product_id,
    'pack_id', ol.pack_id,
    'packLinkId', ol.pack_link_id,
    'nameEn', ol.name_en,
    'nameVn', ol.name_vn,
    'brand', ol.brand,
    'packLabel', ol.pack_label,
    'packCode', coalesce(
      nullif(btrim((select k.code from public.erp_product_packs k where k.id = ol.pack_link_id)), ''),
      nullif(btrim((select p.product_code from public.erp_products p where p.id = ol.product_id)), '')
    ),
    'unit', ol.unit,
    'baseUnit', (select p.base_unit from public.erp_products p where p.id = ol.product_id),
    'qty', ol.qty,
    'packQty', ol.pack_qty,
    'packQtyBase', ol.pack_qty_base,
    'unitPrice', ol.unit_price,
    'orderedQty', p.ordered_qty,
    'acceptedQty', p.accepted_qty,
    'postedQty', p.posted_qty,
    'remainingQty', p.remaining_qty,
    'closedQty', p.closed_qty,
    'closeReason', ol.close_reason
  )
  from public.erp_supplier_order_lines ol
  join public.erp_order_line_progress p on p.line_id = ol.id
  where ol.id = p_line_id;
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
      and p.proname = 'erp_order_line_json'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
