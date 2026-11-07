-- One employee «Товар получен» is the whole receive. Actual kg/l is stored,
-- leftover vs ordered is closed so the cook is not asked again.

create or replace function public.erp_order_receive(p_id uuid, p_payload jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_order_norm_email(p_actor);
  v public.erp_supplier_orders;
  v_key text;
  v_line jsonb;
  v_ol public.erp_supplier_order_lines;
  v_qty numeric;
  v_pack_qty numeric;
  v_i integer := 0;
begin
  -- TEMPORARY: flag received qty on the order only. Do not create erp_documents,
  -- erp_order_receipts, or stock movements. Full unpublished receipt path comes later.
  if v_actor = '' then perform public.erp_raise('ERP_FORBIDDEN', 'actor'); end if;
  v_key := nullif(btrim(coalesce(p_payload->>'idempotencyKey', p_payload->>'idempotency_key', '')), '');
  if v_key is null then perform public.erp_raise('ERP_INVALID', 'idempotencyKey'); end if;

  select * into v from public.erp_supplier_orders where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  perform public.erp_order_assert_see(v_actor, v, false);
  if v.status = 'draft' then perform public.erp_raise('ERP_INVALID', 'not_placed'); end if;
  if v.status = 'closed' then perform public.erp_raise('ERP_ORDER_CLOSED'); end if;
  if v_key = any(coalesce(v.receive_keys, '{}')) then
    return public.erp_order_to_json(v.id);
  end if;
  if v.received_at is not null or v.status = 'received' then
    return public.erp_order_to_json(v.id);
  end if;
  if v.warehouse_id is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  loop
    select * into v_ol
    from public.erp_supplier_order_lines
    where id = nullif(coalesce(v_line->>'orderLineId', v_line->>'order_line_id', v_line->>'id'), '')::uuid
      and order_id = v.id;
    if not found then perform public.erp_raise('ERP_INVALID', 'order_line_id'); end if;

    v_pack_qty := nullif(coalesce(v_line->>'packQty', v_line->>'pack_qty'), '')::numeric;
    v_qty := nullif(coalesce(v_line->>'qty', v_line->>'actualQty', v_line->>'actual_qty'), '')::numeric;
    if v_qty is null and v_pack_qty is not null then
      v_qty := round(v_pack_qty * coalesce(v_ol.pack_qty_base, 1), 6);
    end if;
    if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_ol.name_en); end if;

    update public.erp_supplier_order_lines
    set received_qty = coalesce(received_qty, 0) + v_qty
    where id = v_ol.id;
    v_i := v_i + 1;
  end loop;

  if v_i = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT'); end if;

  update public.erp_supplier_order_lines ol
  set closed_qty = coalesce(ol.closed_qty, 0) + p.remaining_qty
  from public.erp_order_line_progress p
  where ol.id = p.line_id
    and ol.order_id = v.id
    and p.remaining_qty > 0;

  update public.erp_supplier_orders
  set received_at = coalesce(received_at, now()),
      received_by = coalesce(received_by, v_actor),
      receive_keys = array_append(coalesce(receive_keys, '{}'), v_key),
      updated_by = v_actor
  where id = v.id;

  perform public.erp_order_refresh_status(v.id);
  perform public.erp_audit(v_actor, 'supplier_order', v.id, 'receive', null,
    jsonb_build_object('temporary', true, 'idempotency_key', v_key));
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
      and p.proname = 'erp_order_receive'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Orders already flagged received: close leftover so the form does not reopen.
update public.erp_supplier_order_lines ol
set closed_qty = coalesce(ol.closed_qty, 0) + p.remaining_qty
from public.erp_order_line_progress p
join public.erp_supplier_orders o on o.id = p.order_id
where ol.id = p.line_id
  and o.received_at is not null
  and o.status in ('ordered', 'partial')
  and p.remaining_qty > 0;

do $$
declare
  r record;
begin
  for r in
    select id
    from public.erp_supplier_orders
    where received_at is not null
      and status in ('ordered', 'partial')
  loop
    perform public.erp_order_refresh_status(r.id);
  end loop;
end $$;
