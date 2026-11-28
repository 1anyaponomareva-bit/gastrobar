-- Expose ERP order packing (pcs per bag) to Prep Stock catalog.

create or replace function public.erp_prep_stock_catalog()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, x.name_en, x.id), '[]'::jsonb)
  from (
    select
      p.id::text as id,
      coalesce(p.name_en, '') as name_en,
      coalesce(
        nullif(btrim(coalesce(p.names->>'ru', '')), ''),
        coalesce(m.name_ru, ''),
        ''
      ) as name_ru,
      coalesce(nullif(btrim(p.name_vn), ''), coalesce(m.name_vn, ''), '') as name_vn,
      coalesce(m.note, '') as note,
      coalesce(m.no_warehouse, false) as no_warehouse,
      coalesce(m.sort_order, p.staff_sort, 0) as sort_order,
      coalesce(nullif(btrim(p.order_pack_type), ''), 'bag') as pack_type,
      case
        when p.order_pack_content_qty is not null and p.order_pack_content_qty > 1
          then round(p.order_pack_content_qty)::int
        else null
      end as pack_size,
      coalesce(nullif(btrim(p.order_pack_content_unit), ''), 'pcs') as pack_unit,
      p.type as product_type
    from public.erp_products p
    left join public.erp_prep_stock_items m
      on m.id = p.id::text and m.archived_at is null
    where coalesce(p.staff_listed, false) = true
      and p.archived_at is null
  ) x;
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'erp_prep_stock_catalog'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
