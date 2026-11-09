-- Kitchen receive must not throw on Samsung-shaped payloads:
-- comma decimals, missing/invalid orderLineId, numeric pack unit "1", empty lines.
-- Still a flag only: no erp_documents, no stock.

create or replace function public.erp_order_parse_uuid(p text)
returns uuid
language sql
immutable
as $$
  select case
    when p is null or btrim(p) = '' then null
    when btrim(p) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then btrim(p)::uuid
    else null
  end;
$$;

create or replace function public.erp_order_parse_qty(p text)
returns numeric
language plpgsql
immutable
as $$
declare
  t text;
begin
  t := btrim(coalesce(p, ''));
  if t = '' then return null; end if;
  t := replace(replace(replace(t, ' ', ''), chr(160), ''), ',', '.');
  if t !~ '^[+-]?[0-9]+(\.[0-9]+)?$' then return null; end if;
  return t::numeric;
exception
  when others then
    return null;
end;
$$;

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
  v_line_id uuid;
  v_product uuid;
  v_pack uuid;
  v_i integer := 0;
  v_lines jsonb;
  v_found boolean;
begin
  -- TEMPORARY: flag received qty on the order only. Do not create erp_documents,
  -- erp_order_receipts, or stock movements.
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

  v_lines := case
    when jsonb_typeof(p_payload->'lines') = 'array' then p_payload->'lines'
    else '[]'::jsonb
  end;

  for v_line in select value from jsonb_array_elements(v_lines) as t(value)
  loop
    if jsonb_typeof(v_line) <> 'object' then continue; end if;
    v_line_id := public.erp_order_parse_uuid(coalesce(v_line->>'orderLineId', v_line->>'order_line_id', v_line->>'id'));
    v_product := public.erp_order_parse_uuid(coalesce(v_line->>'product_id', v_line->>'productId'));
    v_pack := public.erp_order_parse_uuid(coalesce(v_line->>'pack_id', v_line->>'packId'));

    v_found := false;
    if v_line_id is not null then
      select * into v_ol
      from public.erp_supplier_order_lines
      where id = v_line_id and order_id = v.id;
      v_found := found;
    end if;
    if not v_found and v_product is not null then
      select * into v_ol
      from public.erp_supplier_order_lines
      where order_id = v.id
        and product_id = v_product
        and (v_pack is null or pack_id is not distinct from v_pack)
      order by line_no, id
      limit 1;
      v_found := found;
    end if;
    if not v_found then continue; end if;

    v_pack_qty := coalesce(
      public.erp_order_parse_qty(v_line->>'packQty'),
      public.erp_order_parse_qty(v_line->>'pack_qty')
    );
    v_qty := coalesce(
      public.erp_order_parse_qty(v_line->>'qty'),
      public.erp_order_parse_qty(v_line->>'actualQty'),
      public.erp_order_parse_qty(v_line->>'actual_qty')
    );
    if v_qty is null and v_pack_qty is not null then
      v_qty := round(v_pack_qty * coalesce(v_ol.pack_qty_base, 1), 6);
    end if;
    if v_qty is null or v_qty <= 0 then
      select remaining_qty into v_qty
      from public.erp_order_line_progress
      where line_id = v_ol.id;
    end if;
    if v_qty is null or v_qty <= 0 then continue; end if;

    update public.erp_supplier_order_lines
    set received_qty = coalesce(received_qty, 0) + v_qty
    where id = v_ol.id;
    v_i := v_i + 1;
  end loop;

  if v_i = 0 then
    update public.erp_supplier_order_lines ol
    set received_qty = coalesce(ol.received_qty, 0) + p.remaining_qty
    from public.erp_order_line_progress p
    where ol.id = p.line_id
      and ol.order_id = v.id
      and p.remaining_qty > 0;
  end if;

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
      and p.proname in ('erp_order_receive', 'erp_order_parse_uuid', 'erp_order_parse_qty')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
