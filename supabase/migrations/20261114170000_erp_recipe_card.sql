-- Prep-card screenshot header + structured cooking steps.
-- Additive columns on erp_recipes. Does not touch recipes.json / staff catalog.

alter table public.erp_recipes
  add column if not exists card_no text,
  add column if not exists card_date date,
  add column if not exists card_revision text,
  add column if not exists photo text;

create or replace function public.erp_card_date(p text)
returns date
language plpgsql
as $$
declare
  v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return v::date;
  end if;
  if v ~ '^\d{1,2}[./]\d{1,2}[./]\d{4}$' then
    return to_date(replace(v, '/', '.'), 'DD.MM.YYYY');
  end if;
  perform public.erp_raise('ERP_INVALID', 'card_date');
exception
  when others then
    perform public.erp_raise('ERP_INVALID', 'card_date');
end;
$$;

create or replace function public.erp_recipe_lang(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'en', nullif(left(btrim(coalesce(p->>'en', '')), 600), ''),
      'vn', nullif(left(btrim(coalesce(p->>'vn', '')), 600), ''),
      'ru', nullif(left(btrim(coalesce(p->>'ru', '')), 600), '')
    ))
  end;
$$;

create or replace function public.erp_recipe_instructions(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_step jsonb;
  v_item jsonb;
  v_items jsonb;
  v_out jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_i integer;
  v_line text;
  v_photo text;
  v_title jsonb;
  v_one jsonb;
begin
  if p is null or p = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p) = 'string' then
    v_items := '[]'::jsonb;
    for v_line in select btrim(x) from regexp_split_to_table(replace(p #>> '{}', E'\r', ''), E'\n') as x
    loop
      if v_line <> '' then
        v_items := v_items || jsonb_build_array(jsonb_build_object('en', left(v_line, 600)));
      end if;
    end loop;
    if jsonb_array_length(v_items) = 0 then
      return '[]'::jsonb;
    end if;
    return jsonb_build_array(jsonb_build_object('title', '{}'::jsonb, 'items', v_items));
  end if;
  if jsonb_typeof(p) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_step in select * from jsonb_array_elements(p)
  loop
    v_n := v_n + 1;
    if v_n > 40 then
      perform public.erp_raise('ERP_INVALID', 'instructions');
    end if;
    v_photo := nullif(left(btrim(coalesce(v_step->>'photo', '')), 2000), '');
    v_title := public.erp_recipe_lang(v_step->'title');
    v_items := '[]'::jsonb;
    if jsonb_typeof(v_step->'items') = 'string' then
      for v_line in select btrim(x) from regexp_split_to_table(replace(v_step->>'items', E'\r', ''), E'\n') as x
      loop
        if v_line <> '' then
          v_items := v_items || jsonb_build_array(jsonb_build_object('en', left(v_line, 600)));
        end if;
      end loop;
    elsif jsonb_typeof(v_step->'items') = 'array' then
      v_i := 0;
      for v_item in select * from jsonb_array_elements(v_step->'items')
      loop
        v_i := v_i + 1;
        if v_i > 40 then
          perform public.erp_raise('ERP_INVALID', 'instructions');
        end if;
        if jsonb_typeof(v_item) = 'string' then
          v_line := btrim(v_item #>> '{}');
          if v_line <> '' then
            v_items := v_items || jsonb_build_array(jsonb_build_object('en', left(v_line, 600)));
          end if;
        else
          v_one := public.erp_recipe_lang(v_item);
          if v_one <> '{}'::jsonb then
            v_items := v_items || jsonb_build_array(v_one);
          end if;
        end if;
      end loop;
    end if;
    if v_title = '{}'::jsonb and v_items = '[]'::jsonb and v_photo is null then
      continue;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'title', v_title,
      'photo', v_photo,
      'items', v_items
    )));
  end loop;
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
    photo = case when p ? 'photo' then nullif(btrim(p->>'photo'), '') else coalesce(photo, v_old.photo) end
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

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_card_date', 'erp_recipe_lang', 'erp_recipe_instructions', 'erp_save_recipe'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
