-- Merge live erp_packs that share name + unit + qty_base. Products and brands stay
-- separate. Posted document snapshots and pack_id values are not rewritten.
-- Canonical pack = least UUID in the group (order by id::text). Old rows are archived, not deleted.
-- Rollback: public.erp_rollback_pack_merges(). Idempotent: running again is a no-op.

create table if not exists public.erp_pack_merge_map (
  old_id uuid primary key references public.erp_packs (id),
  new_id uuid not null references public.erp_packs (id),
  pack_name text not null,
  pack_unit text not null,
  qty_base numeric(18,6) not null,
  merged_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  check (old_id <> new_id)
);
create index if not exists erp_pack_merge_map_new_idx on public.erp_pack_merge_map (new_id) where rolled_back_at is null;

create table if not exists public.erp_pack_merge_link_backup (
  id bigint generated always as identity primary key,
  product_pack_id uuid not null,
  old_pack_id uuid not null,
  new_pack_id uuid not null,
  action text not null check (action in ('remap', 'archive_link')),
  was_default boolean not null,
  merged_at timestamptz not null default now()
);

create table if not exists public.erp_pack_merge_line_backup (
  id bigint generated always as identity primary key,
  document_line_id uuid not null,
  old_pack_id uuid not null,
  new_pack_id uuid not null,
  merged_at timestamptz not null default now()
);

create table if not exists public.erp_pack_merge_skip (
  id bigint generated always as identity primary key,
  pack_name text not null,
  pack_unit text not null,
  qty_base numeric(18,6) not null,
  reason text not null,
  skipped_at timestamptz not null default now()
);

create or replace function public.erp_canonical_pack_id(p_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid := p_id;
  v_mapped uuid;
  v_link uuid;
begin
  if p_id is null then return null; end if;
  select m.new_id into v_mapped from public.erp_pack_merge_map m where m.old_id = p_id and m.rolled_back_at is null;
  if v_mapped is not null then v_id := v_mapped; end if;
  if exists (select 1 from public.erp_packs where id = v_id) then return v_id; end if;
  select pack_id into v_link from public.erp_product_packs where id = p_id;
  if v_link is null then return v_id; end if;
  select m.new_id into v_mapped from public.erp_pack_merge_map m where m.old_id = v_link and m.rolled_back_at is null;
  return coalesce(v_mapped, v_link);
end;
$$;

create or replace function public.erp_merge_exact_pack_duplicates()
returns jsonb
language plpgsql
as $$
declare
  v_group record;
  v_pack record;
  v_link record;
  v_keep uuid;
  v_canon uuid;
  v_n integer;
  v_merged_groups integer := 0;
  v_skipped_groups integer := 0;
  v_extra integer := 0;
  v_live_before integer;
  v_live_after integer;
  v_groups jsonb;
  v_at timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtext('erp_pack_exact_duplicates'));
  execute 'drop index if exists public.erp_packs_live_key_uidx';

  select count(*) into v_live_before from public.erp_packs where archived_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'unit', g.unit, 'qty_base', g.qty_base, 'n', g.n) order by g.name, g.unit, g.qty_base), '[]'::jsonb)
  into v_groups
  from (
    select p.name, p.unit, p.qty_base, count(*)::int as n
    from public.erp_packs p
    where p.archived_at is null
    group by p.name, p.unit, p.qty_base
    having count(*) > 1
  ) g;

  for v_group in
    select p.name, p.unit, p.qty_base, count(*) as n,
           (array_agg(p.id order by p.id::text))[1] as canon
    from public.erp_packs p
    where p.archived_at is null
    group by p.name, p.unit, p.qty_base
    having count(*) > 1
    order by p.name, p.unit, p.qty_base
  loop
    v_canon := v_group.canon;
    v_n := 0;
    for v_pack in
      select id from public.erp_packs
      where archived_at is null and name = v_group.name and unit = v_group.unit and qty_base = v_group.qty_base
        and id <> v_canon
      order by id
    loop
      insert into public.erp_pack_merge_map (old_id, new_id, pack_name, pack_unit, qty_base, merged_at)
      values (v_pack.id, v_canon, v_group.name, v_group.unit, v_group.qty_base, v_at)
      on conflict (old_id) do update
        set new_id = excluded.new_id,
            pack_name = excluded.pack_name,
            pack_unit = excluded.pack_unit,
            qty_base = excluded.qty_base,
            merged_at = excluded.merged_at,
            rolled_back_at = null
        where public.erp_pack_merge_map.rolled_back_at is not null
           or public.erp_pack_merge_map.new_id is distinct from excluded.new_id;

      for v_link in
        select * from public.erp_product_packs
        where pack_id = v_pack.id and archived_at is null
      loop
        select k.id into v_keep
        from public.erp_product_packs k
        where k.archived_at is null
          and k.id is distinct from v_link.id
          and k.product_id = v_link.product_id
          and k.pack_id = v_canon
          and coalesce(k.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(v_link.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)
        limit 1;
        if v_keep is not null then
          insert into public.erp_pack_merge_link_backup (product_pack_id, old_pack_id, new_pack_id, action, was_default, merged_at)
          values (v_link.id, v_pack.id, v_canon, 'archive_link', v_link.is_default, v_at);
          if v_link.is_default then
            update public.erp_product_packs set is_default = false where product_id = v_link.product_id and id <> v_keep;
            update public.erp_product_packs set is_default = true where id = v_keep;
          end if;
          update public.erp_product_packs set archived_at = coalesce(archived_at, v_at) where id = v_link.id;
        else
          insert into public.erp_pack_merge_link_backup (product_pack_id, old_pack_id, new_pack_id, action, was_default, merged_at)
          values (v_link.id, v_pack.id, v_canon, 'remap', v_link.is_default, v_at);
          update public.erp_product_packs set pack_id = v_canon where id = v_link.id;
        end if;
      end loop;

      insert into public.erp_legacy_map (source, entity, legacy_id, target_id)
      values ('erp_pack_merge', 'pack', v_pack.id::text, v_canon)
      on conflict (source, entity, legacy_id) do update set target_id = excluded.target_id;

      update public.erp_packs set archived_at = coalesce(archived_at, v_at), updated_at = v_at
      where id = v_pack.id and archived_at is null;
      v_n := v_n + 1;
    end loop;

    v_merged_groups := v_merged_groups + 1;
    v_extra := v_extra + v_n;
  end loop;

  execute 'alter table public.erp_document_lines disable trigger erp_document_lines_guard';
  execute 'alter table public.erp_document_lines disable trigger erp_document_lines_pack_snapshot';
  insert into public.erp_pack_merge_line_backup (document_line_id, old_pack_id, new_pack_id, merged_at)
  select l.id, l.pack_id, m.new_id, v_at
  from public.erp_document_lines l
  join public.erp_documents d on d.id = l.document_id
  join public.erp_pack_merge_map m on m.old_id = l.pack_id and m.rolled_back_at is null
  where d.status = 'draft'
    and not exists (
      select 1 from public.erp_pack_merge_line_backup b
      where b.document_line_id = l.id and b.old_pack_id = l.pack_id and b.new_pack_id = m.new_id and b.merged_at = v_at
    );
  update public.erp_document_lines l
  set pack_id = m.new_id
  from public.erp_pack_merge_map m, public.erp_documents d
  where l.pack_id = m.old_id and m.rolled_back_at is null
    and d.id = l.document_id and d.status = 'draft';
  execute 'alter table public.erp_document_lines enable trigger erp_document_lines_pack_snapshot';
  execute 'alter table public.erp_document_lines enable trigger erp_document_lines_guard';

  execute 'create unique index if not exists erp_packs_live_key_uidx on public.erp_packs (lower(btrim(name)), unit, qty_base) where archived_at is null';

  select count(*) into v_live_after from public.erp_packs where archived_at is null;
  perform public.erp_audit('system', 'pack', null, 'merge_exact_duplicates', null,
    jsonb_build_object('merged_groups', v_merged_groups, 'skipped_groups', v_skipped_groups, 'extra', v_extra,
                       'packs_live_before', v_live_before, 'packs_live_after', v_live_after));
  return jsonb_build_object(
    'merged_groups', v_merged_groups,
    'skipped_groups', v_skipped_groups,
    'extra', v_extra,
    'packs_live_before', v_live_before,
    'packs_live_after', v_live_after,
    'duplicate_groups', jsonb_array_length(v_groups),
    'sum_group_sizes', coalesce((select sum((x->>'n')::int) from jsonb_array_elements(v_groups) x), 0),
    'groups', v_groups,
    'canon', 'least id::text'
  );
end;
$$;

create or replace function public.erp_rollback_pack_merges()
returns jsonb
language plpgsql
as $$
declare
  v_at timestamptz := now();
  v_n integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('erp_pack_exact_duplicates'));
  execute 'drop index if exists public.erp_packs_live_key_uidx';

  execute 'alter table public.erp_document_lines disable trigger erp_document_lines_guard';
  execute 'alter table public.erp_document_lines disable trigger erp_document_lines_pack_snapshot';
  update public.erp_document_lines l
  set pack_id = b.old_pack_id
  from public.erp_pack_merge_line_backup b, public.erp_pack_merge_map m, public.erp_documents d
  where l.id = b.document_line_id
    and m.old_id = b.old_pack_id and m.new_id = b.new_pack_id and m.rolled_back_at is null
    and d.id = l.document_id and d.status = 'draft';
  execute 'alter table public.erp_document_lines enable trigger erp_document_lines_pack_snapshot';
  execute 'alter table public.erp_document_lines enable trigger erp_document_lines_guard';

  update public.erp_product_packs k
  set archived_at = null, is_default = b.was_default
  from public.erp_pack_merge_link_backup b
  join public.erp_pack_merge_map m on m.old_id = b.old_pack_id and m.rolled_back_at is null
  where k.id = b.product_pack_id and b.action = 'archive_link';

  update public.erp_product_packs k
  set pack_id = b.old_pack_id
  from public.erp_pack_merge_link_backup b
  join public.erp_pack_merge_map m on m.old_id = b.old_pack_id and m.rolled_back_at is null
  where k.id = b.product_pack_id and b.action = 'remap';

  update public.erp_packs p
  set archived_at = null, updated_at = v_at
  from public.erp_pack_merge_map m
  where p.id = m.old_id and m.rolled_back_at is null and p.archived_at is not null;

  update public.erp_pack_merge_map
  set rolled_back_at = v_at
  where rolled_back_at is null;
  get diagnostics v_n = row_count;

  perform public.erp_audit('system', 'pack', null, 'rollback_exact_duplicates', null, jsonb_build_object('restored', v_n));
  return jsonb_build_object('restored', v_n);
end;
$$;

create or replace function public.erp_product_packs_fill_catalog()
returns trigger
language plpgsql
as $$
declare
  v_unit text;
  v_existing uuid;
begin
  if NEW.pack_id is not null then
    NEW.pack_id := public.erp_canonical_pack_id(NEW.pack_id);
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
    NEW.pack_id := public.erp_canonical_pack_id(v_existing);
    return NEW;
  end if;
  select coalesce(base_unit, 'pcs') into v_unit from public.erp_products where id = NEW.product_id;
  if v_unit not in ('kg', 'l', 'pcs') then v_unit := 'pcs'; end if;
  select id into v_existing
  from public.erp_packs
  where archived_at is null
    and lower(btrim(name)) = lower(btrim(NEW.label))
    and unit = v_unit
    and qty_base = NEW.qty_base
  order by id
  limit 1;
  if v_existing is not null then
    NEW.pack_id := v_existing;
    return NEW;
  end if;
  insert into public.erp_packs (id, name, unit, qty_base, archived_at)
  values (NEW.id, btrim(NEW.label), v_unit, NEW.qty_base, NEW.archived_at)
  returning id into NEW.pack_id;
  return NEW;
end;
$$;

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
  if NEW.pack_id is not null then
    NEW.pack_id := public.erp_canonical_pack_id(NEW.pack_id);
  end if;
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
  v_found uuid;
begin
  if v_name is null or length(v_name) = 0 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if length(v_name) > 80 then perform public.erp_raise('ERP_INVALID', 'name'); end if;
  if v_unit not in ('kg', 'l', 'pcs') then perform public.erp_raise('ERP_INVALID', 'unit'); end if;
  if v_qty is null or v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'qty_base'); end if;
  if v_id is not null then v_id := public.erp_canonical_pack_id(v_id); end if;
  if v_id is null then
    select id into v_found
    from public.erp_packs
    where archived_at is null
      and lower(btrim(name)) = lower(v_name)
      and unit = v_unit
      and qty_base = v_qty
    order by id
    limit 1;
    if v_found is not null then return v_found; end if;
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

  perform public.erp_audit(p_actor, 'product', v_id, case when v_old.id is null then 'create' else 'update' end, null,
                           case when v_old.id is null then null else to_jsonb(v_old) end);
  return v_id;
end;
$$;

select public.erp_merge_exact_pack_duplicates();

do $$
declare
  r record;
begin
  execute 'alter table public.erp_pack_merge_map enable row level security';
  execute 'alter table public.erp_pack_merge_link_backup enable row level security';
  execute 'alter table public.erp_pack_merge_line_backup enable row level security';
  execute 'alter table public.erp_pack_merge_skip enable row level security';
  execute 'revoke all on public.erp_pack_merge_map from public, anon, authenticated';
  execute 'revoke all on public.erp_pack_merge_link_backup from public, anon, authenticated';
  execute 'revoke all on public.erp_pack_merge_line_backup from public, anon, authenticated';
  execute 'revoke all on public.erp_pack_merge_skip from public, anon, authenticated';
  execute 'grant all on public.erp_pack_merge_map to service_role';
  execute 'grant all on public.erp_pack_merge_link_backup to service_role';
  execute 'grant all on public.erp_pack_merge_line_backup to service_role';
  execute 'grant all on public.erp_pack_merge_skip to service_role';
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_canonical_pack_id', 'erp_merge_exact_pack_duplicates', 'erp_rollback_pack_merges',
             'erp_save_pack', 'erp_save_product', 'erp_product_packs_fill_catalog', 'erp_document_lines_pack_snapshot'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
