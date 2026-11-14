-- Prep-card tab (Блюда / Заготовки), same folders as the recipes app.
-- Additive kind on erp_recipes. Keeps header, cooking steps, is_main, parts.

alter table public.erp_recipes
  add column if not exists kind text;

update public.erp_recipes set kind = 'prep' where kind is null or kind not in ('dish', 'prep');

alter table public.erp_recipes
  alter column kind set default 'prep';

alter table public.erp_recipes
  alter column kind set not null;

alter table public.erp_recipes
  drop constraint if exists erp_recipes_kind_chk;

alter table public.erp_recipes
  add constraint erp_recipes_kind_chk check (kind in ('dish', 'prep'));

create or replace function public.erp_recipe_kind(p text)
returns text
language plpgsql
as $$
declare
  v text := lower(btrim(coalesce(p, '')));
begin
  if v in ('dish', 'prep') then
    return v;
  end if;
  perform public.erp_raise('ERP_INVALID', 'kind');
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
    photo = case when p ? 'photo' then nullif(btrim(p->>'photo'), '') else coalesce(photo, v_old.photo) end,
    kind = case when p ? 'kind' then public.erp_recipe_kind(p->>'kind') else coalesce(v_old.kind, 'prep') end
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
                                         methods, net_qty, parts, is_main)
    values (v_id, v_i, nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'qty', '')::numeric,
            nullif(btrim(v_line->>'note'), ''), v_line->'raw_name', nullif(v_line->>'raw_amount', '')::numeric,
            nullif(v_line->>'raw_unit', ''), public.erp_line_methods(v_line->'methods'),
            nullif(v_line->>'net_qty', '')::numeric,
            public.erp_line_parts(v_line->'parts', nullif(v_line->>'qty', '')::numeric,
                                  nullif(v_line->>'net_qty', '')::numeric, v_unit),
            public.erp_json_bool(v_line->'is_main'));
  end loop;

  if (select count(*) from public.erp_recipe_lines where recipe_id = v_id and is_main) > 4 then
    perform public.erp_raise('ERP_INVALID', 'is_main');
  end if;

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
             'erp_recipe_kind', 'erp_save_recipe'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
