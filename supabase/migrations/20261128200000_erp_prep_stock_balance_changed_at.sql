-- Expose last stock change date per Prep Stock item (max movement created_at).

create or replace function public.erp_prep_stock_balances()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'item_id', b.item_id,
          'kitchen', b.kitchen,
          'warehouse', b.warehouse,
          'total', b.total,
          'changed_at', b.changed_at,
          'changedAt', b.changed_at
        )
        order by b.item_id
      )
      from (
        select
          m.item_id,
          round(sum(m.kitchen_delta)::numeric, 4) as kitchen,
          round(sum(m.warehouse_delta)::numeric, 4) as warehouse,
          round((sum(m.kitchen_delta) + sum(m.warehouse_delta))::numeric, 4) as total,
          max(m.created_at) as changed_at
        from public.erp_prep_stock_movements m
        group by m.item_id
      ) b
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.erp_prep_stock_move(
  p_item_id text,
  p_move_type text,
  p_qty numeric,
  p_actor text,
  p_note text default null,
  p_allow_warehouse boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text := btrim(coalesce(p_item_id, ''));
  v_type text := lower(btrim(coalesce(p_move_type, '')));
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  v_qty numeric(18,4) := round(coalesce(p_qty, 0)::numeric, 4);
  v_kitchen numeric(18,4);
  v_warehouse numeric(18,4);
  v_k_delta numeric(18,4) := 0;
  v_w_delta numeric(18,4) := 0;
  v_id uuid;
  v_at timestamptz := now();
begin
  if v_item = '' or length(v_item) > 80 then
    perform public.erp_raise('ERP_INVALID', 'item_id');
  end if;
  if v_actor is null then
    perform public.erp_raise('ERP_INVALID', 'actor');
  end if;
  if v_qty is null or v_qty < 0 then
    perform public.erp_raise('ERP_INVALID', 'qty');
  end if;
  if v_type not in (
    'produce', 'to_warehouse', 'to_kitchen',
    'writeoff_kitchen', 'writeoff_warehouse',
    'set_warehouse', 'set_kitchen'
  ) then
    perform public.erp_raise('ERP_INVALID', 'move_type');
  end if;

  perform pg_advisory_xact_lock(hashtext('prep_stock:' || v_item));

  select kitchen, warehouse into v_kitchen, v_warehouse
  from public.erp_prep_stock_item_balance(v_item);
  v_kitchen := coalesce(v_kitchen, 0);
  v_warehouse := coalesce(v_warehouse, 0);

  if v_type = 'produce' then
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty'); end if;
    v_k_delta := v_qty;
  elsif v_type = 'to_warehouse' then
    if not coalesce(p_allow_warehouse, true) then
      perform public.erp_raise('ERP_INVALID', 'no_warehouse');
    end if;
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty'); end if;
    if v_kitchen < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'prep_kitchen');
    end if;
    v_k_delta := -v_qty;
    v_w_delta := v_qty;
  elsif v_type = 'to_kitchen' then
    if not coalesce(p_allow_warehouse, true) then
      perform public.erp_raise('ERP_INVALID', 'no_warehouse');
    end if;
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty'); end if;
    if v_warehouse < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'warehouse');
    end if;
    v_k_delta := v_qty;
    v_w_delta := -v_qty;
  elsif v_type = 'writeoff_kitchen' then
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty'); end if;
    if v_kitchen < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'prep_kitchen');
    end if;
    v_k_delta := -v_qty;
  elsif v_type = 'writeoff_warehouse' then
    if not coalesce(p_allow_warehouse, true) then
      perform public.erp_raise('ERP_INVALID', 'no_warehouse');
    end if;
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty'); end if;
    if v_warehouse < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'warehouse');
    end if;
    v_w_delta := -v_qty;
  elsif v_type = 'set_warehouse' then
    if not coalesce(p_allow_warehouse, true) then
      perform public.erp_raise('ERP_INVALID', 'no_warehouse');
    end if;
    v_w_delta := v_qty - v_warehouse;
  elsif v_type = 'set_kitchen' then
    v_k_delta := v_qty - v_kitchen;
  end if;

  insert into public.erp_prep_stock_movements (
    item_id, move_type, qty, kitchen_delta, warehouse_delta, actor, note, created_at
  ) values (
    v_item, v_type, v_qty, v_k_delta, v_w_delta, v_actor, nullif(btrim(coalesce(p_note, '')), ''), v_at
  ) returning id into v_id;

  v_kitchen := v_kitchen + v_k_delta;
  v_warehouse := v_warehouse + v_w_delta;

  return jsonb_build_object(
    'id', v_id,
    'item_id', v_item,
    'move_type', v_type,
    'qty', v_qty,
    'kitchen', v_kitchen,
    'warehouse', v_warehouse,
    'total', v_kitchen + v_warehouse,
    'changed_at', v_at,
    'changedAt', v_at
  );
end;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('erp_prep_stock_balances', 'erp_prep_stock_move')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
