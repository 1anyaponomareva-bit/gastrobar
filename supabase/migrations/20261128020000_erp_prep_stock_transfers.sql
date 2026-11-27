-- Prep Stock transfer requests: ship now (leave source), receive later (enter destination).
-- Like Orders: share to Zalo, then confirm received.

create table if not exists public.erp_prep_stock_settings (
  id integer primary key default 1 check (id = 1),
  zalo_url text,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.erp_prep_stock_settings (id) values (1)
on conflict (id) do nothing;

alter table public.erp_prep_stock_settings enable row level security;

create table if not exists public.erp_prep_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  item_id text not null check (length(btrim(item_id)) > 0 and length(item_id) <= 80),
  direction text not null check (direction in ('to_warehouse', 'to_kitchen')),
  qty numeric(18,4) not null check (qty > 0),
  status text not null default 'pending'
    check (status in ('pending', 'received', 'cancelled')),
  actor text not null,
  note text,
  created_at timestamptz not null default now(),
  received_at timestamptz,
  received_by text,
  ship_movement_id uuid,
  receive_movement_id uuid
);

create index if not exists erp_prep_stock_transfers_status_idx
  on public.erp_prep_stock_transfers (status, created_at desc);

create index if not exists erp_prep_stock_transfers_item_idx
  on public.erp_prep_stock_transfers (item_id, created_at desc);

alter table public.erp_prep_stock_transfers enable row level security;

-- Widen movement types for ship / receive legs.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'erp_prep_stock_movements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%move_type%'
  loop
    execute format('alter table public.erp_prep_stock_movements drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.erp_prep_stock_movements
  add constraint erp_prep_stock_movements_move_type_check
  check (
    move_type in (
      'produce',
      'to_warehouse',
      'to_kitchen',
      'writeoff_kitchen',
      'writeoff_warehouse',
      'set_warehouse',
      'set_kitchen',
      'ship_to_warehouse',
      'receive_to_warehouse',
      'ship_to_kitchen',
      'receive_to_kitchen'
    )
  );

create or replace function public.erp_prep_stock_settings_get()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'zalo_url', s.zalo_url
      )
      from public.erp_prep_stock_settings s
      where s.id = 1
    ),
    jsonb_build_object('zalo_url', null)
  );
$$;

create or replace function public.erp_prep_stock_settings_set(
  p_zalo_url text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_zalo_url, '')), '');
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
begin
  if v_actor is null then
    perform public.erp_raise('ERP_INVALID', 'actor');
  end if;
  if v_url is not null and v_url !~* '^https://' then
    perform public.erp_raise('ERP_INVALID', 'zalo_url');
  end if;
  insert into public.erp_prep_stock_settings (id, zalo_url, updated_at, updated_by)
  values (1, v_url, now(), v_actor)
  on conflict (id) do update
    set zalo_url = excluded.zalo_url,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  return public.erp_prep_stock_settings_get();
end;
$$;

create or replace function public.erp_prep_stock_transfer_create(
  p_item_id text,
  p_direction text,
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
  v_dir text := lower(btrim(coalesce(p_direction, '')));
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  v_qty numeric(18,4) := round(coalesce(p_qty, 0)::numeric, 4);
  v_kitchen numeric(18,4);
  v_warehouse numeric(18,4);
  v_k_delta numeric(18,4) := 0;
  v_w_delta numeric(18,4) := 0;
  v_move_type text;
  v_move_id uuid;
  v_transfer_id uuid;
begin
  if v_item = '' or length(v_item) > 80 then
    perform public.erp_raise('ERP_INVALID', 'item_id');
  end if;
  if v_actor is null then
    perform public.erp_raise('ERP_INVALID', 'actor');
  end if;
  if v_qty is null or v_qty <= 0 then
    perform public.erp_raise('ERP_INVALID', 'qty');
  end if;
  if v_dir not in ('to_warehouse', 'to_kitchen') then
    perform public.erp_raise('ERP_INVALID', 'direction');
  end if;
  if not coalesce(p_allow_warehouse, true) then
    perform public.erp_raise('ERP_INVALID', 'no_warehouse');
  end if;

  perform pg_advisory_xact_lock(hashtext('prep_stock:' || v_item));

  select kitchen, warehouse into v_kitchen, v_warehouse
  from public.erp_prep_stock_item_balance(v_item);
  v_kitchen := coalesce(v_kitchen, 0);
  v_warehouse := coalesce(v_warehouse, 0);

  if v_dir = 'to_warehouse' then
    if v_kitchen < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'prep_kitchen');
    end if;
    v_k_delta := -v_qty;
    v_move_type := 'ship_to_warehouse';
  else
    if v_warehouse < v_qty then
      perform public.erp_raise('ERP_INSUFFICIENT', 'warehouse');
    end if;
    v_w_delta := -v_qty;
    v_move_type := 'ship_to_kitchen';
  end if;

  insert into public.erp_prep_stock_transfers (
    item_id, direction, qty, status, actor, note
  ) values (
    v_item, v_dir, v_qty, 'pending', v_actor, nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into v_transfer_id;

  insert into public.erp_prep_stock_movements (
    item_id, move_type, qty, kitchen_delta, warehouse_delta, actor, note
  ) values (
    v_item, v_move_type, v_qty, v_k_delta, v_w_delta, v_actor, 'transfer:' || v_transfer_id::text
  ) returning id into v_move_id;

  update public.erp_prep_stock_transfers
    set ship_movement_id = v_move_id
  where id = v_transfer_id;

  v_kitchen := v_kitchen + v_k_delta;
  v_warehouse := v_warehouse + v_w_delta;

  return jsonb_build_object(
    'id', v_transfer_id,
    'item_id', v_item,
    'direction', v_dir,
    'qty', v_qty,
    'status', 'pending',
    'actor', v_actor,
    'created_at', now(),
    'kitchen', v_kitchen,
    'warehouse', v_warehouse,
    'total', v_kitchen + v_warehouse,
    'ship_movement_id', v_move_id
  );
end;
$$;

create or replace function public.erp_prep_stock_transfer_receive(
  p_transfer_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
  t record;
  v_kitchen numeric(18,4);
  v_warehouse numeric(18,4);
  v_k_delta numeric(18,4) := 0;
  v_w_delta numeric(18,4) := 0;
  v_move_type text;
  v_move_id uuid;
begin
  if v_actor is null then
    perform public.erp_raise('ERP_INVALID', 'actor');
  end if;
  if p_transfer_id is null then
    perform public.erp_raise('ERP_INVALID', 'transfer_id');
  end if;

  select * into t
  from public.erp_prep_stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    perform public.erp_raise('ERP_NOT_FOUND', 'transfer');
  end if;
  if t.status <> 'pending' then
    perform public.erp_raise('ERP_INVALID', 'status');
  end if;

  perform pg_advisory_xact_lock(hashtext('prep_stock:' || t.item_id));

  select kitchen, warehouse into v_kitchen, v_warehouse
  from public.erp_prep_stock_item_balance(t.item_id);
  v_kitchen := coalesce(v_kitchen, 0);
  v_warehouse := coalesce(v_warehouse, 0);

  if t.direction = 'to_warehouse' then
    v_w_delta := t.qty;
    v_move_type := 'receive_to_warehouse';
  else
    v_k_delta := t.qty;
    v_move_type := 'receive_to_kitchen';
  end if;

  insert into public.erp_prep_stock_movements (
    item_id, move_type, qty, kitchen_delta, warehouse_delta, actor, note
  ) values (
    t.item_id, v_move_type, t.qty, v_k_delta, v_w_delta, v_actor, 'transfer:' || t.id::text
  ) returning id into v_move_id;

  update public.erp_prep_stock_transfers
    set status = 'received',
        received_at = now(),
        received_by = v_actor,
        receive_movement_id = v_move_id
  where id = t.id;

  v_kitchen := v_kitchen + v_k_delta;
  v_warehouse := v_warehouse + v_w_delta;

  return jsonb_build_object(
    'id', t.id,
    'item_id', t.item_id,
    'direction', t.direction,
    'qty', t.qty,
    'status', 'received',
    'actor', t.actor,
    'created_at', t.created_at,
    'received_at', now(),
    'received_by', v_actor,
    'kitchen', v_kitchen,
    'warehouse', v_warehouse,
    'total', v_kitchen + v_warehouse,
    'receive_movement_id', v_move_id
  );
end;
$$;

create or replace function public.erp_prep_stock_transfers_list(
  p_status text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
      from (
        select
          t.id,
          t.item_id,
          t.direction,
          t.qty,
          t.status,
          t.actor,
          t.note,
          t.created_at,
          t.received_at,
          t.received_by
        from public.erp_prep_stock_transfers t
        where p_status is null or t.status = btrim(p_status)
      ) x
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.erp_prep_stock_transfer_get(p_transfer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', t.id,
        'item_id', t.item_id,
        'direction', t.direction,
        'qty', t.qty,
        'status', t.status,
        'actor', t.actor,
        'note', t.note,
        'created_at', t.created_at,
        'received_at', t.received_at,
        'received_by', t.received_by
      )
      from public.erp_prep_stock_transfers t
      where t.id = p_transfer_id
    ),
    'null'::jsonb
  );
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'erp_prep_stock_settings_get',
        'erp_prep_stock_settings_set',
        'erp_prep_stock_transfer_create',
        'erp_prep_stock_transfer_receive',
        'erp_prep_stock_transfers_list',
        'erp_prep_stock_transfer_get'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
