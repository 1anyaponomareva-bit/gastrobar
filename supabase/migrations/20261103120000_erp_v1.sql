-- GASTROFOOD ERP v1: unified catalog, warehouses, stock documents with lots,
-- semi-finished recipes, production batches, menu dishes with costing.
-- Access only from the Next.js server (service_role). anon/authenticated get nothing.
-- Quantities are stored in the product base unit (kg, l, pcs); money in VND.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.erp_settings (
  id smallint primary key default 1 check (id = 1),
  input_vat_enabled boolean not null default false,
  output_vat_enabled boolean not null default false,
  default_input_vat_rate numeric(5,2) check (default_input_vat_rate between 0 and 100),
  default_output_vat_rate numeric(5,2) check (default_output_vat_rate between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.erp_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists public.erp_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name_en text not null check (length(btrim(name_en)) between 1 and 160),
  name_vn text not null default '',
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_categories_name_uidx
  on public.erp_categories (lower(btrim(name_en))) where archived_at is null;

create table if not exists public.erp_suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  zalo_url text check (zalo_url is null or zalo_url ~ '^https://'),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_suppliers_name_uidx
  on public.erp_suppliers (lower(btrim(name))) where archived_at is null;

create table if not exists public.erp_warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('warehouse', 'prep_kitchen', 'online_kitchen', 'food_truck', 'other')),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_warehouses_name_uidx
  on public.erp_warehouses (lower(btrim(name))) where archived_at is null;

insert into public.erp_warehouses (code, name, kind, sort) values
  ('warehouse', 'Warehouse / Kho', 'warehouse', 0),
  ('prep-kitchen', 'Prep Kitchen / Bếp sơ chế', 'prep_kitchen', 1),
  ('online-kitchen', 'Online Kitchen / Bếp online', 'online_kitchen', 2),
  ('food-truck', 'Food Truck / Xe bán đồ ăn', 'food_truck', 3)
on conflict (code) do nothing;

create table if not exists public.erp_sales_channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  -- Share of the sale price kept by the platform; null = not set yet (calculation is incomplete).
  commission_pct numeric(5,2) check (commission_pct between 0 and 100),
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.erp_sales_channels (code, name, commission_pct, sort) values
  ('direct', 'Direct / Bán trực tiếp', 0, 0),
  ('grab-food', 'Grab Food', null, 1),
  ('shopee-food', 'Shopee Food', null, 2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.erp_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  type text not null check (type in ('ingredient', 'semi_finished', 'finished', 'packaging', 'consumable')),
  name_en text not null check (length(btrim(name_en)) between 1 and 200),
  name_vn text not null default '',
  category_id uuid references public.erp_categories (id),
  -- Null until confirmed: such products cannot be used in documents, recipes or dishes.
  base_unit text check (base_unit in ('kg', 'l', 'pcs')),
  unit_weight_kg numeric(14,4) check (unit_weight_kg > 0),
  brand text,
  -- Current estimated cost per base unit (set by the last posted receipt or manually).
  est_unit_cost numeric(18,6) check (est_unit_cost >= 0),
  est_cost_source text check (est_cost_source in ('receipt', 'manual')),
  est_cost_at timestamptz,
  shelf_life_days integer check (shelf_life_days > 0),
  storage_conditions text,
  -- Staff order list fields.
  staff_listed boolean not null default false,
  staff_unit text,
  staff_pack text,
  staff_supplier_id uuid references public.erp_suppliers (id),
  staff_item_no text,
  staff_hidden boolean not null default false,
  staff_sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create unique index if not exists erp_products_name_uidx
  on public.erp_products (lower(btrim(name_en)), lower(coalesce(btrim(brand), '')), type)
  where archived_at is null;

create table if not exists public.erp_product_packs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.erp_products (id) on delete cascade,
  supplier_id uuid references public.erp_suppliers (id),
  label text not null check (length(btrim(label)) between 1 and 80),
  qty_base numeric(18,6) not null check (qty_base > 0),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists erp_product_packs_uidx
  on public.erp_product_packs (product_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(label)))
  where archived_at is null;

-- Old id -> new id, so imports can be repeated without duplicates.
create table if not exists public.erp_legacy_map (
  source text not null,
  entity text not null,
  legacy_id text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (source, entity, legacy_id)
);

create table if not exists public.erp_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text,
  entity text not null,
  entity_id uuid,
  action text not null,
  reason text,
  data jsonb
);
create index if not exists erp_audit_log_entity_idx on public.erp_audit_log (entity, entity_id, at desc);

-- ---------------------------------------------------------------------------
-- Semi-finished recipes (versioned)
-- ---------------------------------------------------------------------------

create table if not exists public.erp_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.erp_products (id),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  yield_qty numeric(18,6) check (yield_qty > 0),
  yield_pieces integer check (yield_pieces > 0),
  instructions jsonb not null default '[]'::jsonb,
  shelf_life_days integer check (shelf_life_days > 0),
  storage_conditions text,
  note text,
  legacy_recipe_id text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by text,
  unique (product_id, version)
);
create unique index if not exists erp_recipes_one_active_uidx
  on public.erp_recipes (product_id) where status = 'active';

create table if not exists public.erp_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.erp_recipes (id) on delete cascade,
  line_no integer not null default 0,
  -- Null while the imported ingredient waits for review.
  product_id uuid references public.erp_products (id),
  qty numeric(18,6) check (qty > 0),
  note text,
  raw_name jsonb,
  raw_amount numeric(18,6),
  raw_unit text
);
create index if not exists erp_recipe_lines_recipe_idx on public.erp_recipe_lines (recipe_id, line_no);

-- ---------------------------------------------------------------------------
-- Stock documents, lots and the movement ledger
-- ---------------------------------------------------------------------------

create sequence if not exists public.erp_document_no_seq;

create table if not exists public.erp_documents (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  doc_type text not null check (doc_type in ('opening', 'receipt', 'transfer', 'writeoff', 'count', 'production')),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  doc_date date not null default current_date,
  warehouse_id uuid references public.erp_warehouses (id),
  target_warehouse_id uuid references public.erp_warehouses (id),
  supplier_id uuid references public.erp_suppliers (id),
  reason text,
  comment text,
  prices_include_vat boolean not null default false,
  -- Production
  recipe_id uuid references public.erp_recipes (id),
  output_product_id uuid references public.erp_products (id),
  plan_output_qty numeric(18,6) check (plan_output_qty > 0),
  output_qty numeric(18,6) check (output_qty > 0),
  output_pieces integer check (output_pieces > 0),
  output_weight_kg numeric(18,6) check (output_weight_kg > 0),
  batch_no text,
  expires_at date,
  responsible text,
  -- Filled on posting
  total_cost numeric(18,4),
  cost_known boolean,
  output_unit_cost numeric(18,6),
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  posted_at timestamptz,
  posted_by text,
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text
);
create index if not exists erp_documents_type_idx on public.erp_documents (doc_type, doc_date desc);

create table if not exists public.erp_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.erp_documents (id) on delete cascade,
  line_no integer not null default 0,
  product_id uuid not null references public.erp_products (id),
  -- Base units. Receipt: accepted qty. Count: counted qty. Production: actual consumption.
  qty numeric(18,6) not null check (qty >= 0),
  planned_qty numeric(18,6),
  pack_id uuid references public.erp_product_packs (id),
  pack_qty numeric(18,6),
  -- Receipt/opening: entered price per base unit (gross or net per document flag).
  unit_price numeric(18,6) check (unit_price >= 0),
  vat_rate numeric(5,2) check (vat_rate between 0 and 100),
  batch_no text,
  expires_at date,
  reason text,
  -- Filled on posting
  net_amount numeric(18,4),
  vat_amount numeric(18,4),
  gross_amount numeric(18,4),
  system_qty numeric(18,6),
  diff_qty numeric(18,6),
  cost_amount numeric(18,4),
  unit_cost numeric(18,6),
  cost_known boolean
);
create index if not exists erp_document_lines_doc_idx on public.erp_document_lines (document_id, line_no);

create table if not exists public.erp_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.erp_products (id),
  warehouse_id uuid not null references public.erp_warehouses (id),
  -- First lot in the chain (receipt or production) when this lot came by transfer.
  origin_lot_id uuid references public.erp_lots (id),
  source_document_id uuid not null references public.erp_documents (id),
  source_line_id uuid references public.erp_document_lines (id),
  batch_no text,
  received_at timestamptz not null,
  expires_at date,
  -- Null = cost unknown; never treated as zero.
  unit_cost numeric(18,6) check (unit_cost >= 0),
  qty_in numeric(18,6) not null check (qty_in > 0),
  qty_left numeric(18,6) not null check (qty_left >= 0),
  created_at timestamptz not null default now(),
  check (qty_left <= qty_in)
);
create index if not exists erp_lots_stock_idx on public.erp_lots (product_id, warehouse_id, received_at) where qty_left > 0;
create index if not exists erp_lots_source_idx on public.erp_lots (source_document_id);

create table if not exists public.erp_movements (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.erp_documents (id),
  line_id uuid references public.erp_document_lines (id),
  lot_id uuid not null references public.erp_lots (id),
  product_id uuid not null references public.erp_products (id),
  warehouse_id uuid not null references public.erp_warehouses (id),
  qty numeric(18,6) not null check (qty <> 0),
  unit_cost numeric(18,6),
  amount numeric(18,4),
  reversal_of bigint references public.erp_movements (id),
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists erp_movements_doc_idx on public.erp_movements (document_id);
create index if not exists erp_movements_lot_idx on public.erp_movements (lot_id);

-- ---------------------------------------------------------------------------
-- Menu dishes
-- ---------------------------------------------------------------------------

create table if not exists public.erp_dishes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name_en text not null check (length(btrim(name_en)) between 1 and 200),
  name_vn text not null default '',
  category_id uuid references public.erp_categories (id),
  -- Menu price as shown to the guest (includes output VAT when output VAT is enabled).
  sale_price numeric(18,4) check (sale_price >= 0),
  vat_rate numeric(5,2) check (vat_rate between 0 and 100),
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists erp_dishes_name_uidx
  on public.erp_dishes (lower(btrim(name_en))) where archived_at is null;

create table if not exists public.erp_dish_lines (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references public.erp_dishes (id) on delete cascade,
  line_no integer not null default 0,
  product_id uuid not null references public.erp_products (id),
  qty numeric(18,6) not null check (qty > 0),
  note text
);
create index if not exists erp_dish_lines_dish_idx on public.erp_dish_lines (dish_id, line_no);

create table if not exists public.erp_dish_channel_prices (
  dish_id uuid not null references public.erp_dishes (id) on delete cascade,
  channel_id uuid not null references public.erp_sales_channels (id),
  sale_price numeric(18,4) not null check (sale_price >= 0),
  primary key (dish_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- Butchering profiles (schema only; UI and posting come later)
-- One source product -> several useful outputs + waste. Weight yield and cost
-- share are independent. Posted batches will snapshot the shares they used.
-- ---------------------------------------------------------------------------

create table if not exists public.erp_split_profiles (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.erp_products (id),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  activated_at timestamptz,
  unique (source_product_id, version)
);
create unique index if not exists erp_split_profiles_one_active_uidx
  on public.erp_split_profiles (source_product_id) where status = 'active';

create table if not exists public.erp_split_outputs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.erp_split_profiles (id) on delete cascade,
  product_id uuid references public.erp_products (id),
  is_waste boolean not null default false,
  expected_yield_pct numeric(6,3) check (expected_yield_pct between 0 and 100),
  cost_share_pct numeric(6,3) not null default 0 check (cost_share_pct between 0 and 100),
  check (is_waste or product_id is not null),
  check (not is_waste or cost_share_pct = 0)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.erp_raise(p_code text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  raise exception using message = p_code, detail = coalesce(p_detail, '');
end;
$$;

create or replace function public.erp_audit(
  p_actor text, p_entity text, p_entity_id uuid, p_action text, p_reason text default null, p_data jsonb default null
)
returns void
language sql
as $$
  insert into public.erp_audit_log (actor, entity, entity_id, action, reason, data)
  values (p_actor, p_entity, p_entity_id, p_action, p_reason, p_data);
$$;

create or replace function public.erp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['erp_categories', 'erp_suppliers', 'erp_warehouses', 'erp_sales_channels',
                           'erp_products', 'erp_recipes', 'erp_documents', 'erp_dishes']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.erp_touch_updated_at()',
                   t || '_touch', t);
  end loop;
end;
$$;

-- Converts an amount in g/kg/ml/l/pcs to the base unit; null when incompatible.
create or replace function public.erp_to_base(p_amount numeric, p_unit text, p_base text)
returns numeric
language sql
immutable
as $$
  select case
    when p_amount is null or p_base is null then null
    when lower(p_unit) = p_base then p_amount
    when p_base = 'kg' and lower(p_unit) = 'g' then p_amount / 1000
    when p_base = 'l' and lower(p_unit) = 'ml' then p_amount / 1000
    when p_base = 'pcs' and lower(p_unit) in ('pc', 'pcs', 'piece', 'pieces') then p_amount
    else null
  end;
$$;

-- "5 kg" -> (kg, 5); "10*1040 g" -> (kg, 10.4); "10 000 pcs" -> (pcs, 10000).
-- Ranges ("13-15 kg"), empty or unknown text return no row: they go to review.
create or replace function public.erp_parse_pack(p_pack text)
returns table (base_unit text, qty numeric)
language plpgsql
immutable
as $$
declare
  s text;
  m text[];
  amount numeric;
  unit text;
begin
  if p_pack is null then return; end if;
  s := lower(btrim(p_pack));
  s := regexp_replace(s, '(\d)\s+(?=\d)', '\1', 'g');
  s := replace(s, ',', '.');
  m := regexp_match(s, '^(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs)$');
  if m is not null then
    amount := m[1]::numeric * m[2]::numeric;
    unit := m[3];
  else
    m := regexp_match(s, '^(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs)$');
    if m is null then return; end if;
    amount := m[1]::numeric;
    unit := m[2];
  end if;
  if amount <= 0 then return; end if;
  base_unit := case unit when 'g' then 'kg' when 'ml' then 'l' else unit end;
  qty := case when unit in ('g', 'ml') then amount / 1000 else amount end;
  return next;
end;
$$;

-- Movements are an immutable ledger; corrections are reversal rows.
create or replace function public.erp_movements_immutable()
returns trigger
language plpgsql
as $$
begin
  perform public.erp_raise('ERP_LEDGER_IMMUTABLE');
  return null;
end;
$$;

drop trigger if exists erp_movements_no_update on public.erp_movements;
create trigger erp_movements_no_update
  before update or delete on public.erp_movements
  for each row execute function public.erp_movements_immutable();

-- Posted and cancelled documents cannot be edited; posted ones can only be cancelled.
create or replace function public.erp_documents_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', old.doc_no); end if;
    return old;
  end if;
  if old.status = 'cancelled' or (old.status = 'posted' and new.status <> 'cancelled') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', old.doc_no);
  end if;
  return new;
end;
$$;

drop trigger if exists erp_documents_guard on public.erp_documents;
create trigger erp_documents_guard
  before update or delete on public.erp_documents
  for each row execute function public.erp_documents_guard();

create or replace function public.erp_document_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.erp_documents
  where id = coalesce(new.document_id, old.document_id);
  if v_status is not null and v_status <> 'draft' then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_document_lines_guard on public.erp_document_lines;
create trigger erp_document_lines_guard
  before insert or update or delete on public.erp_document_lines
  for each row execute function public.erp_document_lines_guard();

-- ---------------------------------------------------------------------------
-- Recipe cycle protection
-- ---------------------------------------------------------------------------

create or replace function public.erp_recipe_has_cycle(p_product uuid, p_component uuid)
returns boolean
language sql
stable
as $$
  with recursive walk (product_id, depth) as (
    select p_component, 0
    union
    select l.product_id, w.depth + 1
    from walk w
    join public.erp_recipes r on r.product_id = w.product_id and r.status <> 'archived'
    join public.erp_recipe_lines l on l.recipe_id = r.id
    where l.product_id is not null and w.depth < 50
  )
  select exists (select 1 from walk where product_id = p_product);
$$;

create or replace function public.erp_recipe_lines_cycle_guard()
returns trigger
language plpgsql
as $$
declare
  v_product uuid;
begin
  if new.product_id is null then return new; end if;
  select product_id into v_product from public.erp_recipes where id = new.recipe_id;
  if public.erp_recipe_has_cycle(v_product, new.product_id) then
    perform public.erp_raise('ERP_RECIPE_CYCLE', new.product_id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists erp_recipe_lines_cycle on public.erp_recipe_lines;
create trigger erp_recipe_lines_cycle
  before insert or update on public.erp_recipe_lines
  for each row execute function public.erp_recipe_lines_cycle_guard();

-- Only draft recipes can change; active/archived versions stay as history.
create or replace function public.erp_recipe_lines_lock_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.erp_recipes where id = coalesce(new.recipe_id, old.recipe_id);
  if v_status is not null and v_status <> 'draft' then
    perform public.erp_raise('ERP_RECIPE_LOCKED');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_recipe_lines_lock on public.erp_recipe_lines;
create trigger erp_recipe_lines_lock
  before insert or update or delete on public.erp_recipe_lines
  for each row execute function public.erp_recipe_lines_lock_guard();

-- ---------------------------------------------------------------------------
-- Stock view
-- ---------------------------------------------------------------------------

create or replace view public.erp_stock
with (security_invoker = true)
as
select
  l.product_id,
  l.warehouse_id,
  sum(l.qty_left) as qty,
  sum(l.qty_left * l.unit_cost) filter (where l.unit_cost is not null) as known_value,
  bool_and(l.unit_cost is not null) as cost_known,
  min(l.expires_at) as nearest_expiry
from public.erp_lots l
where l.qty_left > 0
group by l.product_id, l.warehouse_id;

-- ---------------------------------------------------------------------------
-- Lot primitives (called only inside posting functions)
-- ---------------------------------------------------------------------------

create or replace function public.erp_receive_lot(
  p_doc uuid, p_line uuid, p_product uuid, p_warehouse uuid, p_qty numeric, p_unit_cost numeric,
  p_batch text, p_expires date, p_received_at timestamptz, p_origin uuid, p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_lot uuid;
begin
  insert into public.erp_lots (product_id, warehouse_id, origin_lot_id, source_document_id, source_line_id,
                               batch_no, received_at, expires_at, unit_cost, qty_in, qty_left)
  values (p_product, p_warehouse, p_origin, p_doc, p_line, p_batch, p_received_at, p_expires, p_unit_cost, p_qty, p_qty)
  returning id into v_lot;
  insert into public.erp_movements (document_id, line_id, lot_id, product_id, warehouse_id, qty, unit_cost, amount, created_by)
  values (p_doc, p_line, v_lot, p_product, p_warehouse, p_qty, p_unit_cost,
          case when p_unit_cost is null then null else round(p_qty * p_unit_cost, 4) end, p_actor);
  return v_lot;
end;
$$;

-- Takes p_qty from the warehouse lots and returns what was taken per lot.
-- Lot order (the valuation rule) lives only here: oldest receipt first.
-- Raises ERP_INSUFFICIENT_STOCK; the caller's transaction is then rolled back.
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
    order by l.received_at, l.created_at, l.id
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

create or replace function public.erp_check_product(p_product uuid)
returns public.erp_products
language plpgsql
as $$
declare
  v public.erp_products;
begin
  select * into v from public.erp_products where id = p_product;
  if not found then perform public.erp_raise('ERP_PRODUCT_NOT_FOUND', p_product::text); end if;
  if v.archived_at is not null then perform public.erp_raise('ERP_PRODUCT_ARCHIVED', v.name_en); end if;
  if v.base_unit is null then perform public.erp_raise('ERP_PRODUCT_NO_UNIT', v.name_en); end if;
  return v;
end;
$$;

create or replace function public.erp_check_warehouse(p_warehouse uuid, p_label text)
returns void
language plpgsql
as $$
declare
  v_archived timestamptz;
begin
  if p_warehouse is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', p_label); end if;
  select archived_at into v_archived from public.erp_warehouses where id = p_warehouse;
  if not found then perform public.erp_raise('ERP_WAREHOUSE_NOT_FOUND', p_label); end if;
  if v_archived is not null then perform public.erp_raise('ERP_WAREHOUSE_ARCHIVED', p_label); end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft documents
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_document(p_doc jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p_doc->>'id', '')::uuid;
  v_type text := p_doc->>'doc_type';
  v_existing public.erp_documents;
  v_prefix text;
  v_line jsonb;
  v_i integer := 0;
begin
  if v_id is not null then
    select * into v_existing from public.erp_documents where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_existing.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_existing.doc_no); end if;
    if p_doc ? 'lock_version' and (p_doc->>'lock_version')::integer <> v_existing.lock_version then
      perform public.erp_raise('ERP_STALE');
    end if;
    v_type := v_existing.doc_type;
  elsif v_type not in ('opening', 'receipt', 'transfer', 'writeoff', 'count', 'production') then
    perform public.erp_raise('ERP_INVALID', 'doc_type');
  end if;

  if v_id is null then
    v_prefix := case v_type when 'opening' then 'OB' when 'receipt' then 'RC' when 'transfer' then 'TR'
                            when 'writeoff' then 'WO' when 'count' then 'IC' else 'PR' end;
    insert into public.erp_documents (doc_no, doc_type, created_by, updated_by)
    values (v_prefix || '-' || lpad(nextval('public.erp_document_no_seq')::text, 6, '0'), v_type, p_actor, p_actor)
    returning id into v_id;
  end if;

  update public.erp_documents set
    doc_date = coalesce(nullif(p_doc->>'doc_date', '')::date, current_date),
    warehouse_id = nullif(p_doc->>'warehouse_id', '')::uuid,
    target_warehouse_id = nullif(p_doc->>'target_warehouse_id', '')::uuid,
    supplier_id = nullif(p_doc->>'supplier_id', '')::uuid,
    reason = nullif(btrim(p_doc->>'reason'), ''),
    comment = nullif(btrim(p_doc->>'comment'), ''),
    prices_include_vat = coalesce((p_doc->>'prices_include_vat')::boolean, false),
    recipe_id = nullif(p_doc->>'recipe_id', '')::uuid,
    output_product_id = nullif(p_doc->>'output_product_id', '')::uuid,
    plan_output_qty = nullif(p_doc->>'plan_output_qty', '')::numeric,
    output_qty = nullif(p_doc->>'output_qty', '')::numeric,
    output_pieces = nullif(p_doc->>'output_pieces', '')::integer,
    output_weight_kg = nullif(p_doc->>'output_weight_kg', '')::numeric,
    batch_no = nullif(btrim(p_doc->>'batch_no'), ''),
    expires_at = nullif(p_doc->>'expires_at', '')::date,
    responsible = nullif(btrim(p_doc->>'responsible'), ''),
    lock_version = lock_version + 1,
    updated_by = p_actor
  where id = v_id;

  delete from public.erp_document_lines where document_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_doc->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    insert into public.erp_document_lines (document_id, line_no, product_id, qty, planned_qty, pack_id, pack_qty,
                                           unit_price, vat_rate, batch_no, expires_at, reason)
    values (v_id, v_i, (v_line->>'product_id')::uuid, coalesce(nullif(v_line->>'qty', '')::numeric, 0),
            nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
            nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
            nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
            nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''));
  end loop;

  perform public.erp_audit(p_actor, 'document', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_delete_draft(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v public.erp_documents;
begin
  select * into v from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v.doc_no); end if;
  delete from public.erp_documents where id = p_id;
  perform public.erp_audit(p_actor, 'document', p_id, 'delete_draft', null, jsonb_build_object('doc_no', v.doc_no));
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting: availability check and movements in one transaction
-- ---------------------------------------------------------------------------

create or replace function public.erp_post_document(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_settings public.erp_settings;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_out public.erp_products;
  v_taken record;
  v_now timestamptz := now();
  v_qty numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_rate numeric;
  v_unit_cost numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_current numeric;
  v_diff numeric;
  v_lines integer := 0;
  v_batch text;
  v_expires date;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_doc.doc_no); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_settings from public.erp_settings where id = 1;

  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  if v_doc.doc_type in ('transfer', 'production') then
    perform public.erp_check_warehouse(v_doc.target_warehouse_id, 'target_warehouse');
  end if;
  if v_doc.doc_type = 'transfer' and v_doc.warehouse_id = v_doc.target_warehouse_id then
    perform public.erp_raise('ERP_SAME_WAREHOUSE');
  end if;
  if v_doc.doc_type = 'writeoff' and v_doc.reason is null
     and exists (select 1 from public.erp_document_lines where document_id = p_id and reason is null) then
    perform public.erp_raise('ERP_REASON_REQUIRED');
  end if;

  if v_doc.doc_type = 'production' then
    if v_doc.output_product_id is null then perform public.erp_raise('ERP_INVALID', 'output_product_id'); end if;
    if v_doc.output_qty is null then perform public.erp_raise('ERP_INVALID', 'output_qty'); end if;
    v_out := public.erp_check_product(v_doc.output_product_id);
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_lines := v_lines + 1;
    v_product := public.erp_check_product(v_line.product_id);
    v_qty := v_line.qty;
    v_line_cost := 0;
    v_line_known := true;
    v_net := null; v_vat := null; v_gross := null; v_current := null; v_diff := null;

    if v_doc.doc_type in ('opening', 'receipt') then
      if v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en); end if;
      if v_line.unit_price is null then
        v_unit_cost := null;
      else
        v_rate := coalesce(v_line.vat_rate, v_settings.default_input_vat_rate, 0);
        if v_settings.input_vat_enabled and v_doc.doc_type = 'receipt' then
          if v_doc.prices_include_vat then
            v_gross := round(v_qty * v_line.unit_price, 4);
            v_net := round(v_gross / (1 + v_rate / 100), 4);
          else
            v_net := round(v_qty * v_line.unit_price, 4);
            v_gross := round(v_net * (1 + v_rate / 100), 4);
          end if;
          v_vat := v_gross - v_net;
        else
          v_net := round(v_qty * v_line.unit_price, 4);
          v_gross := v_net;
          v_vat := 0;
        end if;
        -- Recoverable input VAT is not part of the inventory cost.
        v_unit_cost := v_net / v_qty;
      end if;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, v_unit_cost,
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_now, null, p_actor);
      v_line_known := v_unit_cost is not null;
      v_line_cost := v_net;
      if v_doc.doc_type = 'receipt' and v_unit_cost is not null then
        update public.erp_products
        set est_unit_cost = v_unit_cost, est_cost_source = 'receipt', est_cost_at = v_now, updated_by = p_actor
        where id = v_product.id;
      end if;

    elsif v_doc.doc_type in ('transfer', 'writeoff', 'production') then
      if v_qty <= 0 then
        if v_doc.doc_type = 'production' then continue; end if;
        perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en);
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost + v_taken.qty * v_taken.unit_cost; end if;
        if v_doc.doc_type = 'transfer' then
          perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.target_warehouse_id, v_taken.qty,
                                         v_taken.unit_cost, v_taken.batch_no, v_taken.expires_at,
                                         v_taken.received_at, v_taken.origin_lot_id, p_actor);
        end if;
      end loop;

    elsif v_doc.doc_type = 'count' then
      perform 1 from public.erp_lots
      where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0 for update;
      select coalesce(sum(qty_left), 0) into v_current from public.erp_lots
      where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0;
      v_diff := v_qty - v_current;
      if v_diff < 0 then
        for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, -v_diff, p_actor)
        loop
          if v_taken.unit_cost is null then v_line_known := false;
          else v_line_cost := v_line_cost - v_taken.qty * v_taken.unit_cost; end if;
        end loop;
      elsif v_diff > 0 then
        -- Surplus is valued at the latest known lot cost here, else the current estimate, else unknown.
        select l.unit_cost into v_unit_cost from public.erp_lots l
        where l.product_id = v_product.id and l.warehouse_id = v_doc.warehouse_id and l.unit_cost is not null
        order by l.received_at desc, l.created_at desc limit 1;
        v_unit_cost := coalesce(v_unit_cost, v_product.est_unit_cost);
        perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_diff, v_unit_cost,
                                       v_doc.doc_no, null, v_now, null, p_actor);
        v_line_known := v_unit_cost is not null;
        v_line_cost := case when v_unit_cost is null then 0 else v_diff * v_unit_cost end;
      end if;
    end if;

    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      net_amount = v_net, vat_amount = v_vat, gross_amount = v_gross,
      system_qty = v_current, diff_qty = v_diff,
      cost_amount = case when v_line_known then v_line_cost else null end,
      unit_cost = case when v_line_known and v_qty > 0 and v_doc.doc_type <> 'count' then round(v_line_cost / v_qty, 6) else null end,
      cost_known = v_line_known
    where id = v_line.id;

    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  if v_lines = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no); end if;

  if v_doc.doc_type = 'production' then
    v_batch := coalesce(v_doc.batch_no, v_doc.doc_no);
    v_expires := coalesce(v_doc.expires_at,
                          case when v_out.shelf_life_days is null then null else v_doc.doc_date + v_out.shelf_life_days end);
    v_unit_cost := case when v_known then round(v_total / v_doc.output_qty, 6) else null end;
    perform public.erp_receive_lot(p_id, null, v_out.id, v_doc.target_warehouse_id, v_doc.output_qty, v_unit_cost,
                                   v_batch, v_expires, v_now, null, p_actor);
    update public.erp_documents set output_unit_cost = v_unit_cost, batch_no = v_batch, expires_at = v_expires
    where id = p_id;
  end if;

  update public.erp_documents set
    status = 'posted', posted_at = v_now, posted_by = p_actor,
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known);
end;
$$;

-- Cancels a posted document with reversal movements. Blocked when stock it
-- brought in has already been used by other documents.
create or replace function public.erp_cancel_document(p_id uuid, p_actor text, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_blockers text;
  v_mov public.erp_movements;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then perform public.erp_raise('ERP_REASON_REQUIRED'); end if;
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.status <> 'posted' then perform public.erp_raise('ERP_NOT_POSTED', v_doc.doc_no); end if;

  perform 1 from public.erp_lots where source_document_id = p_id for update;
  select string_agg(distinct d.doc_no, ', ') into v_blockers
  from public.erp_lots l
  join public.erp_movements m on m.lot_id = l.id and m.document_id <> p_id and m.qty < 0
  join public.erp_documents d on d.id = m.document_id and d.status = 'posted'
  where l.source_document_id = p_id;
  if v_blockers is not null then
    perform public.erp_raise('ERP_CANCEL_BLOCKED', v_blockers);
  end if;

  for v_mov in select * from public.erp_movements where document_id = p_id and reversal_of is null order by id
  loop
    update public.erp_lots set qty_left = qty_left - v_mov.qty where id = v_mov.lot_id;
    insert into public.erp_movements (document_id, line_id, lot_id, product_id, warehouse_id, qty, unit_cost, amount,
                                      reversal_of, created_by)
    values (p_id, v_mov.line_id, v_mov.lot_id, v_mov.product_id, v_mov.warehouse_id, -v_mov.qty, v_mov.unit_cost,
            -v_mov.amount, v_mov.id, p_actor);
  end loop;

  update public.erp_documents set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor,
    cancel_reason = btrim(p_reason)
  where id = p_id;
  perform public.erp_audit(p_actor, 'document', p_id, 'cancel', btrim(p_reason), jsonb_build_object('doc_no', v_doc.doc_no));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog writes
-- ---------------------------------------------------------------------------

create or replace function public.erp_slug(p_text text)
returns text
language sql
immutable
as $$
  select left(nullif(btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-'), ''), 60);
$$;

create or replace function public.erp_unique_code(p_table text, p_base text)
returns text
language plpgsql
as $$
declare
  v_base text := coalesce(public.erp_slug(p_base), 'item');
  v_code text := v_base;
  v_n integer := 1;
  v_taken boolean;
begin
  loop
    execute format('select exists (select 1 from public.%I where code = $1)', p_table) into v_taken using v_code;
    exit when not v_taken;
    v_n := v_n + 1;
    v_code := v_base || '-' || v_n;
  end loop;
  return v_code;
end;
$$;

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
    updated_by = p_actor
  where id = v_id;

  if p ? 'packs' then
    update public.erp_product_packs set archived_at = now()
    where product_id = v_id and archived_at is null
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p->'packs') x where nullif(x->>'id', '') is not null);
    for v_pack in select * from jsonb_array_elements(p->'packs')
    loop
      if nullif(v_pack->>'id', '') is null then
        insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
        values (v_id, nullif(v_pack->>'supplier_id', '')::uuid, btrim(v_pack->>'label'),
                (v_pack->>'qty_base')::numeric, coalesce((v_pack->>'is_default')::boolean, false));
      else
        update public.erp_product_packs set supplier_id = nullif(v_pack->>'supplier_id', '')::uuid,
          label = btrim(v_pack->>'label'), qty_base = (v_pack->>'qty_base')::numeric,
          is_default = coalesce((v_pack->>'is_default')::boolean, false)
        where id = (v_pack->>'id')::uuid and product_id = v_id;
      end if;
    end loop;
  end if;

  perform public.erp_audit(p_actor, 'product', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

-- Archive or restore a reference row. Products and warehouses with stock cannot be archived.
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
  perform public.erp_audit(p_actor, p_entity, p_id, case when p_archived then 'archive' else 'restore' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

-- Saves a draft in place. Saving an active or archived version creates a new draft version.
create or replace function public.erp_save_recipe(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_old public.erp_recipes;
  v_product uuid := nullif(p->>'product_id', '')::uuid;
  v_type text;
  v_line jsonb;
  v_i integer := 0;
begin
  if v_id is not null then
    select * into v_old from public.erp_recipes where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    v_product := v_old.product_id;
    if v_old.status <> 'draft' then v_id := null; end if;
  end if;
  select type into v_type from public.erp_products where id = v_product and archived_at is null;
  if v_type is null or v_type not in ('semi_finished', 'finished') then
    perform public.erp_raise('ERP_INVALID', 'product_id');
  end if;

  if v_id is null then
    insert into public.erp_recipes (product_id, version, created_by, legacy_recipe_id)
    values (v_product, coalesce((select max(version) from public.erp_recipes where product_id = v_product), 0) + 1,
            p_actor, v_old.legacy_recipe_id)
    returning id into v_id;
  end if;

  update public.erp_recipes set
    yield_qty = nullif(p->>'yield_qty', '')::numeric,
    yield_pieces = nullif(p->>'yield_pieces', '')::integer,
    instructions = coalesce(p->'instructions', instructions),
    shelf_life_days = nullif(p->>'shelf_life_days', '')::integer,
    storage_conditions = nullif(btrim(p->>'storage_conditions'), ''),
    note = nullif(btrim(p->>'note'), '')
  where id = v_id;

  delete from public.erp_recipe_lines where recipe_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty, note, raw_name, raw_amount, raw_unit)
    values (v_id, v_i, nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'qty', '')::numeric,
            nullif(btrim(v_line->>'note'), ''), v_line->'raw_name', nullif(v_line->>'raw_amount', '')::numeric,
            nullif(v_line->>'raw_unit', ''));
  end loop;

  perform public.erp_audit(p_actor, 'recipe', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_activate_recipe(p_id uuid, p_actor text)
returns void
language plpgsql
as $$
declare
  v public.erp_recipes;
  v_bad text;
begin
  select * into v from public.erp_recipes where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.status <> 'draft' then perform public.erp_raise('ERP_RECIPE_LOCKED'); end if;
  if v.yield_qty is null then perform public.erp_raise('ERP_INVALID', 'yield_qty'); end if;
  if not exists (select 1 from public.erp_recipe_lines where recipe_id = p_id) then
    perform public.erp_raise('ERP_EMPTY_RECIPE');
  end if;
  select string_agg(coalesce(l.raw_name->>'en', '#' || l.line_no), ', ') into v_bad
  from public.erp_recipe_lines l
  left join public.erp_products pr on pr.id = l.product_id
  where l.recipe_id = p_id and (l.product_id is null or l.qty is null or pr.base_unit is null or pr.archived_at is not null);
  if v_bad is not null then perform public.erp_raise('ERP_RECIPE_UNRESOLVED', v_bad); end if;

  update public.erp_recipes set status = 'archived' where product_id = v.product_id and status = 'active';
  update public.erp_recipes set status = 'active', activated_at = now(), activated_by = p_actor where id = p_id;
  perform public.erp_audit(p_actor, 'recipe', p_id, 'activate');
end;
$$;

-- Links an imported ingredient line to a catalog product. With p_remember the
-- choice is stored and applied to other unresolved lines with the same name.
create or replace function public.erp_resolve_recipe_line(
  p_line uuid, p_product uuid, p_qty numeric, p_remember boolean, p_actor text
)
returns integer
language plpgsql
as $$
declare
  v_line public.erp_recipe_lines;
  v_key text;
  v_base text;
  v_count integer := 1;
  v_other record;
begin
  select * into v_line from public.erp_recipe_lines where id = p_line for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  select base_unit into v_base from public.erp_products where id = p_product and archived_at is null;
  if v_base is null then perform public.erp_raise('ERP_PRODUCT_NO_UNIT'); end if;
  if p_qty is null or p_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY'); end if;
  update public.erp_recipe_lines set product_id = p_product, qty = p_qty where id = p_line;

  v_key := lower(btrim(v_line.raw_name->>'en'));
  if p_remember and v_key is not null and v_key <> '' then
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('recipes', 'ingredient', v_key, p_product)
    on conflict (source, entity, legacy_id) do update set target_id = excluded.target_id;
    for v_other in
      select l.id, l.raw_amount, l.raw_unit from public.erp_recipe_lines l
      join public.erp_recipes r on r.id = l.recipe_id and r.status = 'draft'
      where l.product_id is null and lower(btrim(l.raw_name->>'en')) = v_key
    loop
      if public.erp_to_base(v_other.raw_amount, v_other.raw_unit, v_base) is not null then
        update public.erp_recipe_lines set product_id = p_product,
          qty = public.erp_to_base(v_other.raw_amount, v_other.raw_unit, v_base)
        where id = v_other.id;
        v_count := v_count + 1;
      end if;
    end loop;
  end if;
  perform public.erp_audit(p_actor, 'recipe_line', p_line, 'resolve', null,
                           jsonb_build_object('product_id', p_product, 'qty', p_qty, 'applied', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dishes
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_dish(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_line jsonb;
  v_price jsonb;
  v_i integer := 0;
begin
  if v_id is null then
    insert into public.erp_dishes (code, name_en, created_by)
    values (public.erp_unique_code('erp_dishes', p->>'name_en'), btrim(p->>'name_en'), p_actor)
    returning id into v_id;
  elsif not exists (select 1 from public.erp_dishes where id = v_id) then
    perform public.erp_raise('ERP_NOT_FOUND');
  end if;

  update public.erp_dishes set
    name_en = btrim(p->>'name_en'),
    name_vn = coalesce(btrim(p->>'name_vn'), ''),
    category_id = nullif(p->>'category_id', '')::uuid,
    sale_price = nullif(p->>'sale_price', '')::numeric,
    vat_rate = nullif(p->>'vat_rate', '')::numeric,
    note = nullif(btrim(p->>'note'), ''),
    updated_by = p_actor
  where id = v_id;

  delete from public.erp_dish_lines where dish_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    perform public.erp_check_product((v_line->>'product_id')::uuid);
    insert into public.erp_dish_lines (dish_id, line_no, product_id, qty, note)
    values (v_id, v_i, (v_line->>'product_id')::uuid, (v_line->>'qty')::numeric, nullif(btrim(v_line->>'note'), ''));
  end loop;

  delete from public.erp_dish_channel_prices where dish_id = v_id;
  for v_price in select * from jsonb_array_elements(coalesce(p->'channel_prices', '[]'::jsonb))
  loop
    if nullif(v_price->>'sale_price', '') is not null then
      insert into public.erp_dish_channel_prices (dish_id, channel_id, sale_price)
      values (v_id, (v_price->>'channel_id')::uuid, (v_price->>'sale_price')::numeric);
    end if;
  end loop;

  perform public.erp_audit(p_actor, 'dish', v_id, 'save');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff catalog: import/sync (repeatable) and compatible export
-- ---------------------------------------------------------------------------

-- Upserts the Staff order catalog by its ids (kept as product codes). ERP-only
-- fields (type, base unit, costs) are never overwritten for existing products.
-- Items missing from the catalog are only unlisted, never deleted.
create or replace function public.erp_sync_staff_catalog(p_catalog jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_i integer;
  v_id uuid;
  v_cat uuid;
  v_sup uuid;
  v_name text;
  v_name_vn text;
  v_split integer;
  v_pack record;
  v_type text;
  v_created integer := 0;
  v_updated integer := 0;
  v_review integer := 0;
  v_codes text[] := '{}';
begin
  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'categories', '[]'::jsonb))
  loop
    insert into public.erp_categories (code, name_en, name_vn, sort)
    values (v_item->>'id', btrim(v_item->>'en'), coalesce(btrim(v_item->>'vn'), ''), v_i)
    on conflict (code) do update set name_en = excluded.name_en, name_vn = excluded.name_vn,
      sort = excluded.sort, archived_at = null
    returning id into v_id;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'category', v_item->>'id', v_id) on conflict do nothing;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'suppliers', '[]'::jsonb))
  loop
    insert into public.erp_suppliers (code, name, zalo_url, sort)
    values (v_item->>'id', btrim(v_item->>'label'), nullif(v_item->>'zaloUrl', ''), v_i)
    on conflict (code) do update set name = excluded.name, zalo_url = excluded.zalo_url,
      sort = excluded.sort, archived_at = null
    returning id into v_id;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'supplier', v_item->>'id', v_id) on conflict do nothing;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_catalog->'items', '[]'::jsonb))
  loop
    v_codes := v_codes || (v_item->>'id');
    select id into v_cat from public.erp_categories where code = v_item->>'category';
    select id into v_sup from public.erp_suppliers where code = v_item->>'supplier';
    v_name := btrim(v_item->>'name');
    v_name_vn := coalesce(btrim(v_item->>'nameVn'), '');
    -- The Staff admin stores one "EN / VN" text in both fields.
    if v_name = v_name_vn then
      v_split := strpos(v_name, ' / ');
      if v_split > 0 then
        v_name_vn := btrim(substr(v_name, v_split + 3));
        v_name := btrim(left(v_name, v_split - 1));
      end if;
    end if;
    select * into v_pack from public.erp_parse_pack(v_item->>'pack');
    v_type := case v_item->>'category' when 'disposable-tableware' then 'packaging'
                                       when 'supplies' then 'consumable' else 'ingredient' end;

    select target_id into v_id from public.erp_legacy_map
    where source = 'staff' and entity = 'item' and legacy_id = v_item->>'id';
    if v_id is null then
      select id into v_id from public.erp_products where code = v_item->>'id';
    end if;

    if v_id is null then
      insert into public.erp_products (code, type, name_en, name_vn, category_id, base_unit, brand, staff_listed,
                                       staff_unit, staff_pack, staff_supplier_id, staff_item_no, staff_hidden,
                                       staff_sort, created_by, updated_by)
      values (v_item->>'id', v_type, v_name, v_name_vn, v_cat, v_pack.base_unit, nullif(btrim(v_item->>'brand'), ''),
              true, v_item->>'unit', nullif(v_item->>'pack', ''), v_sup, nullif(v_item->>'itemNo', ''),
              coalesce((v_item->>'hidden')::boolean, false), v_i, p_actor, p_actor)
      returning id into v_id;
      v_created := v_created + 1;
    else
      update public.erp_products set
        name_en = v_name, name_vn = v_name_vn, category_id = v_cat, brand = nullif(btrim(v_item->>'brand'), ''),
        staff_listed = true, staff_unit = v_item->>'unit', staff_pack = nullif(v_item->>'pack', ''),
        staff_supplier_id = v_sup, staff_item_no = nullif(v_item->>'itemNo', ''),
        staff_hidden = coalesce((v_item->>'hidden')::boolean, false), staff_sort = v_i,
        base_unit = coalesce(base_unit, v_pack.base_unit), updated_by = p_actor
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
    insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
    values ('staff', 'item', v_item->>'id', v_id) on conflict do nothing;

    if v_pack.base_unit is not null
       and v_pack.base_unit = (select base_unit from public.erp_products where id = v_id) then
      insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default)
      values (v_id, v_sup, coalesce(v_item->>'unit', '') || ' ' || (v_item->>'pack'), v_pack.qty, true)
      on conflict do nothing;
    else
      v_review := v_review + 1;
    end if;
    v_i := v_i + 1;
  end loop;

  update public.erp_products set staff_listed = false, updated_by = p_actor
  where staff_listed and not (code = any (v_codes));

  update public.erp_categories c set archived_at = now()
  where archived_at is null
    and not exists (select 1 from jsonb_array_elements(coalesce(p_catalog->'categories', '[]'::jsonb)) x where x->>'id' = c.code)
    and not exists (select 1 from public.erp_products p where p.category_id = c.id and p.archived_at is null)
    and not exists (select 1 from public.erp_dishes d where d.category_id = c.id and d.archived_at is null);
  update public.erp_suppliers s set archived_at = now()
  where archived_at is null
    and not exists (select 1 from jsonb_array_elements(coalesce(p_catalog->'suppliers', '[]'::jsonb)) x where x->>'id' = s.code)
    and not exists (select 1 from public.erp_products p where p.staff_supplier_id = s.id and p.archived_at is null)
    and not exists (select 1 from public.erp_product_packs k where k.supplier_id = s.id and k.archived_at is null);

  perform public.erp_audit(p_actor, 'staff_catalog', null, 'sync', null,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'pack_review', v_review));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'pack_review', v_review);
end;
$$;

-- Same shape as src/data/staffCatalog.ts StaffCatalog.
create or replace function public.erp_staff_catalog()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.code, 'en', c.name_en, 'vn', c.name_vn) order by c.sort, c.name_en)
      from public.erp_categories c where c.archived_at is null), '[]'::jsonb),
    'suppliers', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.code, 'label', s.name, 'zaloUrl', s.zalo_url))
                       order by s.sort, s.name)
      from public.erp_suppliers s where s.archived_at is null), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', p.code, 'category', c.code, 'name', p.name_en,
          'nameVn', case when p.name_vn = '' then p.name_en else p.name_vn end,
          'brand', p.brand, 'pack', p.staff_pack, 'unit', coalesce(p.staff_unit, p.base_unit),
          'supplier', s.code, 'itemNo', p.staff_item_no, 'hidden', case when p.staff_hidden then true end))
        order by p.staff_sort, p.name_en)
      from public.erp_products p
      join public.erp_categories c on c.id = p.category_id and c.archived_at is null
      join public.erp_suppliers s on s.id = p.staff_supplier_id and s.archived_at is null
      where p.staff_listed and p.archived_at is null), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Recipes import (repeatable). Ingredients are linked by a remembered choice
-- or an exact unique name match; everything else stays for review.
-- ---------------------------------------------------------------------------

create or replace function public.erp_import_recipes(p_recipes jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_recipe jsonb;
  v_ing jsonb;
  v_product uuid;
  v_recipe_id uuid;
  v_status text;
  v_base text;
  v_key text;
  v_match uuid;
  v_match_base text;
  v_qty numeric;
  v_i integer;
  v_created integer := 0;
  v_refreshed integer := 0;
  v_kept integer := 0;
  v_unresolved integer := 0;
begin
  for v_recipe in select * from jsonb_array_elements(p_recipes) where value->>'kind' = 'prep'
  loop
    v_base := case lower(v_recipe->'yield'->>'unit') when 'g' then 'kg' when 'kg' then 'kg'
                                                     when 'ml' then 'l' when 'l' then 'l'
                                                     when 'pcs' then 'pcs' end;

    select target_id into v_product from public.erp_legacy_map
    where source = 'recipes' and entity = 'product' and legacy_id = v_recipe->>'id';
    if v_product is null then
      insert into public.erp_products (code, type, name_en, name_vn, base_unit, storage_conditions, created_by, updated_by)
      values (public.erp_unique_code('erp_products', 'prep-' || (v_recipe->>'id')), 'semi_finished',
              btrim(v_recipe->'name'->>'en'), coalesce(btrim(v_recipe->'name'->>'vn'), ''), v_base,
              (select string_agg(x->'title'->>'en', '; ') from jsonb_array_elements(coalesce(v_recipe->'storage', '[]'::jsonb)) x),
              p_actor, p_actor)
      returning id into v_product;
      insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
      values ('recipes', 'product', v_recipe->>'id', v_product);
    end if;
    select base_unit into v_base from public.erp_products where id = v_product;

    select r.id, r.status into v_recipe_id, v_status
    from public.erp_legacy_map m join public.erp_recipes r on r.id = m.target_id
    where m.source = 'recipes' and m.entity = 'recipe' and m.legacy_id = v_recipe->>'id';

    if v_recipe_id is not null and v_status <> 'draft' then
      v_kept := v_kept + 1;
      continue;
    end if;

    if v_recipe_id is null then
      insert into public.erp_recipes (product_id, version, legacy_recipe_id, created_by)
      values (v_product, coalesce((select max(version) from public.erp_recipes where product_id = v_product), 0) + 1,
              v_recipe->>'id', p_actor)
      returning id into v_recipe_id;
      insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
      values ('recipes', 'recipe', v_recipe->>'id', v_recipe_id);
      v_created := v_created + 1;
    else
      delete from public.erp_recipe_lines where recipe_id = v_recipe_id;
      v_refreshed := v_refreshed + 1;
    end if;

    update public.erp_recipes set
      yield_qty = public.erp_to_base((v_recipe->'yield'->>'amount')::numeric, v_recipe->'yield'->>'unit', v_base),
      instructions = coalesce(v_recipe->'steps', '[]'::jsonb),
      storage_conditions = (select string_agg(x->'title'->>'en', '; ')
                            from jsonb_array_elements(coalesce(v_recipe->'storage', '[]'::jsonb)) x)
    where id = v_recipe_id;

    v_i := 0;
    for v_ing in select * from jsonb_array_elements(coalesce(v_recipe->'ingredients', '[]'::jsonb))
    loop
      v_i := v_i + 1;
      v_key := lower(btrim(v_ing->'name'->>'en'));
      v_match := null;
      select target_id into v_match from public.erp_legacy_map
      where source = 'recipes' and entity = 'ingredient' and legacy_id = v_key;
      if v_match is null then
        select (array_agg(id))[1] into v_match from public.erp_products
        where archived_at is null and lower(btrim(name_en)) = v_key
        having count(*) = 1;
      end if;
      v_match_base := null;
      if v_match is not null then
        select base_unit into v_match_base from public.erp_products where id = v_match and archived_at is null;
      end if;
      v_qty := public.erp_to_base((v_ing->>'amount')::numeric, v_ing->>'unit', v_match_base);
      if v_qty is null then
        v_match := null;
        v_unresolved := v_unresolved + 1;
      end if;
      insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty, note, raw_name, raw_amount, raw_unit)
      values (v_recipe_id, v_i, v_match, v_qty, v_ing->'note'->>'en', v_ing->'name',
              (v_ing->>'amount')::numeric, v_ing->>'unit');
    end loop;
  end loop;

  perform public.erp_audit(p_actor, 'recipes', null, 'import', null,
    jsonb_build_object('created', v_created, 'refreshed', v_refreshed, 'kept', v_kept, 'unresolved', v_unresolved));
  return jsonb_build_object('created', v_created, 'refreshed', v_refreshed, 'kept', v_kept, 'unresolved', v_unresolved);
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: server (service_role) only
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select table_name from information_schema.tables
           where table_schema = 'public' and table_name like 'erp\_%' and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', r.table_name);
    execute format('grant all on public.%I to service_role', r.table_name);
  end loop;
  revoke all on public.erp_stock from public, anon, authenticated;
  grant select on public.erp_stock to service_role;
  revoke all on sequence public.erp_document_no_seq from public, anon, authenticated;
  grant usage, select on sequence public.erp_document_no_seq to service_role;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'erp\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
