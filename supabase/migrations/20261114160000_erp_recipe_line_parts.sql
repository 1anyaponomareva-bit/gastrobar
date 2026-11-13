-- Nested cuts under a recipe/dish line. Additive: jsonb parts, default empty.
-- If parts are present they must sum (grams) to the parent net.

alter table public.erp_recipe_lines
  add column if not exists parts jsonb not null default '[]'::jsonb;

alter table public.erp_dish_lines
  add column if not exists parts jsonb not null default '[]'::jsonb;

create or replace function public.erp_line_parts(p_parts jsonb, p_qty numeric, p_net numeric, p_unit text)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_grams numeric;
  v_sum numeric := 0;
  v_n integer := 0;
  v_parent numeric;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    return '[]'::jsonb;
  end if;
  if p_unit = 'pcs' then
    perform public.erp_raise('ERP_PARTS_UNIT');
  end if;
  v_parent := round(coalesce(p_net, p_qty) * 1000);
  if v_parent is null then
    perform public.erp_raise('ERP_PARTS_SUM', 'no net');
  end if;
  for v_item in select * from jsonb_array_elements(p_parts)
  loop
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_grams := nullif(v_item->>'grams', '')::numeric;
    if v_name = '' and v_grams is null then
      continue;
    end if;
    if v_name = '' or v_grams is null or v_grams < 0 then
      perform public.erp_raise('ERP_PARTS_INVALID');
    end if;
    v_n := v_n + 1;
    if v_n > 10 then
      perform public.erp_raise('ERP_PARTS_COUNT');
    end if;
    v_sum := v_sum + v_grams;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', v_name, 'grams', v_grams));
  end loop;
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  if v_sum <> v_parent then
    perform public.erp_raise('ERP_PARTS_SUM', v_sum::text || ' != ' || v_parent::text);
  end if;
  return v_out;
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
  v_unit text;
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
    v_unit := null;
    if nullif(v_line->>'product_id', '') is not null then
      select base_unit into v_unit from public.erp_products where id = (v_line->>'product_id')::uuid;
    end if;
    insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty, note, raw_name, raw_amount, raw_unit,
                                         methods, net_qty, parts)
    values (v_id, v_i, nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'qty', '')::numeric,
            nullif(btrim(v_line->>'note'), ''), v_line->'raw_name', nullif(v_line->>'raw_amount', '')::numeric,
            nullif(v_line->>'raw_unit', ''), public.erp_line_methods(v_line->'methods'),
            nullif(v_line->>'net_qty', '')::numeric,
            public.erp_line_parts(v_line->'parts', nullif(v_line->>'qty', '')::numeric,
                                  nullif(v_line->>'net_qty', '')::numeric, v_unit));
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
  v_unit text;
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
    select base_unit into v_unit from public.erp_products where id = (v_line->>'product_id')::uuid;
    insert into public.erp_dish_lines (dish_id, line_no, product_id, qty, note, methods, net_qty, parts)
    values (v_id, v_i, (v_line->>'product_id')::uuid, (v_line->>'qty')::numeric, nullif(btrim(v_line->>'note'), ''),
            public.erp_line_methods(v_line->'methods'), nullif(v_line->>'net_qty', '')::numeric,
            public.erp_line_parts(v_line->'parts', (v_line->>'qty')::numeric,
                                  nullif(v_line->>'net_qty', '')::numeric, v_unit));
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

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('erp_line_parts', 'erp_save_recipe', 'erp_save_dish')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
