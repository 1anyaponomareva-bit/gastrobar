-- Menu: sales locations (Точки продаж) and a 14-day trash for ingredient categories.
-- Additive. No data deleted. Does not change FIFO consume, lots, or posted documents.
-- Location ≠ warehouse. Stock documents keep warehouse_id.
-- default_warehouse_id is the default write-off warehouse for that location (nullable until chosen).
-- Do not auto-merge stocks of the two locations.
-- Next decision: Location → Warehouse → write-off (shared remainder vs own stock).
-- Prep Kitchen is a PRODUCTION workshop, not a sales location. Gastrobar is excluded.
-- Menu tab is «Точки продаж», not «Цехи». Leave erp_workshops for a future Production module.
-- Ingredient categories reuse erp_categories / product.category_id (no second book).

-- ---------------------------------------------------------------------------
-- Sales locations
-- ---------------------------------------------------------------------------

create table if not exists public.erp_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  address text,
  is_active boolean not null default true,
  default_warehouse_id uuid references public.erp_warehouses (id),
  created_at timestamptz not null default now()
);
create unique index if not exists erp_locations_name_uidx
  on public.erp_locations (lower(btrim(name)));

insert into public.erp_locations (code, name, address, is_active, default_warehouse_id) values
  ('online-kitchen', 'Online Kitchen', null, true, null),
  ('food-truck', 'Food Truck', null, true, null)
on conflict (code) do nothing;

-- Assortment / prices later via location_id. Stub only: one catalog row stays shared;
-- availability and price are per location. Documents are not bound here yet.
create table if not exists public.erp_location_products (
  location_id uuid not null references public.erp_locations (id),
  product_id uuid not null references public.erp_products (id) on delete cascade,
  visible boolean not null default true,
  sale_price numeric(18,4) check (sale_price is null or sale_price >= 0),
  primary key (location_id, product_id)
);
create index if not exists erp_location_products_product_idx
  on public.erp_location_products (product_id);

-- ---------------------------------------------------------------------------
-- Category trash (Удалённые), 14 days. Not the product archive (archived_at).
-- ---------------------------------------------------------------------------

alter table public.erp_categories add column if not exists deleted_at timestamptz;
drop index if exists public.erp_categories_name_uidx;
create unique index erp_categories_name_uidx
  on public.erp_categories (lower(btrim(name_en)))
  where archived_at is null and deleted_at is null;

create or replace function public.erp_purge_deleted_categories(p_actor text default null)
returns integer
language plpgsql
as $$
declare
  v_ids uuid[];
  v_n integer := 0;
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.erp_categories
  where deleted_at is not null
    and deleted_at <= clock_timestamp() - interval '14 days';
  v_n := cardinality(v_ids);
  if v_n = 0 then return 0; end if;
  update public.erp_products set category_id = null where category_id = any (v_ids);
  update public.erp_dishes set category_id = null where category_id = any (v_ids);
  delete from public.erp_categories where id = any (v_ids);
  insert into public.erp_audit_log (actor, entity, entity_id, action)
  select p_actor, 'category', x, 'purge' from unnest(v_ids) as x;
  return v_n;
end;
$$;

create or replace function public.erp_delete_category(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_name text;
  v_qty numeric;
begin
  select name_en into v_name from public.erp_categories where id = p_id and deleted_at is null;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'category'); end if;
  select coalesce(sum(l.qty_left), 0) into v_qty
  from public.erp_lots l
  join public.erp_products p on p.id = l.product_id
  where p.category_id = p_id;
  if v_qty > 0 then perform public.erp_raise('ERP_CATEGORY_HAS_STOCK', v_name); end if;
  update public.erp_categories set deleted_at = now() where id = p_id;
  perform public.erp_audit(p_actor, 'category', p_id, 'trash');
end;
$$;

create or replace function public.erp_restore_category(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v_row public.erp_categories;
begin
  select * into v_row from public.erp_categories where id = p_id;
  if not found then perform public.erp_raise('ERP_TRASH_EXPIRED'); end if;
  if v_row.deleted_at is null then perform public.erp_raise('ERP_INVALID', 'category'); end if;
  if v_row.deleted_at <= clock_timestamp() - interval '14 days' then
    perform public.erp_raise('ERP_TRASH_EXPIRED');
  end if;
  if exists (
    select 1 from public.erp_categories
    where id <> p_id
      and archived_at is null
      and deleted_at is null
      and lower(btrim(name_en)) = lower(btrim(v_row.name_en))
  ) then
    perform public.erp_raise('ERP_DUPLICATE', v_row.name_en);
  end if;
  update public.erp_categories set deleted_at = null where id = p_id;
  perform public.erp_audit(p_actor, 'category', p_id, 'restore');
end;
$$;

-- ---------------------------------------------------------------------------
-- Location CRUD. Deleting is allowed only when unused (no assortment; documents
-- still use warehouse_id, not location_id — check documents when that FK exists).
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_location(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_code text := nullif(btrim(coalesce(p->>'code', '')), '');
  v_address text := nullif(btrim(coalesce(p->>'address', '')), '');
  v_wh uuid := nullif(p->>'default_warehouse_id', '')::uuid;
  v_active boolean;
begin
  if v_name = '' then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_wh is not null and not exists (select 1 from public.erp_warehouses where id = v_wh) then
    perform public.erp_raise('ERP_NOT_FOUND', 'default_warehouse_id');
  end if;
  v_active := coalesce(nullif(p->>'is_active', '')::boolean, true);
  if v_id is null then
    if v_code is null then v_code := public.erp_unique_code('erp_locations', v_name); end if;
    insert into public.erp_locations (code, name, address, is_active, default_warehouse_id)
    values (v_code, v_name, v_address, v_active, v_wh)
    returning id into v_id;
    perform public.erp_audit(p_actor, 'location', v_id, 'create', null, p);
  else
    if not exists (select 1 from public.erp_locations where id = v_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'location');
    end if;
    update public.erp_locations set
      name = v_name,
      code = coalesce(v_code, code),
      address = case when p ? 'address' then v_address else address end,
      is_active = case when p ? 'is_active' then v_active else is_active end,
      default_warehouse_id = case when p ? 'default_warehouse_id' then v_wh else default_warehouse_id end
    where id = v_id;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'location'); end if;
    perform public.erp_audit(p_actor, 'location', v_id, 'update', null, p);
  end if;
  return v_id;
end;
$$;

create or replace function public.erp_delete_location(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.erp_locations where id = p_id) then
    perform public.erp_raise('ERP_NOT_FOUND', 'location');
  end if;
  if exists (select 1 from public.erp_location_products where location_id = p_id) then
    perform public.erp_raise('ERP_LOCATION_IN_USE');
  end if;
  -- Documents keep warehouse_id. When they gain location_id, refuse delete if any row points here.
  delete from public.erp_locations where id = p_id;
  perform public.erp_audit(p_actor, 'location', p_id, 'delete');
end;
$$;

-- ---------------------------------------------------------------------------
-- State: add locations. If Agent 3's unmerged workshops/venues tables already
-- exist, keep loading them so this file does not rewind that branch. Menu UI
-- still does not present workshops as this tab.
-- ---------------------------------------------------------------------------

create or replace function public.erp_load_state(p_parts text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  want text[];
  out jsonb := '{}'::jsonb;
begin
  want := string_to_array(nullif(btrim(coalesce(p_parts, '')), ''), ',');
  if want is null then
    want := array[
      'settings', 'categories', 'suppliers', 'warehouses', 'channels', 'products',
      'packs', 'productPacks', 'stock', 'recipes', 'dishes', 'writeoffReasons', 'costSources',
      'locations'
    ];
    if to_regclass('public.erp_workshops') is not null then
      want := array_append(want, 'workshops');
    end if;
    if to_regclass('public.erp_venues') is not null then
      want := array_append(want, 'venues');
    end if;
    if to_regclass('public.erp_ingredient_categories') is not null then
      want := array_append(want, 'ingredientCategories');
    end if;
  end if;

  if 'settings' = any(want) then
    out := out || jsonb_build_object('settings', (select to_jsonb(s) from public.erp_settings s where s.id = 1));
  end if;
  if 'categories' = any(want) then
    out := out || jsonb_build_object(
      'categories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_categories r)
    );
  end if;
  if 'suppliers' = any(want) then
    out := out || jsonb_build_object(
      'suppliers',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_suppliers r)
    );
  end if;
  if 'warehouses' = any(want) then
    out := out || jsonb_build_object(
      'warehouses',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_warehouses r)
    );
  end if;
  if 'locations' = any(want) then
    out := out || jsonb_build_object(
      'locations',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from public.erp_locations r)
    );
  end if;
  if 'workshops' = any(want) and to_regclass('public.erp_workshops') is not null then
    out := out || jsonb_build_object(
      'workshops',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_workshops r)
    );
  end if;
  if 'venues' = any(want) and to_regclass('public.erp_venues') is not null then
    out := out || jsonb_build_object(
      'venues',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_venues r)
    );
  end if;
  if 'ingredientCategories' = any(want) and to_regclass('public.erp_ingredient_categories') is not null then
    out := out || jsonb_build_object(
      'ingredientCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_ingredient_categories r)
    );
  end if;
  if 'channels' = any(want) then
    out := out || jsonb_build_object(
      'channels',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_sales_channels r)
    );
  end if;
  if 'products' = any(want) then
    if to_regclass('public.erp_product_venues') is not null then
      out := out || jsonb_build_object(
        'products',
        (
          select coalesce(jsonb_agg(row_json order by name_en), '[]'::jsonb)
          from (
            select p.name_en, to_jsonb(p) || jsonb_build_object(
              'venue_prices',
              coalesce(
                (
                  select jsonb_agg(jsonb_build_object('venue_id', v.venue_id, 'visible', v.visible, 'sale_price', v.sale_price) order by v.venue_id)
                  from public.erp_product_venues v
                  where v.product_id = p.id
                ),
                '[]'::jsonb
              )
            ) as row_json
            from (select * from public.erp_products order by name_en limit 5000) p
          ) nested
        )
      );
    else
      out := out || jsonb_build_object(
        'products',
        (
          select coalesce(jsonb_agg(to_jsonb(p) order by p.name_en), '[]'::jsonb)
          from (select * from public.erp_products order by name_en limit 5000) p
        )
      );
    end if;
  end if;
  if 'packs' = any(want) then
    out := out || jsonb_build_object(
      'packs',
      (
        select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select * from public.erp_packs where archived_at is null limit 10000) p
      )
    );
  end if;
  if 'productPacks' = any(want) then
    out := out || jsonb_build_object(
      'productPacks',
      (
        select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select * from public.erp_product_packs where archived_at is null limit 10000) p
      )
    );
  end if;
  if 'stock' = any(want) then
    out := out || jsonb_build_object(
      'stock',
      (
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
        from (select * from public.erp_stock limit 20000) s
      )
    );
  end if;
  if 'writeoffReasons' = any(want) then
    out := out || jsonb_build_object(
      'writeoffReasons',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_writeoff_reasons r)
    );
  end if;
  if 'recipes' = any(want) then
    out := out || jsonb_build_object(
      'recipes',
      (
        select coalesce(jsonb_agg(row_json order by version), '[]'::jsonb)
        from (
          select rec.version, to_jsonb(rec) || jsonb_build_object(
            'lines',
            coalesce(
              (
                select jsonb_agg(to_jsonb(l) order by l.line_no)
                from public.erp_recipe_lines l
                where l.recipe_id = rec.id
              ),
              '[]'::jsonb
            )
          ) as row_json
          from public.erp_recipes rec
        ) nested
      )
    );
  end if;
  if 'dishes' = any(want) then
    if to_regclass('public.erp_dish_venues') is not null then
      out := out || jsonb_build_object(
        'dishes',
        (
          select coalesce(jsonb_agg(row_json order by name_en), '[]'::jsonb)
          from (
            select rec.name_en, to_jsonb(rec) || jsonb_build_object(
              'lines',
              coalesce(
                (
                  select jsonb_agg(to_jsonb(l) order by l.line_no)
                  from public.erp_dish_lines l
                  where l.dish_id = rec.id
                ),
                '[]'::jsonb
              ),
              'channel_prices',
              coalesce(
                (
                  select jsonb_agg(jsonb_build_object('channel_id', p.channel_id, 'sale_price', p.sale_price))
                  from public.erp_dish_channel_prices p
                  where p.dish_id = rec.id
                ),
                '[]'::jsonb
              ),
              'venue_prices',
              coalesce(
                (
                  select jsonb_agg(jsonb_build_object('venue_id', v.venue_id, 'visible', v.visible, 'sale_price', v.sale_price) order by v.venue_id)
                  from public.erp_dish_venues v
                  where v.dish_id = rec.id
                ),
                '[]'::jsonb
              )
            ) as row_json
            from public.erp_dishes rec
          ) nested
        )
      );
    else
      out := out || jsonb_build_object(
        'dishes',
        (
          select coalesce(jsonb_agg(row_json order by name_en), '[]'::jsonb)
          from (
            select rec.name_en, to_jsonb(rec) || jsonb_build_object(
              'lines',
              coalesce(
                (
                  select jsonb_agg(to_jsonb(l) order by l.line_no)
                  from public.erp_dish_lines l
                  where l.dish_id = rec.id
                ),
                '[]'::jsonb
              ),
              'channel_prices',
              coalesce(
                (
                  select jsonb_agg(jsonb_build_object('channel_id', p.channel_id, 'sale_price', p.sale_price))
                  from public.erp_dish_channel_prices p
                  where p.dish_id = rec.id
                ),
                '[]'::jsonb
              )
            ) as row_json
            from public.erp_dishes rec
          ) nested
        )
      );
    end if;
  end if;
  if 'costSources' = any(want) then
    out := out || jsonb_build_object(
      'costSources',
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id', q.product_id,
          'last_lot', q.last_lot,
          'fifo_remaining', q.fifo_remaining,
          'reference', q.reference
        ) order by q.product_id), '[]'::jsonb)
        from public.erp_product_cost_quotes(null) q
      )
    );
  end if;

  return out;
end;
$$;

do $$
declare
  r record;
begin
  for r in select table_name from information_schema.tables
           where table_schema = 'public' and table_name in ('erp_locations', 'erp_location_products')
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', r.table_name);
    execute format('grant all on public.%I to service_role', r.table_name);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_save_location', 'erp_delete_location', 'erp_delete_category',
             'erp_restore_category', 'erp_purge_deleted_categories', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
