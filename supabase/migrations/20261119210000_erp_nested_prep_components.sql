-- Nested semi-finished products as tech-card components.
-- Additive: no tables dropped, no rows deleted.
-- Recipe lines already reference any erp_products id; this tightens allowed types,
-- unit compatibility, strips processing/cuts on prep SKUs, and copies production
-- output cost onto the finished prep card (est_unit_cost) for the next BOM level.
-- Production posting still consumes document lines as listed (one card level).

create or replace function public.erp_assert_recipe_component(p_component uuid, p_raw_unit text)
returns text
language plpgsql
as $$
declare
  v public.erp_products;
  v_raw text := nullif(lower(btrim(coalesce(p_raw_unit, ''))), '');
begin
  if p_component is null then
    return null;
  end if;
  v := public.erp_check_product(p_component);
  if v.type not in ('ingredient', 'packaging', 'consumable', 'semi_finished', 'finished') then
    perform public.erp_raise('ERP_INVALID', 'component');
  end if;
  if v_raw is not null and public.erp_to_base(1, v_raw, v.base_unit) is null then
    perform public.erp_raise('ERP_UNIT_MISMATCH', v_raw);
  end if;
  return v.base_unit;
end;
$$;

create or replace function public.erp_component_is_prep(p_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.erp_products
    where id = p_id and type in ('semi_finished', 'finished')
  );
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
  v_component uuid;
  v_prep boolean;
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
    instructions = case
      when p ? 'instructions' then coalesce(public.erp_recipe_instructions(p->'instructions'), '[]'::jsonb)
      else coalesce(v_old.instructions, instructions, '[]'::jsonb)
    end,
    shelf_life_days = nullif(p->>'shelf_life_days', '')::integer,
    storage_conditions = nullif(btrim(p->>'storage_conditions'), ''),
    note = nullif(btrim(p->>'note'), ''),
    card_no = case when p ? 'card_no' then nullif(left(btrim(p->>'card_no'), 80), '') else coalesce(card_no, v_old.card_no) end,
    card_date = case when p ? 'card_date' then public.erp_card_date(p->>'card_date') else coalesce(card_date, v_old.card_date) end,
    card_revision = case when p ? 'card_revision' then nullif(left(btrim(p->>'card_revision'), 40), '') else coalesce(card_revision, v_old.card_revision) end,
    photo = case when p ? 'photo' then nullif(btrim(p->>'photo'), '') else coalesce(photo, v_old.photo) end,
    kind = case when p ? 'kind' then public.erp_recipe_kind(p->>'kind') else coalesce(v_old.kind, 'prep') end
  where id = v_id;

  delete from public.erp_recipe_lines where recipe_id = v_id;
  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    v_component := nullif(v_line->>'product_id', '')::uuid;
    v_unit := public.erp_assert_recipe_component(v_component, v_line->>'raw_unit');
    v_prep := v_component is not null and public.erp_component_is_prep(v_component);
    insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty, note, raw_name, raw_amount, raw_unit,
                                         methods, net_qty, parts, is_main)
    values (v_id, v_i, v_component, nullif(v_line->>'qty', '')::numeric,
            nullif(btrim(v_line->>'note'), ''), v_line->'raw_name', nullif(v_line->>'raw_amount', '')::numeric,
            nullif(v_line->>'raw_unit', ''),
            case when v_prep then '{}'::text[] else public.erp_line_methods(v_line->'methods') end,
            case when v_prep then null else nullif(v_line->>'net_qty', '')::numeric end,
            case when v_prep then '[]'::jsonb
                 else public.erp_line_parts(v_line->'parts', nullif(v_line->>'qty', '')::numeric,
                                            nullif(v_line->>'net_qty', '')::numeric, v_unit) end,
            public.erp_json_bool(v_line->'is_main'));
  end loop;

  if (select count(*) from public.erp_recipe_lines where recipe_id = v_id and is_main) > 4 then
    perform public.erp_raise('ERP_INVALID', 'is_main');
  end if;

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
  v_component uuid;
  v_prep boolean;
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
    v_component := (v_line->>'product_id')::uuid;
    v_unit := public.erp_assert_recipe_component(v_component, v_line->>'raw_unit');
    v_prep := public.erp_component_is_prep(v_component);
    insert into public.erp_dish_lines (dish_id, line_no, product_id, qty, note, methods, net_qty, parts, is_main)
    values (v_id, v_i, v_component, (v_line->>'qty')::numeric, nullif(btrim(v_line->>'note'), ''),
            case when v_prep then '{}'::text[] else public.erp_line_methods(v_line->'methods') end,
            case when v_prep then null else nullif(v_line->>'net_qty', '')::numeric end,
            case when v_prep then '[]'::jsonb
                 else public.erp_line_parts(v_line->'parts', (v_line->>'qty')::numeric,
                                            nullif(v_line->>'net_qty', '')::numeric, v_unit) end,
            public.erp_json_bool(v_line->'is_main'));
  end loop;

  if (select count(*) from public.erp_dish_lines where dish_id = v_id and is_main) > 4 then
    perform public.erp_raise('ERP_INVALID', 'is_main');
  end if;

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

-- After a production lot is received, the output prep's card price follows that batch
-- so the next card that uses it as a component can cost it as a warehouse SKU.
create or replace function public.erp_lots_touch_output_est()
returns trigger
language plpgsql
as $$
declare
  v_type text;
  v_output uuid;
begin
  if new.source_document_id is null or new.unit_cost is null then
    return new;
  end if;
  select doc_type, output_product_id into v_type, v_output
  from public.erp_documents where id = new.source_document_id;
  if v_type = 'production' and v_output = new.product_id then
    update public.erp_products
    set est_unit_cost = new.unit_cost, est_cost_source = 'receipt', est_cost_at = now()
    where id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_lots_touch_output_est on public.erp_lots;
create trigger erp_lots_touch_output_est
  after insert on public.erp_lots
  for each row execute function public.erp_lots_touch_output_est();

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_assert_recipe_component', 'erp_component_is_prep', 'erp_save_recipe', 'erp_save_dish',
             'erp_lots_touch_output_est'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
