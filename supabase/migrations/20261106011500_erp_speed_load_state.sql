-- Speed: one Postgres round trip for the ERP screen payload (was ~16 PostgREST calls).
-- No data changes. Safe to apply before the Next.js caller: unused until erp_load_state is invoked.

create or replace function public.erp_load_state(p_parts text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  want text[];
  out jsonb := '{}'::jsonb;
begin
  want := string_to_array(nullif(btrim(coalesce(p_parts, '')), ''), ',');
  if want is null then
    want := array[
      'settings', 'categories', 'suppliers', 'warehouses', 'channels', 'products',
      'packs', 'productPacks', 'stock', 'recipes', 'dishes', 'writeoffReasons'
    ];
  end if;

  if 'settings' = any(want) then
    out := out || jsonb_build_object('settings', (select to_jsonb(s) from public.erp_settings s where s.id = 1));
  end if;
  if 'categories' = any(want) then
    out := out || jsonb_build_object(
      'categories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_categories r)
    );
  end if;
  if 'suppliers' = any(want) then
    out := out || jsonb_build_object(
      'suppliers',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_suppliers r)
    );
  end if;
  if 'warehouses' = any(want) then
    out := out || jsonb_build_object(
      'warehouses',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_warehouses r)
    );
  end if;
  if 'channels' = any(want) then
    out := out || jsonb_build_object(
      'channels',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_sales_channels r)
    );
  end if;
  if 'products' = any(want) then
    out := out || jsonb_build_object(
      'products',
      (
        select coalesce(jsonb_agg(to_jsonb(p) order by p.name_en), '[]'::jsonb)
        from (select * from public.erp_products order by name_en limit 5000) p
      )
    );
  end if;
  if 'packs' = any(want) then
    out := out || jsonb_build_object(
      'packs',
      (
        select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select * from public.erp_packs where archived_at is null limit 10000) p
      )
    );
  end if;
  if 'productPacks' = any(want) then
    out := out || jsonb_build_object(
      'productPacks',
      (
        select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (select * from public.erp_product_packs where archived_at is null limit 10000) p
      )
    );
  end if;
  if 'stock' = any(want) then
    out := out || jsonb_build_object(
      'stock',
      (
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
        from (select * from public.erp_stock limit 20000) s
      )
    );
  end if;
  if 'writeoffReasons' = any(want) then
    out := out || jsonb_build_object(
      'writeoffReasons',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_writeoff_reasons r)
    );
  end if;
  if 'recipes' = any(want) then
    out := out || jsonb_build_object(
      'recipes',
      (
        select coalesce(jsonb_agg(row_json order by version), '[]'::jsonb)
        from (
          select rec.version, to_jsonb(rec) || jsonb_build_object(
            'lines',
            coalesce(
              (
                select jsonb_agg(to_jsonb(l) order by l.line_no)
                from public.erp_recipe_lines l
                where l.recipe_id = rec.id
              ),
              '[]'::jsonb
            )
          ) as row_json
          from public.erp_recipes rec
        ) nested
      )
    );
  end if;
  if 'dishes' = any(want) then
    out := out || jsonb_build_object(
      'dishes',
      (
        select coalesce(jsonb_agg(row_json order by name_en), '[]'::jsonb)
        from (
          select rec.name_en, to_jsonb(rec) || jsonb_build_object(
            'lines',
            coalesce(
              (
                select jsonb_agg(to_jsonb(l) order by l.line_no)
                from public.erp_dish_lines l
                where l.dish_id = rec.id
              ),
              '[]'::jsonb
            ),
            'channel_prices',
            coalesce(
              (
                select jsonb_agg(jsonb_build_object('channel_id', p.channel_id, 'sale_price', p.sale_price))
                from public.erp_dish_channel_prices p
                where p.dish_id = rec.id
              ),
              '[]'::jsonb
            )
          ) as row_json
          from public.erp_dishes rec
        ) nested
      )
    );
  end if;

  return out;
end;
$$;

revoke all on function public.erp_load_state(text) from public, anon, authenticated;
grant execute on function public.erp_load_state(text) to service_role;
