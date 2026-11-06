-- Menu / tech-card: planned cost quotes, card history. Additive. No data deleted.
-- Does not change FIFO consume, lots, posted documents, or Staff↔ERP.
-- save_product / save_recipe / save_dish / activate_recipe still do not insert
-- movements or rewrite posted documents; history is a snapshot table only.

-- ---------------------------------------------------------------------------
-- Planned unit prices (tech-card). Unknown cost stays null, never 0.
-- last_lot: newest posted lot (remaining or already consumed).
-- fifo_remaining: weighted remaining lots; any unknown remaining lot → null.
-- reference: product.est_unit_cost (last receipt net or manual).
-- ---------------------------------------------------------------------------

create or replace function public.erp_product_cost_quotes(p_warehouse uuid default null)
returns table (
  product_id uuid,
  last_lot numeric,
  fifo_remaining numeric,
  reference numeric
)
language sql
stable
as $$
  select
    p.id,
    (
      select l.unit_cost
      from public.erp_lots l
      join public.erp_documents d on d.id = l.source_document_id and d.status = 'posted'
      where l.product_id = p.id
        and (p_warehouse is null or l.warehouse_id = p_warehouse)
      order by l.received_at desc, l.created_at desc, l.id desc
      limit 1
    ) as last_lot,
    (
      select case
        when coalesce(sum(l.qty_left), 0) = 0 then null
        when bool_or(l.unit_cost is null) then null
        else sum(l.qty_left * l.unit_cost) / sum(l.qty_left)
      end
      from public.erp_lots l
      where l.product_id = p.id
        and l.qty_left > 0
        and (p_warehouse is null or l.warehouse_id = p_warehouse)
    ) as fifo_remaining,
    p.est_unit_cost as reference
  from public.erp_products p
$$;

create or replace view public.erp_product_cost_quotes_view
with (security_invoker = true)
as
select * from public.erp_product_cost_quotes(null);

-- ---------------------------------------------------------------------------
-- History of product / recipe / dish cards. Not stock, not posted documents.
-- ---------------------------------------------------------------------------

create table if not exists public.erp_card_revisions (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('product', 'recipe', 'dish')),
  entity_id uuid not null,
  saved_at timestamptz not null default now(),
  saved_by text,
  action text not null,
  snapshot jsonb not null
);
create index if not exists erp_card_revisions_entity_idx
  on public.erp_card_revisions (entity, entity_id, saved_at desc);

alter table public.erp_card_revisions enable row level security;
revoke all on public.erp_card_revisions from public, anon, authenticated;
grant all on public.erp_card_revisions to service_role;

create or replace function public.erp_snapshot_card(p_entity text, p_id uuid, p_actor text, p_action text)
returns void
language plpgsql
as $$
declare
  v jsonb;
begin
  if p_id is null or p_entity not in ('product', 'recipe', 'dish') then return; end if;
  if p_entity = 'product' then
    select to_jsonb(p) into v from public.erp_products p where p.id = p_id;
  elsif p_entity = 'recipe' then
    select to_jsonb(r) || jsonb_build_object(
      'lines',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.erp_recipe_lines l where l.recipe_id = r.id), '[]'::jsonb)
    ) into v
    from public.erp_recipes r
    where r.id = p_id;
  else
    select to_jsonb(d) || jsonb_build_object(
      'lines',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.erp_dish_lines l where l.dish_id = d.id), '[]'::jsonb),
      'channel_prices',
      coalesce((select jsonb_agg(jsonb_build_object('channel_id', p.channel_id, 'sale_price', p.sale_price)) from public.erp_dish_channel_prices p where p.dish_id = d.id), '[]'::jsonb)
    ) into v
    from public.erp_dishes d
    where d.id = p_id;
  end if;
  if v is null then return; end if;
  insert into public.erp_card_revisions (entity, entity_id, saved_by, action, snapshot)
  values (p_entity, p_id, p_actor, p_action, v);
end;
$$;

create or replace function public.erp_audit(
  p_actor text, p_entity text, p_entity_id uuid, p_action text, p_reason text default null, p_data jsonb default null
)
returns void
language plpgsql
as $$
begin
  insert into public.erp_audit_log (actor, entity, entity_id, action, reason, data)
  values (p_actor, p_entity, p_entity_id, p_action, p_reason, p_data);
  if p_entity in ('product', 'recipe', 'dish') then
    perform public.erp_snapshot_card(p_entity, p_entity_id, p_actor, p_action);
  end if;
end;
$$;

create or replace function public.erp_card_history(p_entity text, p_id uuid, p_limit integer default 50)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.saved_at desc, r.id desc), '[]'::jsonb)
  from (
    select id, entity, entity_id, saved_at, saved_by, action, snapshot
    from public.erp_card_revisions
    where entity = p_entity and entity_id = p_id
    order by saved_at desc, id desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r;
$$;

-- ---------------------------------------------------------------------------
-- Screen payload: optional costSources part (planned prices, not stock movements).
-- ---------------------------------------------------------------------------

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
      'packs', 'productPacks', 'stock', 'recipes', 'dishes', 'writeoffReasons', 'costSources'
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
  if 'costSources' = any(want) then
    out := out || jsonb_build_object(
      'costSources',
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id', q.product_id,
          'last_lot', q.last_lot,
          'fifo_remaining', q.fifo_remaining,
          'reference', q.reference
        ) order by q.product_id), '[]'::jsonb)
        from public.erp_product_cost_quotes(null) q
      )
    );
  end if;

  return out;
end;
$$;

do $$
declare
  r record;
begin
  execute 'revoke all on public.erp_product_cost_quotes_view from public, anon, authenticated';
  execute 'grant select on public.erp_product_cost_quotes_view to service_role';
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_product_cost_quotes', 'erp_snapshot_card', 'erp_card_history', 'erp_audit', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
