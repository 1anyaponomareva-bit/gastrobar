-- Typed net 0 is a real value (unused garnish, etc.). NULL still means "not set".
-- Additive: only the net_qty check. No rows dropped.

do $$
declare
  r record;
begin
  for r in
    select c.conname, cl.relname
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname in ('erp_recipe_lines', 'erp_dish_lines')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* 'net_qty'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.erp_recipe_lines
  add constraint erp_recipe_lines_net_qty_check check (net_qty is null or net_qty >= 0);

alter table public.erp_dish_lines
  add constraint erp_dish_lines_net_qty_check check (net_qty is null or net_qty >= 0);
