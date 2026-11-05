-- Shared ordering-units catalog (Poster «Фасовки»): name + base unit + coefficient.
-- Existing product packs become catalog rows with the same ids (no merge by name).
-- Product/supplier links stay on erp_product_packs. Document lines keep pack_id
-- and snapshot name/unit/qty at save time so later catalog edits do not rewrite posted docs.

create table if not exists public.erp_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  unit text not null check (unit in ('kg', 'l', 'pcs')),
  qty_base numeric(18,6) not null check (qty_base > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);
create index if not exists erp_packs_unit_idx on public.erp_packs (unit) where archived_at is null;
create index if not exists erp_packs_name_idx on public.erp_packs (lower(btrim(name))) where archived_at is null;

insert into public.erp_packs (id, name, unit, qty_base, archived_at, created_at)
select k.id, k.label, coalesce(p.base_unit, 'pcs'), k.qty_base, k.archived_at, k.created_at
from public.erp_product_packs k
left join public.erp_products p on p.id = k.product_id
where not exists (select 1 from public.erp_packs x where x.id = k.id);

alter table public.erp_product_packs add column if not exists pack_id uuid;
update public.erp_product_packs set pack_id = id where pack_id is null;
alter table public.erp_product_packs alter column pack_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'erp_product_packs_pack_id_fkey') then
    alter table public.erp_product_packs
      add constraint erp_product_packs_pack_id_fkey foreign key (pack_id) references public.erp_packs (id);
  end if;
end $$;

create unique index if not exists erp_product_packs_pack_uidx
  on public.erp_product_packs (product_id, pack_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where archived_at is null;

alter table public.erp_document_lines add column if not exists pack_name text;
alter table public.erp_document_lines add column if not exists pack_unit text;
alter table public.erp_document_lines add column if not exists pack_qty_base numeric(18,6);

-- Posted lines are locked by erp_document_lines_guard; backfill snapshots only.
alter table public.erp_document_lines disable trigger erp_document_lines_guard;
update public.erp_document_lines l
set pack_name = p.name, pack_unit = p.unit, pack_qty_base = p.qty_base
from public.erp_packs p
where l.pack_id = p.id and l.pack_name is null;
alter table public.erp_document_lines enable trigger erp_document_lines_guard;

alter table public.erp_document_lines drop constraint if exists erp_document_lines_pack_id_fkey;
alter table public.erp_document_lines
  add constraint erp_document_lines_pack_id_fkey foreign key (pack_id) references public.erp_packs (id);

drop trigger if exists erp_packs_touch on public.erp_packs;
create trigger erp_packs_touch before update on public.erp_packs
  for each row execute function public.erp_touch_updated_at();

-- Staff and older product saves still insert (product_id, label, qty_base) without pack_id.
create or replace function public.erp_product_packs_fill_catalog()
returns trigger
language plpgsql
as $$
declare
  v_unit text;
  v_existing uuid;
begin
  if NEW.pack_id is not null then
    select name, qty_base into NEW.label, NEW.qty_base from public.erp_packs where id = NEW.pack_id;
    if NEW.label is null then perform public.erp_raise('ERP_NOT_FOUND', 'pack'); end if;
    return NEW;
  end if;
  select pack_id into v_existing
  from public.erp_product_packs
  where product_id = NEW.product_id and archived_at is null
    and coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(NEW.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and lower(btrim(label)) = lower(btrim(NEW.label))
  limit 1;
  if v_existing is not null then
    NEW.pack_id := v_existing;
    return NEW;
  end if;
  select coalesce(base_unit, 'pcs') into v_unit from public.erp_products where id = NEW.product_id;
  if v_unit not in ('kg', 'l', 'pcs') then v_unit := 'pcs'; end if;
  insert into public.erp_packs (id, name, unit, qty_base, archived_at)
  values (NEW.id, btrim(NEW.label), v_unit, NEW.qty_base, NEW.archived_at)
  returning id into NEW.pack_id;
  return NEW;
end;
$$;

drop trigger if exists erp_product_packs_fill_catalog on public.erp_product_packs;
create trigger erp_product_packs_fill_catalog
  before insert on public.erp_product_packs
  for each row execute function public.erp_product_packs_fill_catalog();

-- Freeze name/unit/coefficient on the line from the catalog. Posted rows cannot be updated.
create or replace function public.erp_document_lines_pack_snapshot()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_unit text;
  v_qty numeric;
  v_prod text;
begin
  if NEW.pack_id is null then
    NEW.pack_name := null;
    NEW.pack_unit := null;
    NEW.pack_qty_base := null;
    return NEW;
  end if;
  select name, unit, qty_base into v_name, v_unit, v_qty from public.erp_packs where id = NEW.pack_id;
  if v_name is null then perform public.erp_raise('ERP_NOT_FOUND', 'pack'); end if;
  select base_unit into v_prod from public.erp_products where id = NEW.product_id;
  if v_unit is distinct from v_prod then perform public.erp_raise('ERP_PACK_UNIT'); end if;
  NEW.pack_name := v_name;
  NEW.pack_unit := v_unit;
  NEW.pack_qty_base := v_qty;
  return NEW;
end;
$$;

drop trigger if exists erp_document_lines_pack_snapshot on public.erp_document_lines;
create trigger erp_document_lines_pack_snapshot
  before insert or update of pack_id, product_id on public.erp_document_lines
  for each row execute function public.erp_document_lines_pack_snapshot();

create or replace function public.erp_save_pack(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', p->>'label', ''));
  v_unit text := nullif(p->>'unit', '');
  v_qty numeric := nullif(p->>'qty_base', '')::numeric;
  v_old public.erp_packs;
begin
  if v_name is null or length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if length(v_name) > 80 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_unit not in ('kg', 'l', 'pcs') then perform public.erp_raise('ERP_INVALID', 'unit'); end if;
  if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty_base'); end if;
  if v_id is null then
    insert into public.erp_packs (name, unit, qty_base, created_by, updated_by)
    values (v_name, v_unit, v_qty, p_actor, p_actor)
    returning id into v_id;
  else
    select * into v_old from public.erp_packs where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_old.archived_at is not null then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    update public.erp_packs
    set name = v_name, unit = v_unit, qty_base = v_qty, updated_by = p_actor
    where id = v_id;
    update public.erp_product_packs
    set label = v_name, qty_base = v_qty
    where pack_id = v_id;
  end if;
  perform public.erp_audit(p_actor, 'pack', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
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
    when 'pack' then 'erp_packs'
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

create or replace function public.erp_inferred_line_supplier(p_pack uuid, p_product uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_pack uuid;
  v_ids uuid[];
begin
  if p_pack is not null then
    select supplier_id into v_pack
    from public.erp_product_packs
    where archived_at is null
      and supplier_id is not null
      and (
        (pack_id = p_pack and (p_product is null or product_id = p_product))
        or id = p_pack
      )
    order by case when product_id is not distinct from p_product then 0 else 1 end
    limit 1;
    if v_pack is not null then return v_pack; end if;
  end if;
  if p_product is null then return null; end if;
  select array_agg(distinct sid) into v_ids
  from (
    select staff_supplier_id as sid from public.erp_products where id = p_product and staff_supplier_id is not null
    union
    select supplier_id from public.erp_product_packs
    where product_id = p_product and supplier_id is not null and archived_at is null
  ) s;
  if v_ids is not null and cardinality(v_ids) = 1 then
    return v_ids[1];
  end if;
  return null;
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
  v_staff jsonb := p->'staff';
  v_listed boolean;
  v_sup uuid;
  v_missing text[] := '{}';
  v_link uuid;
  v_catalog uuid;
  v_pack_unit text;
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
    loss_clean_pct = case when p ? 'loss_clean_pct' then nullif(p->>'loss_clean_pct', '')::numeric else loss_clean_pct end,
    loss_boil_pct = case when p ? 'loss_boil_pct' then nullif(p->>'loss_boil_pct', '')::numeric else loss_boil_pct end,
    loss_fry_pct = case when p ? 'loss_fry_pct' then nullif(p->>'loss_fry_pct', '')::numeric else loss_fry_pct end,
    loss_stew_pct = case when p ? 'loss_stew_pct' then nullif(p->>'loss_stew_pct', '')::numeric else loss_stew_pct end,
    loss_bake_pct = case when p ? 'loss_bake_pct' then nullif(p->>'loss_bake_pct', '')::numeric else loss_bake_pct end,
    updated_by = p_actor
  where id = v_id;

  if p ? 'packs' then
    update public.erp_product_packs set archived_at = now()
    where product_id = v_id and archived_at is null
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p->'packs') x where nullif(x->>'id', '') is not null);
    for v_pack in select * from jsonb_array_elements(p->'packs')
    loop
      v_link := nullif(v_pack->>'id', '')::uuid;
      v_catalog := nullif(v_pack->>'pack_id', '')::uuid;
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

  perform public.erp_audit(p_actor, 'product', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

do $$
declare
  r record;
begin
  execute 'alter table public.erp_packs enable row level security';
  execute 'revoke all on public.erp_packs from public, anon, authenticated';
  execute 'grant all on public.erp_packs to service_role';
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_save_pack', 'erp_set_archived', 'erp_inferred_line_supplier', 'erp_save_product',
             'erp_product_packs_fill_catalog', 'erp_document_lines_pack_snapshot'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
