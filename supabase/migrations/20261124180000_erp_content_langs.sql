-- Extra content languages on cooking steps (instructions jsonb) and catalog names.
-- Additive: keep name_en / name_vn; extra langs live in names jsonb and in instruction lang maps.

alter table public.erp_products
  add column if not exists names jsonb not null default '{}'::jsonb;

alter table public.erp_dishes
  add column if not exists names jsonb not null default '{}'::jsonb;

alter table public.erp_categories
  add column if not exists names jsonb not null default '{}'::jsonb;

comment on column public.erp_products.names is
  'Optional extra display names keyed by 2–5 letter codes (ru, zh, …). English/Vietnamese stay in name_en / name_vn.';
comment on column public.erp_dishes.names is
  'Optional extra display names keyed by 2–5 letter codes. English/Vietnamese stay in name_en / name_vn.';
comment on column public.erp_categories.names is
  'Optional extra display names keyed by 2–5 letter codes. English/Vietnamese stay in name_en / name_vn.';

create or replace function public.erp_sanitize_lang_map(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_key text;
  v_raw jsonb;
  v_val text;
  v_code text;
  v_out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return '{}'::jsonb;
  end if;
  for v_key, v_raw in select key, value from jsonb_each(p)
  loop
    v_code := lower(btrim(replace(v_key, '_', '-')));
    if v_code = 'vi' then
      v_code := 'vn';
    end if;
    if v_code !~ '^[a-z]{2,5}$' then
      continue;
    end if;
    if jsonb_typeof(v_raw) <> 'string' then
      continue;
    end if;
    v_val := left(btrim(v_raw #>> '{}'), 600);
    if v_val <> '' then
      v_out := v_out || jsonb_build_object(v_code, v_val);
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.erp_recipe_lang(p jsonb)
returns jsonb
language sql
immutable
as $$
  select public.erp_sanitize_lang_map(p);
$$;

create or replace function public.erp_extra_names(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(public.erp_sanitize_lang_map(p), '{}'::jsonb) - 'en' - 'vn';
$$;

create or replace function public.erp_set_extra_names(p_kind text, p_id uuid, p_names jsonb)
returns void
language plpgsql
as $$
declare
  v_names jsonb := public.erp_extra_names(p_names);
begin
  if p_kind = 'product' then
    update public.erp_products set names = v_names where id = p_id;
  elsif p_kind = 'dish' then
    update public.erp_dishes set names = v_names where id = p_id;
  elsif p_kind = 'category' then
    update public.erp_categories set names = v_names where id = p_id;
  else
    perform public.erp_raise('ERP_INVALID', 'names_kind');
  end if;
  if not found then
    perform public.erp_raise('ERP_NOT_FOUND');
  end if;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_sanitize_lang_map', 'erp_recipe_lang', 'erp_extra_names', 'erp_set_extra_names'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
