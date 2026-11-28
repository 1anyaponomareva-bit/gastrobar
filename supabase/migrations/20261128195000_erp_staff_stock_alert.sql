-- Stock control threshold for Prep Stock print alerts (red rows when qty <= alert).

alter table public.erp_products
  add column if not exists staff_stock_alert_qty numeric(12, 4);

comment on column public.erp_products.staff_stock_alert_qty is
  'Prep Stock control: when total (kitchen + warehouse) <= this value, Share PDF highlights the row red (PREP ORDER / FOOD ORDER).';

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
      p.type as product_type,
      coalesce(p.base_unit, '') as base_unit,
      case
        when p.type = 'semi_finished' then coalesce(nullif(btrim(p.order_pack_type), ''), 'bag')
        else null
      end as pack_type,
      case
        when p.type = 'semi_finished'
          and p.order_pack_content_qty is not null
          and p.order_pack_content_qty > 1
          then round(p.order_pack_content_qty)::int
        else null
      end as pack_size,
      case
        when p.type = 'semi_finished'
          then coalesce(nullif(btrim(p.order_pack_content_unit), ''), 'pcs')
        else null
      end as pack_unit,
      case
        when p.type = 'semi_finished' then null
        when nullif(btrim(p.order_pack_type), '') is not null then btrim(p.order_pack_type)
        else coalesce(nullif(btrim(pk.name), ''), nullif(btrim(k.label), ''), 'pack')
      end as purchase_pack_label,
      case
        when p.type = 'semi_finished' then null
        when p.order_pack_content_qty is not null and p.order_pack_content_qty > 0
          then p.order_pack_content_qty
        else k.qty_base
      end as purchase_qty_base,
      case
        when p.type = 'semi_finished' then null
        when p.order_pack_content_qty is not null and p.order_pack_content_qty > 0
          then coalesce(nullif(btrim(p.order_pack_content_unit), ''), p.base_unit, 'kg')
        else coalesce(pk.unit, p.base_unit, 'kg')
      end as purchase_unit,
      case
        when p.staff_stock_alert_qty is not null and p.staff_stock_alert_qty >= 0
          then p.staff_stock_alert_qty
        else null
      end as stock_alert_qty
    from public.erp_products p
    left join public.erp_prep_stock_items m
      on m.id = p.id::text and m.archived_at is null
    left join lateral (
      select kk.*
      from public.erp_product_packs kk
      where kk.product_id = p.id
        and kk.archived_at is null
      order by kk.is_default desc, kk.label
      limit 1
    ) k on true
    left join public.erp_packs pk on pk.id = k.pack_id
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
    where n.nspname = 'public'
      and p.proname = 'erp_prep_stock_catalog'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
