-- FIFO among lots that share received_at (several lines of one receipt, same now())
-- used UUID order and could take the newer price first.
-- Compatible: replaces erp_consume only.

create or replace function public.erp_consume(
  p_doc uuid, p_line uuid, p_product uuid, p_warehouse uuid, p_qty numeric, p_actor text
)
returns table (lot_id uuid, qty numeric, unit_cost numeric, batch_no text, expires_at date,
               received_at timestamptz, origin_lot_id uuid)
language plpgsql
as $$
declare
  v_left numeric := p_qty;
  v_take numeric;
  v_lot public.erp_lots%rowtype;
  v_name text;
  v_wh text;
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  for v_lot in
    select * from public.erp_lots l
    where l.product_id = p_product and l.warehouse_id = p_warehouse and l.qty_left > 0
    order by l.received_at, l.created_at,
             (select dl.line_no from public.erp_document_lines dl where dl.id = l.source_line_id),
             l.id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_lot.qty_left);
    update public.erp_lots set qty_left = qty_left - v_take where id = v_lot.id;
    insert into public.erp_movements (document_id, line_id, lot_id, product_id, warehouse_id, qty, unit_cost, amount, created_by)
    values (p_doc, p_line, v_lot.id, p_product, p_warehouse, -v_take, v_lot.unit_cost,
            case when v_lot.unit_cost is null then null else round(v_take * v_lot.unit_cost, 4) end, p_actor);
    v_left := v_left - v_take;
    lot_id := v_lot.id;
    qty := v_take;
    unit_cost := v_lot.unit_cost;
    batch_no := v_lot.batch_no;
    expires_at := v_lot.expires_at;
    received_at := v_lot.received_at;
    origin_lot_id := coalesce(v_lot.origin_lot_id, v_lot.id);
    return next;
  end loop;
  if v_left > 0 then
    select name_en into v_name from public.erp_products where id = p_product;
    select name into v_wh from public.erp_warehouses where id = p_warehouse;
    perform public.erp_raise('ERP_INSUFFICIENT_STOCK',
      format('%s @ %s: need %s, available %s', v_name, v_wh, round(p_qty, 3), round(p_qty - v_left, 3)));
  end if;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'erp_consume'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
