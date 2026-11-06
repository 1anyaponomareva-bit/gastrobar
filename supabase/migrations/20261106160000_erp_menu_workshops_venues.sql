-- Menu: workshops, venues, ingredient categories, sellable-card fields.
-- Additive. No data deleted. Does not change FIFO consume, lots, or posted documents.
-- Does not add a 4th planned-cost source (Poster remaining-stock average = fifo_remaining).
-- Workshops ≠ venues ≠ warehouses. "Без цеха" is workshop_id IS NULL, not a row.

-- ---------------------------------------------------------------------------
-- Workshops (Цех приготовления). Seed = full Poster form list minus "Без цеха".
-- print_tickets: docs «Печатать бегунки». Default off (UI default not verified).
-- ---------------------------------------------------------------------------

create table if not exists public.erp_workshops (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  print_tickets boolean not null default false,
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create unique index if not exists erp_workshops_name_uidx
  on public.erp_workshops (lower(btrim(name))) where archived_at is null;

insert into public.erp_workshops (code, name, print_tickets, sort) values
  ('gastrobar', 'GASTROBAR', false, 0),
  ('gastrofood', 'GASTROFOOD', false, 1),
  ('gastrotruck-workshop', 'GASTROTRUCK WORKSHOP', false, 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Venues (Poster «Заведение» filter). Not erp_warehouses. Not workshops.
-- ---------------------------------------------------------------------------

create table if not exists public.erp_venues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_venues_name_uidx
  on public.erp_venues (lower(btrim(name))) where archived_at is null;

insert into public.erp_venues (code, name, sort) values
  ('gastrobar', 'GASTROBAR', 0),
  ('foodtruck', 'FOODTRUCK', 1),
  ('prep-kitchen', 'PREP KITCHEN', 2),
  ('online-kitchen', 'ONLINE KITCHEN', 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Ingredient categories (warehouse grouping). Not POS erp_categories.
-- No restore in Poster; ERP uses archived_at. Do not cascade-delete products.
-- ---------------------------------------------------------------------------

create table if not exists public.erp_ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name_en text not null check (length(btrim(name_en)) between 1 and 160),
  name_vn text not null default '',
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_ingredient_categories_name_uidx
  on public.erp_ingredient_categories (lower(btrim(name_en))) where archived_at is null;

-- POS category tree: docs allow «главный экран» or inside another category.
alter table public.erp_categories
  add column if not exists parent_id uuid references public.erp_categories (id);
alter table public.erp_categories drop constraint if exists erp_categories_parent_not_self;
alter table public.erp_categories
  add constraint erp_categories_parent_not_self check (parent_id is null or parent_id <> id);

insert into public.erp_categories (code, name_en, name_vn, sort)
select 'main-screen', 'Главный экран', '', coalesce((select min(sort) - 1 from public.erp_categories), 0)
where not exists (
  select 1 from public.erp_categories where lower(btrim(name_en)) = lower('Главный экран')
);

-- ---------------------------------------------------------------------------
-- Card fields confirmed on Poster forms. Existing rows: Без цеха / no barcode /
-- not weighted / discounts allowed / unknown sale price (null, never coerced to 0).
-- ---------------------------------------------------------------------------

alter table public.erp_products add column if not exists workshop_id uuid references public.erp_workshops (id);
alter table public.erp_products add column if not exists ingredient_category_id uuid references public.erp_ingredient_categories (id);
alter table public.erp_products add column if not exists sale_price numeric(18,4);
alter table public.erp_products add column if not exists vat_rate numeric(5,2);
alter table public.erp_products add column if not exists barcode text;
alter table public.erp_products add column if not exists is_weighted boolean;
alter table public.erp_products add column if not exists no_discounts boolean;
alter table public.erp_products alter column is_weighted set default false;
alter table public.erp_products alter column no_discounts set default false;
update public.erp_products set is_weighted = false where is_weighted is null;
update public.erp_products set no_discounts = false where no_discounts is null;
alter table public.erp_products alter column is_weighted set not null;
alter table public.erp_products alter column no_discounts set not null;
alter table public.erp_products drop constraint if exists erp_products_sale_price_check;
alter table public.erp_products add constraint erp_products_sale_price_check check (sale_price is null or sale_price >= 0);
alter table public.erp_products drop constraint if exists erp_products_vat_rate_check;
alter table public.erp_products add constraint erp_products_vat_rate_check check (vat_rate is null or vat_rate between 0 and 100);

alter table public.erp_dishes add column if not exists workshop_id uuid references public.erp_workshops (id);
alter table public.erp_dishes add column if not exists yield_qty numeric(18,6);
alter table public.erp_dishes add column if not exists barcode text;
alter table public.erp_dishes add column if not exists is_weighted boolean;
alter table public.erp_dishes add column if not exists no_discounts boolean;
alter table public.erp_dishes alter column is_weighted set default false;
alter table public.erp_dishes alter column no_discounts set default false;
update public.erp_dishes set is_weighted = false where is_weighted is null;
update public.erp_dishes set no_discounts = false where no_discounts is null;
alter table public.erp_dishes alter column is_weighted set not null;
alter table public.erp_dishes alter column no_discounts set not null;
alter table public.erp_dishes drop constraint if exists erp_dishes_yield_qty_check;
alter table public.erp_dishes add constraint erp_dishes_yield_qty_check check (yield_qty is null or yield_qty >= 0);

create index if not exists erp_products_workshop_idx on public.erp_products (workshop_id);
create index if not exists erp_products_ingredient_category_idx on public.erp_products (ingredient_category_id);
create index if not exists erp_dishes_workshop_idx on public.erp_dishes (workshop_id);

-- Per-venue show/price. Empty rows = visible at every venue (existing cards).
create table if not exists public.erp_dish_venues (
  dish_id uuid not null references public.erp_dishes (id) on delete cascade,
  venue_id uuid not null references public.erp_venues (id),
  visible boolean not null default true,
  sale_price numeric(18,4) check (sale_price is null or sale_price >= 0),
  primary key (dish_id, venue_id)
);
create index if not exists erp_dish_venues_venue_idx on public.erp_dish_venues (venue_id);

create table if not exists public.erp_product_venues (
  product_id uuid not null references public.erp_products (id) on delete cascade,
  venue_id uuid not null references public.erp_venues (id),
  visible boolean not null default true,
  sale_price numeric(18,4) check (sale_price is null or sale_price >= 0),
  primary key (product_id, venue_id)
);
create index if not exists erp_product_venues_venue_idx on public.erp_product_venues (venue_id);

-- ---------------------------------------------------------------------------
-- Saves. Keys absent on the payload leave the new columns / venue rows untouched
-- so older UI clients do not wipe Menu fields.
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_product(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_old public.erp_products;
  v_unit text := nullif(p->>'base_unit', '');
  v_pack jsonb;
  v_used boolean;
  v_staff jsonb := p->'staff';
  v_listed boolean;
  v_sup uuid;
  v_missing text[] := '{}';
  v_link uuid;
  v_catalog uuid;
  v_pack_unit text;
  v_workshop uuid;
  v_ing_cat uuid;
  v_venue jsonb;
begin
  if v_id is null then
    insert into public.erp_products (code, type, name_en, created_by)
    values (public.erp_unique_code('erp_products', p->>'name_en'), p->>'type', btrim(p->>'name_en'), p_actor)
    returning id into v_id;
    v_old := null;
  else
    select * into v_old from public.erp_products where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_old.base_unit is not null and v_unit is distinct from v_old.base_unit then
      select exists (select 1 from public.erp_lots where product_id = v_id)
          or exists (select 1 from public.erp_recipe_lines where product_id = v_id)
          or exists (select 1 from public.erp_dish_lines where product_id = v_id)
          or exists (select 1 from public.erp_recipes where product_id = v_id)
        into v_used;
      if v_used then perform public.erp_raise('ERP_UNIT_LOCKED', v_old.name_en); end if;
    end if;
  end if;

  if p ? 'workshop_id' then
    v_workshop := nullif(p->>'workshop_id', '')::uuid;
    if v_workshop is not null and not exists (select 1 from public.erp_workshops where id = v_workshop) then
      perform public.erp_raise('ERP_NOT_FOUND', 'workshop_id');
    end if;
  end if;
  if p ? 'ingredient_category_id' then
    v_ing_cat := nullif(p->>'ingredient_category_id', '')::uuid;
    if v_ing_cat is not null and not exists (select 1 from public.erp_ingredient_categories where id = v_ing_cat) then
      perform public.erp_raise('ERP_NOT_FOUND', 'ingredient_category_id');
    end if;
  end if;

  update public.erp_products set
    type = coalesce(nullif(p->>'type', ''), type),
    name_en = btrim(p->>'name_en'),
    name_vn = coalesce(btrim(p->>'name_vn'), ''),
    category_id = nullif(p->>'category_id', '')::uuid,
    base_unit = v_unit,
    unit_weight_kg = nullif(p->>'unit_weight_kg', '')::numeric,
    brand = nullif(btrim(p->>'brand'), ''),
    est_unit_cost = case when p ? 'est_unit_cost' then nullif(p->>'est_unit_cost', '')::numeric else est_unit_cost end,
    est_cost_source = case when p ? 'est_unit_cost'
                             and nullif(p->>'est_unit_cost', '')::numeric is distinct from v_old.est_unit_cost
                           then case when nullif(p->>'est_unit_cost', '') is null then null else 'manual' end
                           else est_cost_source end,
    est_cost_at = case when p ? 'est_unit_cost'
                         and nullif(p->>'est_unit_cost', '')::numeric is distinct from v_old.est_unit_cost
                       then now() else est_cost_at end,
    shelf_life_days = nullif(p->>'shelf_life_days', '')::integer,
    storage_conditions = nullif(btrim(p->>'storage_conditions'), ''),
    loss_clean_pct = case when p ? 'loss_clean_pct' then nullif(p->>'loss_clean_pct', '')::numeric else loss_clean_pct end,
    loss_boil_pct = case when p ? 'loss_boil_pct' then nullif(p->>'loss_boil_pct', '')::numeric else loss_boil_pct end,
    loss_fry_pct = case when p ? 'loss_fry_pct' then nullif(p->>'loss_fry_pct', '')::numeric else loss_fry_pct end,
    loss_stew_pct = case when p ? 'loss_stew_pct' then nullif(p->>'loss_stew_pct', '')::numeric else loss_stew_pct end,
    loss_bake_pct = case when p ? 'loss_bake_pct' then nullif(p->>'loss_bake_pct', '')::numeric else loss_bake_pct end,
    workshop_id = case when p ? 'workshop_id' then v_workshop else workshop_id end,
    ingredient_category_id = case when p ? 'ingredient_category_id' then v_ing_cat else ingredient_category_id end,
    sale_price = case when p ? 'sale_price' then nullif(p->>'sale_price', '')::numeric else sale_price end,
    vat_rate = case when p ? 'vat_rate' then nullif(p->>'vat_rate', '')::numeric else vat_rate end,
    barcode = case when p ? 'barcode' then nullif(btrim(p->>'barcode'), '') else barcode end,
    is_weighted = case when p ? 'is_weighted' then coalesce(nullif(p->>'is_weighted', '')::boolean, false) else is_weighted end,
    no_discounts = case when p ? 'no_discounts' then coalesce(nullif(p->>'no_discounts', '')::boolean, false) else no_discounts end,
    updated_by = p_actor
  where id = v_id;

  if p ? 'packs' then
    update public.erp_product_packs set archived_at = now()
    where product_id = v_id and archived_at is null
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p->'packs') x where nullif(x->>'id', '') is not null);
    for v_pack in select * from jsonb_array_elements(p->'packs')
    loop
      v_link := nullif(v_pack->>'id', '')::uuid;
      v_catalog := public.erp_canonical_pack_id(nullif(v_pack->>'pack_id', '')::uuid);
      if v_catalog is not null then
        select unit into v_pack_unit from public.erp_packs where id = v_catalog and archived_at is null;
        if v_pack_unit is null then perform public.erp_raise('ERP_NOT_FOUND', 'pack'); end if;
        if v_unit is not null and v_pack_unit is distinct from v_unit then perform public.erp_raise('ERP_PACK_UNIT'); end if;
      end if;
      if v_link is null then
        insert into public.erp_product_packs (product_id, pack_id, supplier_id, label, qty_base, is_default)
        values (
          v_id,
          v_catalog,
          nullif(v_pack->>'supplier_id', '')::uuid,
          btrim(coalesce(v_pack->>'label', v_pack->>'name', '')),
          coalesce(nullif(v_pack->>'qty_base', '')::numeric, 0),
          coalesce((v_pack->>'is_default')::boolean, false)
        );
      else
        update public.erp_product_packs set
          supplier_id = nullif(v_pack->>'supplier_id', '')::uuid,
          is_default = coalesce((v_pack->>'is_default')::boolean, false),
          pack_id = coalesce(v_catalog, pack_id)
        where id = v_link and product_id = v_id;
        update public.erp_product_packs k
        set label = pck.name, qty_base = pck.qty_base
        from public.erp_packs pck
        where k.id = v_link and k.pack_id = pck.id;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_staff) = 'object' then
    v_listed := coalesce((v_staff->>'listed')::boolean, false);
    v_sup := nullif(v_staff->>'supplier_id', '')::uuid;
    if v_listed then
      if (select category_id from public.erp_products where id = v_id) is null then v_missing := array_append(v_missing, 'category'); end if;
      if v_sup is null or not exists (select 1 from public.erp_suppliers where id = v_sup and archived_at is null) then
        v_missing := array_append(v_missing, 'supplier');
      end if;
      if nullif(btrim(v_staff->>'unit'), '') is null then v_missing := array_append(v_missing, 'unit'); end if;
      if cardinality(v_missing) > 0 then perform public.erp_raise('ERP_STAFF_INCOMPLETE', array_to_string(v_missing, ',')); end if;
    end if;
    update public.erp_products set
      staff_listed = v_listed,
      staff_supplier_id = v_sup,
      staff_unit = nullif(btrim(v_staff->>'unit'), ''),
      staff_pack = nullif(btrim(v_staff->>'pack'), ''),
      staff_item_no = nullif(btrim(v_staff->>'item_no'), ''),
      staff_hidden = coalesce((v_staff->>'hidden')::boolean, false),
      staff_sort = case when v_listed and not coalesce(v_old.staff_listed, false)
                        then coalesce((select max(staff_sort) + 1 from public.erp_products), 0) else staff_sort end
    where id = v_id;
  end if;

  if p ? 'venues' then
    delete from public.erp_product_venues where product_id = v_id;
    for v_venue in select * from jsonb_array_elements(coalesce(p->'venues', '[]'::jsonb))
    loop
      insert into public.erp_product_venues (product_id, venue_id, visible, sale_price)
      values (
        v_id,
        (v_venue->>'venue_id')::uuid,
        coalesce(nullif(v_venue->>'visible', '')::boolean, true),
        nullif(v_venue->>'sale_price', '')::numeric
      );
    end loop;
  end if;

  perform public.erp_audit(p_actor, 'product', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

create or replace function public.erp_save_dish(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_line jsonb;
  v_price jsonb;
  v_venue jsonb;
  v_i integer := 0;
  v_workshop uuid;
begin
  if v_id is null then
    insert into public.erp_dishes (code, name_en, created_by)
    values (public.erp_unique_code('erp_dishes', p->>'name_en'), btrim(p->>'name_en'), p_actor)
    returning id into v_id;
  elsif not exists (select 1 from public.erp_dishes where id = v_id) then
    perform public.erp_raise('ERP_NOT_FOUND');
  end if;

  if p ? 'workshop_id' then
    v_workshop := nullif(p->>'workshop_id', '')::uuid;
    if v_workshop is not null and not exists (select 1 from public.erp_workshops where id = v_workshop) then
      perform public.erp_raise('ERP_NOT_FOUND', 'workshop_id');
    end if;
  end if;

  update public.erp_dishes set
    name_en = btrim(p->>'name_en'),
    name_vn = coalesce(btrim(p->>'name_vn'), ''),
    category_id = nullif(p->>'category_id', '')::uuid,
    sale_price = nullif(p->>'sale_price', '')::numeric,
    vat_rate = nullif(p->>'vat_rate', '')::numeric,
    note = nullif(btrim(p->>'note'), ''),
    workshop_id = case when p ? 'workshop_id' then v_workshop else workshop_id end,
    yield_qty = case when p ? 'yield_qty' then nullif(p->>'yield_qty', '')::numeric else yield_qty end,
    barcode = case when p ? 'barcode' then nullif(btrim(p->>'barcode'), '') else barcode end,
    is_weighted = case when p ? 'is_weighted' then coalesce(nullif(p->>'is_weighted', '')::boolean, false) else is_weighted end,
    no_discounts = case when p ? 'no_discounts' then coalesce(nullif(p->>'no_discounts', '')::boolean, false) else no_discounts end,
    updated_by = p_actor
  where id = v_id;

  delete from public.erp_dish_lines where dish_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    perform public.erp_check_product((v_line->>'product_id')::uuid);
    insert into public.erp_dish_lines (dish_id, line_no, product_id, qty, note, methods, net_qty)
    values (v_id, v_i, (v_line->>'product_id')::uuid, (v_line->>'qty')::numeric, nullif(btrim(v_line->>'note'), ''),
            public.erp_line_methods(v_line->'methods'), nullif(v_line->>'net_qty', '')::numeric);
  end loop;

  delete from public.erp_dish_channel_prices where dish_id = v_id;
  for v_price in select * from jsonb_array_elements(coalesce(p->'channel_prices', '[]'::jsonb))
  loop
    if nullif(v_price->>'sale_price', '') is not null then
      insert into public.erp_dish_channel_prices (dish_id, channel_id, sale_price)
      values (v_id, (v_price->>'channel_id')::uuid, (v_price->>'sale_price')::numeric);
    end if;
  end loop;

  if p ? 'venues' then
    delete from public.erp_dish_venues where dish_id = v_id;
    for v_venue in select * from jsonb_array_elements(coalesce(p->'venues', '[]'::jsonb))
    loop
      insert into public.erp_dish_venues (dish_id, venue_id, visible, sale_price)
      values (
        v_id,
        (v_venue->>'venue_id')::uuid,
        coalesce(nullif(v_venue->>'visible', '')::boolean, true),
        nullif(v_venue->>'sale_price', '')::numeric
      );
    end loop;
  end if;

  perform public.erp_audit(p_actor, 'dish', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_save_ref(p_entity text, p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', p->>'name_en', ''));
  v_table text;
  v_parent uuid;
begin
  v_table := case p_entity
    when 'category' then 'erp_categories'
    when 'supplier' then 'erp_suppliers'
    when 'warehouse' then 'erp_warehouses'
    when 'channel' then 'erp_sales_channels'
    when 'workshop' then 'erp_workshops'
    when 'ingredient_category' then 'erp_ingredient_categories'
  end;
  if v_table is null then perform public.erp_raise('ERP_INVALID', 'entity'); end if;
  if v_name = '' then perform public.erp_raise('ERP_INVALID', 'name'); end if;

  if p_entity = 'category' then
    v_parent := case when p ? 'parent_id' then nullif(p->>'parent_id', '')::uuid else null end;
    if v_parent is not null and (v_parent = v_id or not exists (select 1 from public.erp_categories where id = v_parent)) then
      perform public.erp_raise('ERP_INVALID', 'parent_id');
    end if;
    if v_id is null then
      insert into public.erp_categories (code, name_en, name_vn, sort, parent_id)
      values (public.erp_unique_code('erp_categories', v_name), v_name, coalesce(btrim(p->>'name_vn'), ''),
              coalesce((select max(sort) + 1 from public.erp_categories), 0), v_parent)
      returning id into v_id;
    else
      update public.erp_categories set
        name_en = v_name,
        name_vn = coalesce(btrim(p->>'name_vn'), ''),
        parent_id = case when p ? 'parent_id' then v_parent else parent_id end
      where id = v_id;
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
      insert into public.erp_warehouses (code, name, kind, sort)
      values (public.erp_unique_code('erp_warehouses', v_name), v_name, coalesce(nullif(p->>'kind', ''), 'other'),
              coalesce((select max(sort) + 1 from public.erp_warehouses), 0))
      returning id into v_id;
    else
      update public.erp_warehouses set name = v_name, kind = coalesce(nullif(p->>'kind', ''), kind) where id = v_id;
    end if;
  elsif p_entity = 'workshop' then
    if v_id is null then
      insert into public.erp_workshops (code, name, print_tickets, sort, created_by)
      values (
        public.erp_unique_code('erp_workshops', v_name),
        v_name,
        coalesce(nullif(p->>'print_tickets', '')::boolean, false),
        coalesce((select max(sort) + 1 from public.erp_workshops), 0),
        p_actor
      )
      returning id into v_id;
    else
      update public.erp_workshops set
        name = v_name,
        print_tickets = case when p ? 'print_tickets' then coalesce(nullif(p->>'print_tickets', '')::boolean, print_tickets) else print_tickets end,
        updated_by = p_actor,
        updated_at = now()
      where id = v_id;
    end if;
  elsif p_entity = 'ingredient_category' then
    if v_id is null then
      insert into public.erp_ingredient_categories (code, name_en, name_vn, sort)
      values (
        public.erp_unique_code('erp_ingredient_categories', v_name),
        v_name,
        coalesce(btrim(p->>'name_vn'), ''),
        coalesce((select max(sort) + 1 from public.erp_ingredient_categories), 0)
      )
      returning id into v_id;
    else
      update public.erp_ingredient_categories set
        name_en = v_name,
        name_vn = coalesce(btrim(p->>'name_vn'), ''),
        updated_at = now()
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

create or replace function public.erp_set_archived(p_entity text, p_id uuid, p_archived boolean, p_actor text)
returns void
language plpgsql
as $$
declare
  v_table text;
begin
  v_table := case p_entity
    when 'product' then 'erp_products' when 'category' then 'erp_categories' when 'supplier' then 'erp_suppliers'
    when 'warehouse' then 'erp_warehouses' when 'channel' then 'erp_sales_channels' when 'dish' then 'erp_dishes'
    when 'pack' then 'erp_packs' when 'workshop' then 'erp_workshops'
    when 'ingredient_category' then 'erp_ingredient_categories'
  end;
  if v_table is null then perform public.erp_raise('ERP_INVALID', 'entity'); end if;
  if p_archived and p_entity = 'product'
     and exists (select 1 from public.erp_lots where product_id = p_id and qty_left > 0) then
    perform public.erp_raise('ERP_HAS_STOCK');
  end if;
  if p_archived and p_entity = 'warehouse'
     and exists (select 1 from public.erp_lots where warehouse_id = p_id and qty_left > 0) then
    perform public.erp_raise('ERP_HAS_STOCK');
  end if;
  execute format('update public.%I set archived_at = case when $1 then coalesce(archived_at, now()) else null end where id = $2',
                 v_table) using p_archived, p_id;
  if p_entity = 'pack' and p_archived then
    update public.erp_product_packs set archived_at = coalesce(archived_at, now())
    where pack_id = p_id and archived_at is null;
  end if;
  perform public.erp_audit(p_actor, p_entity, p_id, case when p_archived then 'archive' else 'restore' end);
end;
$$;

create or replace function public.erp_snapshot_card(p_entity text, p_id uuid, p_actor text, p_action text)
returns void
language plpgsql
as $$
declare
  v jsonb;
begin
  if p_id is null or p_entity not in ('product', 'recipe', 'dish') then return; end if;
  if p_entity = 'product' then
    select to_jsonb(p) || jsonb_build_object(
      'venue_prices',
      coalesce((
        select jsonb_agg(jsonb_build_object('venue_id', v.venue_id, 'visible', v.visible, 'sale_price', v.sale_price) order by v.venue_id)
        from public.erp_product_venues v where v.product_id = p.id
      ), '[]'::jsonb)
    ) into v
    from public.erp_products p where p.id = p_id;
  elsif p_entity = 'recipe' then
    select to_jsonb(r) || jsonb_build_object(
      'lines',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.erp_recipe_lines l where l.recipe_id = r.id), '[]'::jsonb)
    ) into v
    from public.erp_recipes r
    where r.id = p_id;
  else
    select to_jsonb(d) || jsonb_build_object(
      'lines',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.erp_dish_lines l where l.dish_id = d.id), '[]'::jsonb),
      'channel_prices',
      coalesce((select jsonb_agg(jsonb_build_object('channel_id', p.channel_id, 'sale_price', p.sale_price)) from public.erp_dish_channel_prices p where p.dish_id = d.id), '[]'::jsonb),
      'venue_prices',
      coalesce((
        select jsonb_agg(jsonb_build_object('venue_id', v.venue_id, 'visible', v.visible, 'sale_price', v.sale_price) order by v.venue_id)
        from public.erp_dish_venues v where v.dish_id = d.id
      ), '[]'::jsonb)
    ) into v
    from public.erp_dishes d
    where d.id = p_id;
  end if;
  if v is null then return; end if;
  insert into public.erp_card_revisions (entity, entity_id, saved_by, action, snapshot)
  values (p_entity, p_id, p_actor, p_action, v);
end;
$$;

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
      'settings', 'categories', 'ingredientCategories', 'suppliers', 'warehouses', 'workshops', 'venues',
      'channels', 'products', 'packs', 'productPacks', 'stock', 'recipes', 'dishes', 'writeoffReasons', 'costSources'
    ];
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
  if 'ingredientCategories' = any(want) then
    out := out || jsonb_build_object(
      'ingredientCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_ingredient_categories r)
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
  if 'workshops' = any(want) then
    out := out || jsonb_build_object(
      'workshops',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_workshops r)
    );
  end if;
  if 'venues' = any(want) then
    out := out || jsonb_build_object(
      'venues',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_venues r)
    );
  end if;
  if 'channels' = any(want) then
    out := out || jsonb_build_object(
      'channels',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_sales_channels r)
    );
  end if;
  if 'products' = any(want) then
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
           where table_schema = 'public' and table_name in (
             'erp_workshops', 'erp_venues', 'erp_ingredient_categories', 'erp_dish_venues', 'erp_product_venues'
           )
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', r.table_name);
    execute format('grant all on public.%I to service_role', r.table_name);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_save_product', 'erp_save_dish', 'erp_save_ref', 'erp_set_archived',
             'erp_snapshot_card', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
