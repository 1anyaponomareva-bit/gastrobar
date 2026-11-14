-- Prep-card tabs: Соусы / Полуфабрикаты (was Блюда / Заготовки).
-- Maps dish → sauce. Does not rewrite erp_save_recipe (steps, composition, header stay).

alter table public.erp_recipes
  drop constraint if exists erp_recipes_kind_chk;

update public.erp_recipes set kind = 'sauce' where kind = 'dish';
update public.erp_recipes set kind = 'prep' where kind is null or kind not in ('sauce', 'prep');

alter table public.erp_recipes
  alter column kind set default 'prep';

alter table public.erp_recipes
  add constraint erp_recipes_kind_chk check (kind in ('sauce', 'prep'));

create or replace function public.erp_recipe_kind(p text)
returns text
language plpgsql
as $$
declare
  v text := lower(btrim(coalesce(p, '')));
begin
  if v in ('sauce', 'prep') then
    return v;
  end if;
  if v = 'dish' then
    return 'sauce';
  end if;
  perform public.erp_raise('ERP_INVALID', 'kind');
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'erp_recipe_kind'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
