-- ERP: processing losses (gross/net weight in recipes and dishes) and the stock movement report.
-- Apply after 20261103120000_erp_v1.sql. Safe to run more than once. Existing data is kept:
-- new columns are empty, and an empty loss means gross = net, so costs do not change.

-- ---------------------------------------------------------------------------
-- Losses per processing method, % of weight lost (as in Poster)
-- ---------------------------------------------------------------------------

alter table public.erp_products
  add column if not exists loss_clean_pct numeric(5,2) check (loss_clean_pct >= 0 and loss_clean_pct < 100),
  add column if not exists loss_boil_pct numeric(5,2) check (loss_boil_pct >= 0 and loss_boil_pct < 100),
  add column if not exists loss_fry_pct numeric(5,2) check (loss_fry_pct >= 0 and loss_fry_pct < 100),
  add column if not exists loss_stew_pct numeric(5,2) check (loss_stew_pct >= 0 and loss_stew_pct < 100),
  add column if not exists loss_bake_pct numeric(5,2) check (loss_bake_pct >= 0 and loss_bake_pct < 100);

-- qty stays the gross amount taken from stock; net_qty is what is left after processing.
alter table public.erp_recipe_lines
  add column if not exists methods text[] not null default '{}'
    check (methods <@ array['clean', 'boil', 'fry', 'stew', 'bake']::text[]),
  add column if not exists net_qty numeric(18,6) check (net_qty > 0);

alter table public.erp_dish_lines
  add column if not exists methods text[] not null default '{}'
    check (methods <@ array['clean', 'boil', 'fry', 'stew', 'bake']::text[]),
  add column if not exists net_qty numeric(18,6) check (net_qty > 0);

create or replace function public.erp_line_methods(p jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array(select distinct x from jsonb_array_elements_text(
    case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x order by x), '{}'::text[]);
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
    insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty, note, raw_name, raw_amount, raw_unit,
                                         methods, net_qty)
    values (v_id, v_i, nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'qty', '')::numeric,
            nullif(btrim(v_line->>'note'), ''), v_line->'raw_name', nullif(v_line->>'raw_amount', '')::numeric,
            nullif(v_line->>'raw_unit', ''), public.erp_line_methods(v_line->'methods'),
            nullif(v_line->>'net_qty', '')::numeric);
  end loop;

  perform public.erp_audit(p_actor, 'recipe', v_id, 'save');
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

  perform public.erp_audit(p_actor, 'dish', v_id, 'save');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock movement report: opening balance, in, out and closing balance per product
-- and warehouse for a period of document dates. A cancellation counts against the
-- direction of the movement it reverses, so a cancelled receipt reduces "in".
-- Value is qty × lot cost (movements.amount is unsigned for consumption) and is null
-- when any movement of the row has an unknown cost.
-- ---------------------------------------------------------------------------

create or replace function public.erp_movement_report(p_from date, p_to date, p_warehouse uuid default null)
returns table (
  product_id uuid,
  warehouse_id uuid,
  opening_qty numeric,
  opening_value numeric,
  in_qty numeric,
  in_value numeric,
  out_qty numeric,
  out_value numeric,
  closing_qty numeric,
  closing_value numeric
)
language sql
stable
as $$
  with m as (
    select m.product_id, m.warehouse_id, m.qty, m.qty * m.unit_cost as amount,
           d.doc_date < p_from as before,
           sign(coalesce(o.qty, m.qty)) as dir
    from public.erp_movements m
    join public.erp_documents d on d.id = m.document_id
    left join public.erp_movements o on o.id = m.reversal_of
    where d.doc_date <= p_to
      and (p_warehouse is null or m.warehouse_id = p_warehouse)
  ),
  agg as (
    select m.product_id, m.warehouse_id,
      coalesce(sum(qty) filter (where before), 0) as opening_qty,
      sum(amount) filter (where before) as opening_value,
      bool_and(amount is not null) filter (where before) as opening_known,
      coalesce(sum(qty) filter (where not before and dir > 0), 0) as in_qty,
      sum(amount) filter (where not before and dir > 0) as in_value,
      bool_and(amount is not null) filter (where not before and dir > 0) as in_known,
      coalesce(-sum(qty) filter (where not before and dir < 0), 0) as out_qty,
      -sum(amount) filter (where not before and dir < 0) as out_value,
      bool_and(amount is not null) filter (where not before and dir < 0) as out_known,
      sum(qty) as closing_qty,
      sum(amount) as closing_value,
      bool_and(amount is not null) as closing_known
    from m
    group by m.product_id, m.warehouse_id
  )
  select product_id, warehouse_id,
    opening_qty, case when coalesce(opening_known, true) then coalesce(opening_value, 0) end,
    in_qty, case when coalesce(in_known, true) then coalesce(in_value, 0) end,
    out_qty, case when coalesce(out_known, true) then coalesce(out_value, 0) end,
    closing_qty, case when closing_known then closing_value end
  from agg
  where opening_qty <> 0 or in_qty <> 0 or out_qty <> 0 or closing_qty <> 0;
$$;

-- One jsonb value: PostgREST caps rows returned by a set-returning rpc (max_rows).
create or replace function public.erp_movement_report_json(p_from date, p_to date, p_warehouse uuid default null)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.erp_movement_report(p_from, p_to, p_warehouse) r;
$$;

create index if not exists erp_documents_date_idx on public.erp_documents (doc_date);

-- ---------------------------------------------------------------------------
-- Access: server (service_role) only
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('erp_line_methods', 'erp_movement_report', 'erp_movement_report_json', 'erp_save_product',
                                                       'erp_save_recipe', 'erp_save_dish')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
