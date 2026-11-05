-- Inventory counts: period per product, book qty from the ledger, empty fact vs zero,
-- historical counted_at, surplus cost source, intersections, reopen with dependents.
-- Adds columns/tables/functions only. Safe to run again. No existing rows are deleted.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.erp_settings
  add column if not exists timezone text not null default 'Asia/Ho_Chi_Minh';

alter table public.erp_documents
  add column if not exists reason_id uuid,
  add column if not exists doc_time time,
  add column if not exists occurred_at timestamptz,
  add column if not exists counted_at timestamptz,
  add column if not exists count_kind text,
  add column if not exists snapshot_hash text,
  add column if not exists snapshot_movement_max bigint,
  add column if not exists snapshot_at timestamptz,
  add column if not exists superseded_by uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists correction_of uuid,
  add column if not exists count_scope jsonb,
  add column if not exists accept_stale boolean not null default false,
  add column if not exists client_key uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_documents_count_kind_check' and conrelid = 'public.erp_documents'::regclass
  ) then
    alter table public.erp_documents
      add constraint erp_documents_count_kind_check
      check (count_kind is null or count_kind in ('full', 'partial'));
  end if;
end $$;

create unique index if not exists erp_documents_client_key_idx
  on public.erp_documents (client_key) where client_key is not null;
create index if not exists erp_documents_count_wh_idx
  on public.erp_documents (warehouse_id, occurred_at, id)
  where doc_type = 'count';

alter table public.erp_document_lines
  add column if not exists counted boolean not null default true,
  add column if not exists period_start timestamptz,
  add column if not exists opening_qty numeric(18,6),
  add column if not exists in_qty numeric(18,6),
  add column if not exists out_qty numeric(18,6),
  add column if not exists book_qty numeric(18,6),
  add column if not exists last_count_id uuid,
  add column if not exists in_composition_qty numeric(18,6),
  add column if not exists surplus_cost_source text,
  add column if not exists count_mode text,
  add column if not exists count_moves jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_document_lines_surplus_cost_source_check'
      and conrelid = 'public.erp_document_lines'::regclass
  ) then
    alter table public.erp_document_lines
      add constraint erp_document_lines_surplus_cost_source_check
      check (surplus_cost_source is null or surplus_cost_source in ('last_lot', 'product_reference', 'unknown'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_document_lines_count_mode_check'
      and conrelid = 'public.erp_document_lines'::regclass
  ) then
    alter table public.erp_document_lines
      add constraint erp_document_lines_count_mode_check
      check (count_mode is null or count_mode in ('stock', 'explode'));
  end if;
end $$;

create table if not exists public.erp_count_dish_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.erp_documents (id) on delete cascade,
  dish_id uuid not null references public.erp_dishes (id),
  counted boolean not null default false,
  qty numeric(18,6) not null default 0 check (qty >= 0),
  unique (document_id, dish_id)
);

create table if not exists public.erp_count_components (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.erp_documents (id) on delete cascade,
  source_kind text not null check (source_kind in ('dish', 'recipe')),
  source_id uuid not null,
  product_id uuid not null references public.erp_products (id),
  qty numeric(18,6) not null,
  recipe_id uuid,
  unique (document_id, source_kind, source_id, product_id)
);

do $$
begin
  execute 'alter table public.erp_count_dish_lines enable row level security';
  execute 'revoke all on public.erp_count_dish_lines from public, anon, authenticated';
  execute 'grant all on public.erp_count_dish_lines to service_role';
  execute 'alter table public.erp_count_components enable row level security';
  execute 'revoke all on public.erp_count_components from public, anon, authenticated';
  execute 'grant all on public.erp_count_components to service_role';
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Time helpers. Business TZ + (occurred_at, created_at, id) so same-second docs
-- have a single order. Legacy documents use midnight in the business TZ.
-- ---------------------------------------------------------------------------

create or replace function public.erp_business_tz()
returns text
language sql
stable
as $$
  select coalesce(nullif(btrim(timezone), ''), 'Asia/Ho_Chi_Minh') from public.erp_settings where id = 1;
$$;

create or replace function public.erp_parse_at(p text)
returns timestamptz
language sql
stable
as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~* '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then p::timestamptz
    else p::timestamp at time zone public.erp_business_tz()
  end;
$$;

create or replace function public.erp_doc_at(p_doc public.erp_documents)
returns timestamptz
language sql
stable
as $$
  select coalesce(
    p_doc.occurred_at,
    p_doc.counted_at,
    p_doc.doc_date::timestamp at time zone public.erp_business_tz()
  );
$$;

-- ---------------------------------------------------------------------------
-- Last posted count that covered this product on this warehouse before p_at.
-- A partial of another product does not reset this product's period.
-- ---------------------------------------------------------------------------

create or replace function public.erp_count_last(
  p_warehouse uuid, p_product uuid, p_at timestamptz, p_created timestamptz, p_id uuid
)
returns public.erp_documents
language plpgsql
stable
as $$
declare
  v public.erp_documents;
begin
  select d.* into v
  from public.erp_documents d
  join public.erp_document_lines l on l.document_id = d.id
  where d.doc_type = 'count' and d.status = 'posted' and d.warehouse_id = p_warehouse
    and l.product_id = p_product
    and d.superseded_by is null
    and (public.erp_doc_at(d), d.created_at, d.id) < (p_at, coalesce(p_created, p_at), coalesce(p_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by public.erp_doc_at(d) desc, d.created_at desc, d.id desc
  limit 1;
  return v;
end;
$$;

-- Book qty after the previous covering count + posted non-count movements in
-- (previous, current]. Drafts and cancelled documents do not count. Count
-- adjustments are represented by the previous fact, not by their ledger rows.
create or replace function public.erp_count_book(
  p_warehouse uuid, p_product uuid, p_at timestamptz, p_created timestamptz, p_id uuid
)
returns table (
  opening_qty numeric, in_qty numeric, out_qty numeric, book_qty numeric,
  period_start timestamptz, last_count_id uuid, moves jsonb
)
language plpgsql
stable
as $$
declare
  v_last public.erp_documents;
  v_open numeric := 0;
  v_in numeric := 0;
  v_out numeric := 0;
  v_start timestamptz;
  v_moves jsonb := '[]'::jsonb;
  v_created timestamptz := coalesce(p_created, p_at);
  v_id uuid := coalesce(p_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
begin
  v_last := public.erp_count_last(p_warehouse, p_product, p_at, v_created, v_id);
  if v_last.id is not null then
    v_start := public.erp_doc_at(v_last);
    select coalesce(l.qty, 0) into v_open
    from public.erp_document_lines l
    where l.document_id = v_last.id and l.product_id = p_product
    order by l.line_no limit 1;
  end if;

  select
    coalesce(sum(m.qty) filter (where m.qty > 0), 0),
    coalesce(-sum(m.qty) filter (where m.qty < 0), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'document_id', d.id, 'doc_no', d.doc_no, 'doc_type', d.doc_type,
      'occurred_at', public.erp_doc_at(d), 'qty', m.qty,
      'direction', case when m.qty > 0 then 'in' else 'out' end
    ) order by public.erp_doc_at(d), d.created_at, d.id, m.id), '[]'::jsonb)
  into v_in, v_out, v_moves
  from public.erp_movements m
  join public.erp_documents d on d.id = m.document_id
  where m.product_id = p_product and m.warehouse_id = p_warehouse
    and d.status = 'posted' and d.doc_type <> 'count'
    and (public.erp_doc_at(d), d.created_at, d.id) <= (p_at, v_created, v_id)
    and (v_last.id is null or (public.erp_doc_at(d), d.created_at, d.id) > (public.erp_doc_at(v_last), v_last.created_at, v_last.id));

  opening_qty := v_open;
  in_qty := v_in;
  out_qty := v_out;
  book_qty := v_open + v_in - v_out;
  period_start := v_start;
  last_count_id := v_last.id;
  moves := v_moves;
  return next;
end;
$$;

-- Products with posted movement on this warehouse in their own period.
create or replace function public.erp_count_eligible(p_warehouse uuid, p_at timestamptz)
returns table (product_id uuid)
language sql
stable
as $$
  select p.id
  from public.erp_products p
  where p.archived_at is null
    and exists (
      select 1 from public.erp_count_book(p_warehouse, p.id, p_at, p_at, null) b
      where b.in_qty <> 0 or b.out_qty <> 0
    );
$$;

-- Independent warehouse leftover: produced or received as itself. Ingredients of
-- such an item are not exploded again (case A). Case B is recipe/dish conversion.
create or replace function public.erp_count_stocked(p_product uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.erp_documents d
    where d.status = 'posted' and d.doc_type = 'production' and d.output_product_id = p_product
  ) or exists (
    select 1
    from public.erp_document_lines l
    join public.erp_documents d on d.id = l.document_id
    where l.product_id = p_product and d.status = 'posted' and d.doc_type in ('opening', 'receipt')
  );
$$;

create or replace function public.erp_recipe_at(p_product uuid, p_at timestamptz)
returns public.erp_recipes
language plpgsql
stable
as $$
declare
  v public.erp_recipes;
begin
  select * into v
  from public.erp_recipes r
  where r.product_id = p_product and r.status <> 'draft'
    and coalesce(r.activated_at, r.created_at) <= p_at
  order by coalesce(r.activated_at, r.created_at) desc, r.version desc
  limit 1;
  return v;
end;
$$;

-- Explode a recipe or dish into stock products. Stocked preps stop the walk
-- (case A). Missing / unresolved / cyclic tech cards are errors, never guessed.
create or replace function public.erp_count_explode(
  p_kind text, p_source uuid, p_qty numeric, p_at timestamptz, p_seen uuid[]
)
returns table (product_id uuid, qty numeric, recipe_id uuid, source_kind text, source_id uuid)
language plpgsql
stable
as $$
declare
  v_recipe public.erp_recipes;
  v_line record;
  v_scale numeric;
  v_child record;
  v_seen uuid[] := p_seen;
begin
  if p_qty is null or p_qty = 0 then return; end if;
  if p_kind = 'dish' then
    if not exists (select 1 from public.erp_dishes where id = p_source) then
      perform public.erp_raise('ERP_RECIPE_MISSING', 'dish');
    end if;
    if not exists (select 1 from public.erp_dish_lines where dish_id = p_source) then
      perform public.erp_raise('ERP_RECIPE_MISSING', p_source::text);
    end if;
    for v_line in
      select dl.product_id, dl.qty from public.erp_dish_lines dl where dl.dish_id = p_source order by dl.line_no
    loop
      if v_line.product_id is null or v_line.qty is null then
        perform public.erp_raise('ERP_RECIPE_UNRESOLVED', p_source::text);
      end if;
      if public.erp_count_stocked(v_line.product_id)
         or (select type from public.erp_products where id = v_line.product_id)
            not in ('semi_finished', 'finished') then
        product_id := v_line.product_id;
        qty := v_line.qty * p_qty;
        recipe_id := null;
        source_kind := 'dish';
        source_id := p_source;
        return next;
      else
        for v_child in
          select * from public.erp_count_explode('recipe', v_line.product_id, v_line.qty * p_qty, p_at, v_seen)
        loop
          product_id := v_child.product_id;
          qty := v_child.qty;
          recipe_id := v_child.recipe_id;
          source_kind := v_child.source_kind;
          source_id := v_child.source_id;
          return next;
        end loop;
      end if;
    end loop;
    return;
  end if;

  if p_source = any (coalesce(v_seen, '{}'::uuid[])) then
    perform public.erp_raise('ERP_RECIPE_CYCLE', p_source::text);
  end if;
  v_seen := array_append(coalesce(v_seen, '{}'::uuid[]), p_source);
  v_recipe := public.erp_recipe_at(p_source, p_at);
  if v_recipe.id is null then
    perform public.erp_raise('ERP_RECIPE_MISSING', p_source::text);
  end if;
  if not exists (select 1 from public.erp_recipe_lines rl where rl.recipe_id = v_recipe.id) then
    perform public.erp_raise('ERP_RECIPE_MISSING', v_recipe.id::text);
  end if;
  v_scale := p_qty / coalesce(nullif(v_recipe.yield_qty, 0), 1);
  for v_line in
    select rl.product_id, rl.qty from public.erp_recipe_lines rl where rl.recipe_id = v_recipe.id order by rl.line_no
  loop
    if v_line.product_id is null or v_line.qty is null then
      perform public.erp_raise('ERP_RECIPE_UNRESOLVED', v_recipe.id::text);
    end if;
    if public.erp_count_stocked(v_line.product_id)
       or (select type from public.erp_products where id = v_line.product_id)
          not in ('semi_finished', 'finished') then
      product_id := v_line.product_id;
      qty := v_line.qty * v_scale;
      recipe_id := v_recipe.id;
      source_kind := 'recipe';
      source_id := p_source;
      return next;
    else
      for v_child in
        select * from public.erp_count_explode('recipe', v_line.product_id, v_line.qty * v_scale, p_at, v_seen)
      loop
        product_id := v_child.product_id;
        qty := v_child.qty;
        recipe_id := v_child.recipe_id;
        source_kind := v_child.source_kind;
        source_id := v_child.source_id;
        return next;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.erp_count_snapshot_hash(p_lines jsonb)
returns text
language sql
immutable
as $$
  select md5(coalesce((
    select string_agg(coalesce(x->>'product_id', '') || ':' || coalesce(x->>'book_qty', '0'), ',' order by x->>'product_id')
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
  ), ''));
$$;

-- Preview: eligible lines, idle leftovers without movement, exclusions, conflicts.
-- Idle stock is never auto-included and never zeroed. No fictional receipts.
create or replace function public.erp_count_preview(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_wh uuid := nullif(p->>'warehouse_id', '')::uuid;
  v_kind text := coalesce(nullif(p->>'count_kind', ''), 'full');
  v_at timestamptz := coalesce(nullif(p->>'counted_at', '')::timestamptz, now());
  v_ids uuid[] := coalesce(array(select jsonb_array_elements_text(p->'product_ids')::uuid), '{}'::uuid[]);
  v_cats uuid[] := coalesce(array(select jsonb_array_elements_text(p->'category_ids')::uuid), '{}'::uuid[]);
  v_explode uuid[] := coalesce(array(select jsonb_array_elements_text(p->'explode_product_ids')::uuid), '{}'::uuid[]);
  v_lines jsonb := '[]'::jsonb;
  v_idle jsonb := '[]'::jsonb;
  v_excl jsonb := '[]'::jsonb;
  v_replaces jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_comp jsonb := '{}'::jsonb;
  v_row record;
  v_book record;
  v_sel boolean;
  v_max bigint;
  v_dish jsonb;
  v_part record;
  v_mode text;
  v_stocked boolean;
begin
  if v_wh is null then perform public.erp_raise('ERP_WAREHOUSE_REQUIRED', 'warehouse'); end if;
  perform public.erp_check_warehouse(v_wh, 'warehouse');
  if v_kind not in ('full', 'partial') then perform public.erp_raise('ERP_INVALID', 'count_kind'); end if;

  for v_dish in select * from jsonb_array_elements(coalesce(p->'dish_lines', '[]'::jsonb))
  loop
    if coalesce((v_dish->>'counted')::boolean, (v_dish->>'qty') is not null) then
      for v_part in
        select c.product_id, sum(c.qty) as qty
        from public.erp_count_explode('dish', (v_dish->>'dish_id')::uuid, coalesce(nullif(v_dish->>'qty','')::numeric, 0), v_at, '{}'::uuid[]) c
        group by c.product_id
      loop
        v_comp := v_comp || jsonb_build_object(v_part.product_id::text, coalesce((v_comp->>v_part.product_id::text)::numeric, 0) + v_part.qty);
      end loop;
    end if;
  end loop;

  for v_row in
    select p0.id, p0.category_id, p0.name_en, p0.type, p0.archived_at
    from public.erp_products p0
    where p0.id = any (v_explode)
  loop
    v_stocked := public.erp_count_stocked(v_row.id);
    if v_stocked then
      perform public.erp_raise('ERP_COUNT_BOTH_MODES', v_row.name_en);
    end if;
  end loop;

  for v_row in
    select distinct e.product_id as id, pr.category_id, pr.name_en, pr.type, pr.archived_at
    from public.erp_count_eligible(v_wh, v_at) e
    join public.erp_products pr on pr.id = e.product_id
  loop
    select * into v_book from public.erp_count_book(v_wh, v_row.id, v_at, v_at, null);
    if v_book.in_qty = 0 and v_book.out_qty = 0 then
      continue;
    end if;
    v_sel := v_kind = 'full'
      or v_row.id = any (v_ids)
      or (v_row.category_id is not null and v_row.category_id = any (v_cats));
    v_mode := case when v_row.id = any (v_explode) then 'explode' else 'stock' end;
    if v_mode = 'explode' and public.erp_count_stocked(v_row.id) then
      perform public.erp_raise('ERP_COUNT_BOTH_MODES', v_row.name_en);
    end if;
    if v_sel then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_row.id,
        'counted', false,
        'fact_qty', null,
        'book_qty', v_book.book_qty,
        'opening_qty', v_book.opening_qty,
        'in_qty', v_book.in_qty,
        'out_qty', v_book.out_qty,
        'diff_qty', null,
        'period_start', v_book.period_start,
        'last_count_id', v_book.last_count_id,
        'in_composition_qty', coalesce((v_comp->>v_row.id::text)::numeric, 0),
        'count_mode', v_mode,
        'moves', v_book.moves
      ));
    else
      v_excl := v_excl || jsonb_build_array(jsonb_build_object(
        'product_id', v_row.id, 'reason', 'not_selected', 'detail', v_row.name_en
      ));
    end if;
  end loop;

  for v_row in
    select x as id from unnest(v_ids) x
  loop
    if exists (select 1 from jsonb_array_elements(v_lines) l where l->>'product_id' = v_row.id::text) then
      continue;
    end if;
    if not exists (select 1 from public.erp_products where id = v_row.id) then
      v_excl := v_excl || jsonb_build_array(jsonb_build_object('product_id', v_row.id, 'reason', 'not_found'));
    elsif exists (select 1 from public.erp_products where id = v_row.id and archived_at is not null) then
      v_excl := v_excl || jsonb_build_array(jsonb_build_object('product_id', v_row.id, 'reason', 'archived'));
    else
      v_excl := v_excl || jsonb_build_array(jsonb_build_object('product_id', v_row.id, 'reason', 'no_movement_in_period'));
    end if;
  end loop;

  for v_row in
    select s.product_id, s.qty
    from public.erp_stock s
    join public.erp_products pr on pr.id = s.product_id
    where s.warehouse_id = v_wh and s.qty <> 0 and pr.archived_at is null
      and not exists (
        select 1 from jsonb_array_elements(v_lines) l where (l->>'product_id')::uuid = s.product_id
      )
  loop
    v_idle := v_idle || jsonb_build_array(jsonb_build_object(
      'product_id', v_row.product_id, 'qty', v_row.qty, 'reason', 'no_movement_in_period'
    ));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'doc_no', d.doc_no, 'count_kind', d.count_kind, 'counted_at', public.erp_doc_at(d)
    ) order by d.created_at), '[]'::jsonb)
  into v_replaces
  from public.erp_documents d
  where d.doc_type = 'count' and d.status = 'draft' and d.warehouse_id = v_wh
    and d.superseded_by is null
    and v_kind = 'full' and coalesce(d.count_kind, 'partial') = 'partial';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'doc_no', d.doc_no, 'product_id', l.product_id, 'reason', 'already_counted'
    )), '[]'::jsonb)
  into v_conflicts
  from public.erp_documents d
  join public.erp_document_lines l on l.document_id = d.id
  join jsonb_array_elements(v_lines) x on (x->>'product_id')::uuid = l.product_id
  where d.doc_type = 'count' and d.status = 'posted' and d.warehouse_id = v_wh
    and d.superseded_by is null
    and l.last_count_id is not distinct from nullif(x->>'last_count_id', '')::uuid;

  select max(m.id) into v_max
  from public.erp_movements m
  join public.erp_documents d on d.id = m.document_id
  where d.status = 'posted' and m.warehouse_id = v_wh
    and (public.erp_doc_at(d), d.created_at, d.id) <= (v_at, v_at, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);

  return jsonb_build_object(
    'warehouse_id', v_wh,
    'count_kind', v_kind,
    'counted_at', v_at,
    'timezone', public.erp_business_tz(),
    'snapshot_hash', public.erp_count_snapshot_hash(v_lines),
    'snapshot_movement_max', v_max,
    'lines', v_lines,
    'idle', v_idle,
    'excluded', v_excl,
    'replaces', coalesce(v_replaces, '[]'::jsonb),
    'conflicts', coalesce(v_conflicts, '[]'::jsonb),
    'surplus_cost_policy', jsonb_build_object(
      'order', jsonb_build_array('last_lot', 'product_reference', 'unknown'),
      'unknown_is_not_zero', true
    )
  );
end;
$$;

-- Fill book columns on a draft count. Facts already entered are kept.
create or replace function public.erp_count_sync(p_id uuid, p_rebuild boolean default false)
returns void
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_at timestamptz;
  v_prev jsonb := '{}'::jsonb;
  v_line public.erp_document_lines;
  v_book record;
  v_preview jsonb;
  v_item jsonb;
  v_fact numeric;
  v_counted boolean;
  v_mode text;
  v_comp numeric;
  v_i integer := 0;
begin
  select * into v_doc from public.erp_documents where id = p_id;
  if not found or v_doc.doc_type <> 'count' then return; end if;
  v_at := coalesce(v_doc.counted_at, v_doc.occurred_at, public.erp_doc_at(v_doc), now());

  select coalesce(jsonb_object_agg(l.product_id::text, jsonb_build_object(
           'counted', l.counted, 'qty', l.qty, 'pack_id', l.pack_id, 'pack_qty', l.pack_qty,
           'count_mode', l.count_mode
         )), '{}'::jsonb)
  into v_prev
  from public.erp_document_lines l where l.document_id = p_id;

  if exists (select 1 from public.erp_movements where document_id = p_id) then
    p_rebuild := false;
  end if;
  if p_rebuild or not exists (select 1 from public.erp_document_lines where document_id = p_id) then
    v_preview := public.erp_count_preview(jsonb_build_object(
      'warehouse_id', v_doc.warehouse_id,
      'count_kind', coalesce(v_doc.count_kind, 'partial'),
      'counted_at', v_at,
      'product_ids', coalesce(v_doc.count_scope->'product_ids', '[]'::jsonb),
      'category_ids', coalesce(v_doc.count_scope->'category_ids', '[]'::jsonb),
      'explode_product_ids', coalesce(v_doc.count_scope->'explode_product_ids', '[]'::jsonb),
      'dish_lines', coalesce((
        select jsonb_agg(jsonb_build_object('dish_id', dish_id, 'qty', qty, 'counted', counted))
        from public.erp_count_dish_lines where document_id = p_id
      ), '[]'::jsonb)
    ));
    delete from public.erp_document_lines where document_id = p_id;
    for v_item in select * from jsonb_array_elements(v_preview->'lines')
    loop
      v_i := v_i + 1;
      v_counted := coalesce((v_prev->(v_item->>'product_id')->>'counted')::boolean, false);
      v_fact := case when v_counted then coalesce((v_prev->(v_item->>'product_id')->>'qty')::numeric, 0) else 0 end;
      v_mode := coalesce(v_prev->(v_item->>'product_id')->>'count_mode', v_item->>'count_mode');
      insert into public.erp_document_lines (
        document_id, line_no, product_id, qty, counted, pack_id, pack_qty,
        period_start, opening_qty, in_qty, out_qty, book_qty, last_count_id,
        in_composition_qty, count_mode, count_moves, system_qty, diff_qty
      ) values (
        p_id, v_i, (v_item->>'product_id')::uuid, v_fact, v_counted,
        nullif(v_prev->(v_item->>'product_id')->>'pack_id', '')::uuid,
        nullif(v_prev->(v_item->>'product_id')->>'pack_qty', '')::numeric,
        nullif(v_item->>'period_start', '')::timestamptz,
        (v_item->>'opening_qty')::numeric, (v_item->>'in_qty')::numeric, (v_item->>'out_qty')::numeric,
        (v_item->>'book_qty')::numeric, nullif(v_item->>'last_count_id', '')::uuid,
        coalesce((v_item->>'in_composition_qty')::numeric, 0), v_mode, v_item->'moves',
        (v_item->>'book_qty')::numeric,
        case when v_counted then v_fact + coalesce((v_item->>'in_composition_qty')::numeric, 0) - (v_item->>'book_qty')::numeric end
      );
    end loop;
    update public.erp_documents set
      snapshot_hash = v_preview->>'snapshot_hash',
      snapshot_movement_max = nullif(v_preview->>'snapshot_movement_max', '')::bigint,
      snapshot_at = now(),
      counted_at = v_at,
      occurred_at = v_at
    where id = p_id;
    return;
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id
  loop
    select * into v_book from public.erp_count_book(v_doc.warehouse_id, v_line.product_id, v_at, v_doc.created_at, v_doc.id);
    select coalesce(sum(c.qty), 0) into v_comp
    from public.erp_count_components c where c.document_id = p_id and c.product_id = v_line.product_id;
    update public.erp_document_lines set
      period_start = v_book.period_start,
      opening_qty = v_book.opening_qty,
      in_qty = v_book.in_qty,
      out_qty = v_book.out_qty,
      book_qty = v_book.book_qty,
      last_count_id = v_book.last_count_id,
      in_composition_qty = v_comp,
      count_moves = v_book.moves,
      system_qty = v_book.book_qty,
      diff_qty = case when counted then qty + v_comp - v_book.book_qty end
    where id = v_line.id;
  end loop;

  update public.erp_documents set
    snapshot_hash = public.erp_count_snapshot_hash((
      select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'book_qty', book_qty) order by product_id), '[]'::jsonb)
      from public.erp_document_lines where document_id = p_id
    )),
    snapshot_movement_max = (
      select max(m.id) from public.erp_movements m
      join public.erp_documents d on d.id = m.document_id
      where d.status = 'posted' and m.warehouse_id = v_doc.warehouse_id
        and (public.erp_doc_at(d), d.created_at, d.id) <= (v_at, coalesce(v_doc.created_at, v_at), v_doc.id)
    ),
    snapshot_at = now(),
    counted_at = v_at,
    occurred_at = coalesce(v_doc.occurred_at, v_at)
  where id = p_id;
end;
$$;

create or replace function public.erp_count_refresh(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v public.erp_documents;
begin
  select * into v from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v.doc_type <> 'count' then perform public.erp_raise('ERP_INVALID', 'doc_type'); end if;
  if v.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v.doc_no); end if;
  perform public.erp_count_sync(p_id, false);
  perform public.erp_audit(p_actor, 'document', p_id, 'count_refresh');
  return public.erp_count_get(p_id);
end;
$$;

create or replace function public.erp_count_get(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v public.erp_documents;
  v_at timestamptz;
begin
  select * into v from public.erp_documents where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  v_at := coalesce(v.counted_at, public.erp_doc_at(v));
  return jsonb_build_object(
    'id', v.id,
    'doc_no', v.doc_no,
    'status', v.status,
    'warehouse_id', v.warehouse_id,
    'count_kind', coalesce(v.count_kind, 'partial'),
    'counted_at', v_at,
    'occurred_at', public.erp_doc_at(v),
    'timezone', public.erp_business_tz(),
    'snapshot_hash', v.snapshot_hash,
    'snapshot_movement_max', v.snapshot_movement_max,
    'superseded_by', v.superseded_by,
    'correction_of', v.correction_of,
    'lock_version', v.lock_version,
    'total_cost', v.total_cost,
    'cost_known', v.cost_known,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'product_id', l.product_id, 'counted', l.counted,
        'fact_qty', case when l.counted then l.qty end,
        'qty', l.qty,
        'book_qty', l.book_qty, 'opening_qty', l.opening_qty, 'in_qty', l.in_qty, 'out_qty', l.out_qty,
        'diff_qty', l.diff_qty, 'system_qty', l.system_qty,
        'period_start', l.period_start, 'last_count_id', l.last_count_id,
        'in_composition_qty', l.in_composition_qty,
        'surplus_cost_source', l.surplus_cost_source,
        'count_mode', l.count_mode,
        'pack_id', l.pack_id, 'pack_qty', l.pack_qty,
        'cost_amount', l.cost_amount, 'cost_known', l.cost_known,
        'moves', l.count_moves
      ) order by l.line_no)
      from public.erp_document_lines l where l.document_id = p_id
    ), '[]'::jsonb),
    'dish_lines', coalesce((
      select jsonb_agg(jsonb_build_object('dish_id', dish_id, 'qty', qty, 'counted', counted))
      from public.erp_count_dish_lines where document_id = p_id
    ), '[]'::jsonb),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_kind', source_kind, 'source_id', source_id, 'product_id', product_id,
        'qty', qty, 'recipe_id', recipe_id
      ))
      from public.erp_count_components where document_id = p_id
    ), '[]'::jsonb),
    'idle', case when v.status = 'draft' and v.warehouse_id is not null then
      (public.erp_count_preview(jsonb_build_object(
        'warehouse_id', v.warehouse_id,
        'count_kind', coalesce(v.count_kind, 'partial'),
        'counted_at', v_at,
        'product_ids', coalesce(v.count_scope->'product_ids', '[]'::jsonb),
        'category_ids', coalesce(v.count_scope->'category_ids', '[]'::jsonb)
      ))->'idle') else '[]'::jsonb end,
    'surplus_cost_policy', jsonb_build_object(
      'order', jsonb_build_array('last_lot', 'product_reference', 'unknown'),
      'unknown_is_not_zero', true
    )
  );
end;
$$;

create or replace function public.erp_count_rebuild_components(p_id uuid)
returns void
language plpgsql
as $$
declare
  v public.erp_documents;
  v_at timestamptz;
  v_dish public.erp_count_dish_lines;
  v_line public.erp_document_lines;
  v_part record;
begin
  select * into v from public.erp_documents where id = p_id;
  if v.doc_type <> 'count' then return; end if;
  v_at := coalesce(v.counted_at, public.erp_doc_at(v), now());
  delete from public.erp_count_components where document_id = p_id;

  for v_dish in select * from public.erp_count_dish_lines where document_id = p_id and counted
  loop
    for v_part in
      select * from public.erp_count_explode('dish', v_dish.dish_id, v_dish.qty, v_at, '{}'::uuid[])
    loop
      insert into public.erp_count_components (document_id, source_kind, source_id, product_id, qty, recipe_id)
      values (p_id, v_part.source_kind, v_part.source_id, v_part.product_id, v_part.qty, v_part.recipe_id)
      on conflict (document_id, source_kind, source_id, product_id)
      do update set qty = public.erp_count_components.qty + excluded.qty;
    end loop;
  end loop;

  for v_line in select * from public.erp_document_lines where document_id = p_id and count_mode = 'explode' and counted
  loop
    if public.erp_count_stocked(v_line.product_id) then
      perform public.erp_raise('ERP_COUNT_BOTH_MODES', v_line.product_id::text);
    end if;
    for v_part in
      select * from public.erp_count_explode('recipe', v_line.product_id, v_line.qty, v_at, '{}'::uuid[])
    loop
      insert into public.erp_count_components (document_id, source_kind, source_id, product_id, qty, recipe_id)
      values (p_id, v_part.source_kind, v_part.source_id, v_part.product_id, v_part.qty, v_part.recipe_id)
      on conflict (document_id, source_kind, source_id, product_id)
      do update set qty = public.erp_count_components.qty + excluded.qty;
    end loop;
  end loop;
end;
$$;

-- Surplus cost: last known lot on this warehouse, else product estimate, else unknown (never 0).
create or replace function public.erp_count_surplus_cost(p_product uuid, p_warehouse uuid)
returns table (unit_cost numeric, source text)
language plpgsql
stable
as $$
declare
  v_cost numeric;
begin
  select l.unit_cost into v_cost
  from public.erp_lots l
  where l.product_id = p_product and l.warehouse_id = p_warehouse and l.unit_cost is not null
  order by l.received_at desc, l.created_at desc, l.id desc
  limit 1;
  if v_cost is not null then
    unit_cost := v_cost; source := 'last_lot'; return next; return;
  end if;
  select est_unit_cost into v_cost from public.erp_products where id = p_product;
  if v_cost is not null then
    unit_cost := v_cost; source := 'product_reference'; return next; return;
  end if;
  unit_cost := null; source := 'unknown'; return next;
end;
$$;

create or replace function public.erp_post_count(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_at timestamptz;
  v_hash text;
  v_book record;
  v_cost record;
  v_source text;
  v_taken record;
  v_fact numeric;
  v_diff numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_missing text;
  v_conflict text;
  v_live numeric;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type <> 'count' then perform public.erp_raise('ERP_INVALID', 'doc_type'); end if;
  if v_doc.status = 'posted' then
    return jsonb_build_object(
      'id', p_id, 'doc_no', v_doc.doc_no, 'total_cost', v_doc.total_cost,
      'cost_known', v_doc.cost_known, 'idempotent', true
    );
  end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  if v_doc.superseded_by is not null then perform public.erp_raise('ERP_COUNT_SUPERSEDED', v_doc.doc_no); end if;
  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  perform 1 from public.erp_warehouses where id = v_doc.warehouse_id for update;

  v_at := coalesce(v_doc.counted_at, v_doc.occurred_at, public.erp_doc_at(v_doc), now());
  if v_doc.count_kind is null then
    update public.erp_documents set count_kind = 'partial', counted_at = v_at, occurred_at = v_at where id = p_id;
    v_doc.count_kind := 'partial';
  end if;

  perform public.erp_count_rebuild_components(p_id);
  perform public.erp_count_sync(p_id, false);
  select snapshot_hash into v_hash from public.erp_documents where id = p_id;
  if v_doc.snapshot_hash is not null and v_hash is distinct from v_doc.snapshot_hash and not v_doc.accept_stale then
    perform public.erp_raise('ERP_COUNT_STALE', coalesce(v_doc.snapshot_hash, '') || '>' || coalesce(v_hash, ''));
  end if;

  select string_agg(pr.name_en, ', ' order by pr.name_en) into v_missing
  from public.erp_document_lines l
  join public.erp_products pr on pr.id = l.product_id
  where l.document_id = p_id and not l.counted;
  if v_missing is not null then perform public.erp_raise('ERP_COUNT_INCOMPLETE', v_missing); end if;
  if not exists (select 1 from public.erp_document_lines where document_id = p_id) then
    perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no);
  end if;

  select string_agg(distinct d.doc_no || ':' || pr.name_en, ', ') into v_conflict
  from public.erp_document_lines l
  join public.erp_products pr on pr.id = l.product_id
  join public.erp_document_lines o on o.product_id = l.product_id
  join public.erp_documents d on d.id = o.document_id
  where l.document_id = p_id
    and d.id <> p_id and d.doc_type = 'count' and d.status = 'posted' and d.warehouse_id = v_doc.warehouse_id
    and d.superseded_by is null
    and (
      o.last_count_id is not distinct from l.last_count_id
      or public.erp_doc_at(d) = v_at
    )
    and public.erp_doc_at(d) <= v_at
    and not exists (
      select 1 from public.erp_documents later
      join public.erp_document_lines ll on ll.document_id = later.id and ll.product_id = l.product_id
      where later.doc_type = 'count' and later.status = 'posted' and later.warehouse_id = v_doc.warehouse_id
        and later.superseded_by is null
        and public.erp_doc_at(later) > public.erp_doc_at(d)
        and public.erp_doc_at(later) < v_at
    );
  if v_conflict is not null then perform public.erp_raise('ERP_COUNT_OVERLAP', v_conflict); end if;

  if v_doc.count_kind = 'full' then
    update public.erp_documents d set superseded_by = p_id, superseded_at = now(), updated_by = p_actor
    where d.doc_type = 'count' and d.status = 'draft' and d.warehouse_id = v_doc.warehouse_id
      and d.id <> p_id and d.superseded_by is null
      and coalesce(d.count_kind, 'partial') = 'partial';
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_product := public.erp_check_product(v_line.product_id);
    if v_line.count_mode = 'explode' then
      update public.erp_document_lines set
        system_qty = book_qty, diff_qty = 0, cost_amount = 0, cost_known = true, surplus_cost_source = null
      where id = v_line.id;
      continue;
    end if;
    perform 1 from public.erp_lots
    where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0 for update;
    select * into v_book from public.erp_count_book(v_doc.warehouse_id, v_product.id, v_at, v_doc.created_at, v_doc.id);
    v_fact := v_line.qty + coalesce(v_line.in_composition_qty, 0);
    v_diff := v_fact - v_book.book_qty;
    v_line_cost := 0;
    v_line_known := true;
    v_source := null;
    if v_diff < 0 then
      select coalesce(sum(qty_left), 0) into v_live
      from public.erp_lots where product_id = v_product.id and warehouse_id = v_doc.warehouse_id and qty_left > 0;
      if v_live < -v_diff then
        perform public.erp_raise('ERP_COUNT_LATER_STOCK',
          format('%s: need %s, current %s after later movements', v_product.name_en, round(-v_diff, 3), round(v_live, 3)));
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, -v_diff, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost - v_taken.qty * v_taken.unit_cost; end if;
      end loop;
    elsif v_diff > 0 then
      select * into v_cost from public.erp_count_surplus_cost(v_product.id, v_doc.warehouse_id);
      v_source := v_cost.source;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_diff, v_cost.unit_cost,
                                     v_doc.doc_no, null, v_at, null, p_actor);
      v_line_known := v_cost.unit_cost is not null;
      v_line_cost := case when v_cost.unit_cost is null then 0 else v_diff * v_cost.unit_cost end;
    end if;
    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      system_qty = v_book.book_qty, book_qty = v_book.book_qty, diff_qty = v_diff,
      opening_qty = v_book.opening_qty, in_qty = v_book.in_qty, out_qty = v_book.out_qty,
      period_start = v_book.period_start, last_count_id = v_book.last_count_id,
      count_moves = v_book.moves,
      cost_amount = case when v_line_known then v_line_cost else null end,
      cost_known = v_line_known,
      surplus_cost_source = v_source
    where id = v_line.id;
    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  update public.erp_documents set
    status = 'posted', posted_at = now(), posted_by = p_actor,
    counted_at = v_at, occurred_at = v_at,
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known,
    accept_stale = false
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known, 'idempotent', false);
end;
$$;

-- Reopen a posted count for correction. Regular save of a posted count stays blocked.
-- Later covering counts are dependents: refuse, or cascade (later first).
create or replace function public.erp_reopen_count(p_id uuid, p_actor text, p_cascade boolean, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_open text;
  v_deps uuid[];
  v_dep uuid;
  v_blockers text;
  v_mov public.erp_movements;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then perform public.erp_raise('ERP_REASON_REQUIRED'); end if;
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type <> 'count' then perform public.erp_raise('ERP_INVALID', 'doc_type'); end if;
  if v_doc.status <> 'posted' then perform public.erp_raise('ERP_NOT_POSTED', v_doc.doc_no); end if;
  perform 1 from public.erp_warehouses where id = v_doc.warehouse_id for update;

  select array_agg(d.id order by public.erp_doc_at(d) desc, d.created_at desc, d.id desc) into v_deps
  from public.erp_documents d
  join public.erp_document_lines l on l.document_id = d.id
  where d.doc_type = 'count' and d.status = 'posted' and d.warehouse_id = v_doc.warehouse_id
    and d.id <> p_id and d.superseded_by is null
    and l.last_count_id = p_id;
  if v_deps is not null and not p_cascade then
    perform public.erp_raise('ERP_COUNT_HAS_DEPENDENTS', array_to_string(v_deps, ','));
  end if;

  select d.doc_no into v_open
  from public.erp_documents d
  where d.doc_type = 'count' and d.status = 'draft' and d.warehouse_id = v_doc.warehouse_id
    and d.superseded_by is null and d.id <> p_id
    and (v_deps is null or not (d.id = any (v_deps)))
    and exists (
      select 1 from public.erp_document_lines l
      join public.erp_document_lines mine on mine.document_id = p_id and mine.product_id = l.product_id
      where l.document_id = d.id
    )
  limit 1;
  if v_open is not null and not p_cascade then perform public.erp_raise('ERP_COUNT_EDIT_OPEN', v_open); end if;
  if v_deps is not null then
    foreach v_dep in array v_deps
    loop
      perform public.erp_reopen_count(v_dep, p_actor, true, p_reason);
    end loop;
  end if;

  perform 1 from public.erp_lots where source_document_id = p_id for update;
  select string_agg(distinct d.doc_no, ', ') into v_blockers
  from public.erp_lots l
  join public.erp_movements m on m.lot_id = l.id and m.document_id <> p_id and m.qty < 0
  join public.erp_documents d on d.id = m.document_id and d.status = 'posted'
  where l.source_document_id = p_id;
  if v_blockers is not null then
    perform public.erp_raise('ERP_COUNT_REOPEN_BLOCKED', v_blockers);
  end if;

  perform set_config('erp.reopen_count', '1', true);

  for v_mov in select * from public.erp_movements where document_id = p_id and reversal_of is null order by id
  loop
    update public.erp_lots set qty_left = qty_left - v_mov.qty where id = v_mov.lot_id;
    insert into public.erp_movements (document_id, line_id, lot_id, product_id, warehouse_id, qty, unit_cost, amount,
                                      reversal_of, created_by)
    values (p_id, v_mov.line_id, v_mov.lot_id, v_mov.product_id, v_mov.warehouse_id, -v_mov.qty, v_mov.unit_cost,
            -v_mov.amount, v_mov.id, p_actor);
  end loop;

  update public.erp_documents set
    status = 'draft', posted_at = null, posted_by = null,
    cancelled_at = null, cancelled_by = null, cancel_reason = null,
    total_cost = null, cost_known = null,
    lock_version = lock_version + 1, updated_by = p_actor
  where id = p_id;
  perform public.erp_audit(p_actor, 'document', p_id, 'reopen', btrim(p_reason),
    jsonb_build_object('doc_no', v_doc.doc_no, 'cascade', p_cascade));
  return public.erp_count_get(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft save: count metadata, nullable fact, no movements.
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_document(p_doc jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p_doc->>'id', '')::uuid;
  v_type text := p_doc->>'doc_type';
  v_key uuid := nullif(p_doc->>'client_key', '')::uuid;
  v_reason uuid := nullif(p_doc->>'reason_id', '')::uuid;
  v_existing public.erp_documents;
  v_prefix text;
  v_line jsonb;
  v_dish jsonb;
  v_i integer := 0;
  v_counted boolean;
  v_qty numeric;
  v_tz text := public.erp_business_tz();
  v_date date;
  v_at timestamptz;
  v_has_moves boolean := false;
  v_pid uuid;
begin
  if v_id is null and v_key is not null then
    select id into v_id from public.erp_documents where client_key = v_key;
  end if;
  if v_id is not null then
    select * into v_existing from public.erp_documents where id = v_id for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
    if v_existing.status = 'posted' and v_key is not null and v_existing.client_key is not distinct from v_key then
      perform public.erp_raise('ERP_ALREADY_POSTED', v_existing.doc_no);
    end if;
    if v_existing.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_existing.doc_no); end if;
    if p_doc ? 'lock_version' and (p_doc->>'lock_version')::integer <> v_existing.lock_version then
      perform public.erp_raise('ERP_STALE');
    end if;
    v_type := v_existing.doc_type;
  elsif v_type not in ('opening', 'receipt', 'transfer', 'writeoff', 'count', 'production') then
    perform public.erp_raise('ERP_INVALID', 'doc_type');
  end if;

  if v_reason is not null and to_regclass('public.erp_writeoff_reasons') is not null
     and (v_id is null or v_existing.reason_id is distinct from v_reason) then
    perform 1 from public.erp_writeoff_reasons where id = v_reason and archived_at is null;
    if not found then perform public.erp_raise('ERP_REASON_ARCHIVED'); end if;
  end if;

  if v_id is null then
    v_prefix := case v_type when 'opening' then 'OB' when 'receipt' then 'RC' when 'transfer' then 'TR'
                            when 'writeoff' then 'WO' when 'count' then 'IC' else 'PR' end;
    insert into public.erp_documents (doc_no, doc_type, client_key, created_by, updated_by)
    values (v_prefix || '-' || lpad(nextval('public.erp_document_no_seq')::text, 6, '0'), v_type, v_key, p_actor, p_actor)
    returning id into v_id;
  end if;

  v_at := coalesce(public.erp_parse_at(p_doc->>'occurred_at'), public.erp_parse_at(p_doc->>'counted_at'));
  v_date := coalesce(
    nullif(p_doc->>'doc_date', '')::date,
    (v_at at time zone v_tz)::date,
    current_date
  );
  v_at := coalesce(v_at, v_date::timestamp at time zone v_tz);

  update public.erp_documents set
    doc_date = v_date,
    occurred_at = v_at,
    counted_at = case when v_type = 'count' then v_at else counted_at end,
    doc_time = coalesce(nullif(p_doc->>'doc_time', '')::time, (v_at at time zone v_tz)::time, doc_time),
    reason_id = v_reason,
    count_kind = case when v_type = 'count' then coalesce(nullif(p_doc->>'count_kind', ''), count_kind, 'partial') else count_kind end,
    count_scope = case when v_type = 'count' then coalesce(p_doc->'count_scope', count_scope) else count_scope end,
    accept_stale = coalesce((p_doc->>'accept_stale')::boolean, accept_stale),
    correction_of = coalesce(nullif(p_doc->>'correction_of', '')::uuid, correction_of),
    warehouse_id = nullif(p_doc->>'warehouse_id', '')::uuid,
    target_warehouse_id = nullif(p_doc->>'target_warehouse_id', '')::uuid,
    supplier_id = nullif(p_doc->>'supplier_id', '')::uuid,
    reason = nullif(btrim(p_doc->>'reason'), ''),
    comment = nullif(btrim(p_doc->>'comment'), ''),
    prices_include_vat = coalesce((p_doc->>'prices_include_vat')::boolean, false),
    recipe_id = nullif(p_doc->>'recipe_id', '')::uuid,
    output_product_id = nullif(p_doc->>'output_product_id', '')::uuid,
    plan_output_qty = nullif(p_doc->>'plan_output_qty', '')::numeric,
    output_qty = nullif(p_doc->>'output_qty', '')::numeric,
    output_pieces = nullif(p_doc->>'output_pieces', '')::integer,
    output_weight_kg = nullif(p_doc->>'output_weight_kg', '')::numeric,
    batch_no = nullif(btrim(p_doc->>'batch_no'), ''),
    expires_at = nullif(p_doc->>'expires_at', '')::date,
    responsible = nullif(btrim(p_doc->>'responsible'), ''),
    lock_version = lock_version + 1,
    updated_by = p_actor
  where id = v_id;

  select exists (select 1 from public.erp_movements where document_id = v_id) into v_has_moves;
  if not v_has_moves then
    delete from public.erp_document_lines where document_id = v_id;
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_doc->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    if v_type = 'count' then
      if v_line ? 'counted' then
        v_counted := coalesce((v_line->>'counted')::boolean, false);
      elsif v_line ? 'fact_qty' then
        v_counted := nullif(v_line->>'fact_qty', '') is not null;
      elsif v_line ? 'qty' then
        v_counted := true;
      else
        v_counted := false;
      end if;
      v_qty := case
        when v_line ? 'fact_qty' then coalesce(nullif(v_line->>'fact_qty', '')::numeric, 0)
        else coalesce(nullif(v_line->>'qty', '')::numeric, 0)
      end;
    else
      v_counted := true;
      v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    end if;
    v_pid := (v_line->>'product_id')::uuid;
    if v_has_moves then
      update public.erp_document_lines set
        line_no = v_i, qty = v_qty, counted = v_counted,
        planned_qty = nullif(v_line->>'planned_qty', '')::numeric,
        pack_id = nullif(v_line->>'pack_id', '')::uuid,
        pack_qty = nullif(v_line->>'pack_qty', '')::numeric,
        unit_price = nullif(v_line->>'unit_price', '')::numeric,
        vat_rate = nullif(v_line->>'vat_rate', '')::numeric,
        batch_no = nullif(btrim(v_line->>'batch_no'), ''),
        expires_at = nullif(v_line->>'expires_at', '')::date,
        reason = nullif(btrim(v_line->>'reason'), ''),
        count_mode = nullif(v_line->>'count_mode', '')
      where document_id = v_id and product_id = v_pid;
      if not found then
        insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                               unit_price, vat_rate, batch_no, expires_at, reason, count_mode)
        values (v_id, v_i, v_pid, v_qty, v_counted,
                nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
                nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
                nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
                nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''),
                nullif(v_line->>'count_mode', ''));
      end if;
    else
      insert into public.erp_document_lines (document_id, line_no, product_id, qty, counted, planned_qty, pack_id, pack_qty,
                                             unit_price, vat_rate, batch_no, expires_at, reason, count_mode)
      values (v_id, v_i, v_pid, v_qty, v_counted,
              nullif(v_line->>'planned_qty', '')::numeric, nullif(v_line->>'pack_id', '')::uuid,
              nullif(v_line->>'pack_qty', '')::numeric, nullif(v_line->>'unit_price', '')::numeric,
              nullif(v_line->>'vat_rate', '')::numeric, nullif(btrim(v_line->>'batch_no'), ''),
              nullif(v_line->>'expires_at', '')::date, nullif(btrim(v_line->>'reason'), ''),
              nullif(v_line->>'count_mode', ''));
    end if;
  end loop;

  if v_type = 'count' then
    delete from public.erp_count_dish_lines where document_id = v_id;
    for v_dish in select * from jsonb_array_elements(coalesce(p_doc->'dish_lines', '[]'::jsonb))
    loop
      insert into public.erp_count_dish_lines (document_id, dish_id, counted, qty)
      values (
        v_id, (v_dish->>'dish_id')::uuid,
        coalesce((v_dish->>'counted')::boolean, nullif(v_dish->>'qty', '') is not null),
        coalesce(nullif(v_dish->>'qty', '')::numeric, 0)
      )
      on conflict (document_id, dish_id) do update set counted = excluded.counted, qty = excluded.qty;
    end loop;
    perform public.erp_count_rebuild_components(v_id);
    perform public.erp_count_sync(v_id, coalesce((p_doc->>'rebuild_lines')::boolean, false));
  end if;

  perform public.erp_audit(p_actor, 'document', v_id, 'save');
  return v_id;
end;
$$;

create or replace function public.erp_post_document(p_id uuid, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_doc public.erp_documents;
  v_settings public.erp_settings;
  v_line public.erp_document_lines;
  v_product public.erp_products;
  v_out public.erp_products;
  v_taken record;
  v_now timestamptz := now();
  v_qty numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_rate numeric;
  v_unit_cost numeric;
  v_line_cost numeric;
  v_line_known boolean;
  v_total numeric := 0;
  v_known boolean := true;
  v_current numeric;
  v_diff numeric;
  v_lines integer := 0;
  v_batch text;
  v_expires date;
  v_at timestamptz;
begin
  select * into v_doc from public.erp_documents where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_doc.doc_type = 'count' then
    return public.erp_post_count(p_id, p_actor);
  end if;
  if v_doc.status = 'posted' then perform public.erp_raise('ERP_ALREADY_POSTED', v_doc.doc_no); end if;
  if v_doc.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_doc.doc_no); end if;
  select * into v_settings from public.erp_settings where id = 1;
  v_at := coalesce(v_doc.occurred_at, v_doc.doc_date::timestamp at time zone public.erp_business_tz(), v_now);

  perform public.erp_check_warehouse(v_doc.warehouse_id, 'warehouse');
  if v_doc.doc_type in ('transfer', 'production') then
    perform public.erp_check_warehouse(v_doc.target_warehouse_id, 'target_warehouse');
  end if;
  if v_doc.doc_type = 'transfer' and v_doc.warehouse_id = v_doc.target_warehouse_id then
    perform public.erp_raise('ERP_SAME_WAREHOUSE');
  end if;
  if v_doc.doc_type = 'production' then
    if v_doc.output_product_id is null then perform public.erp_raise('ERP_INVALID', 'output_product_id'); end if;
    if v_doc.output_qty is null then perform public.erp_raise('ERP_INVALID', 'output_qty'); end if;
    v_out := public.erp_check_product(v_doc.output_product_id);
  end if;

  for v_line in select * from public.erp_document_lines where document_id = p_id order by line_no for update
  loop
    v_lines := v_lines + 1;
    v_product := public.erp_check_product(v_line.product_id);
    v_qty := v_line.qty;
    v_line_cost := 0;
    v_line_known := true;
    v_net := null; v_vat := null; v_gross := null; v_current := null; v_diff := null;

    if v_doc.doc_type in ('opening', 'receipt') then
      if v_qty <= 0 then perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en); end if;
      if v_line.unit_price is null then
        v_unit_cost := null;
      else
        v_rate := coalesce(v_line.vat_rate, v_settings.default_input_vat_rate, 0);
        if v_settings.input_vat_enabled and v_doc.doc_type = 'receipt' then
          if v_doc.prices_include_vat then
            v_gross := round(v_qty * v_line.unit_price, 4);
            v_net := round(v_gross / (1 + v_rate / 100), 4);
          else
            v_net := round(v_qty * v_line.unit_price, 4);
            v_gross := round(v_net * (1 + v_rate / 100), 4);
          end if;
          v_vat := v_gross - v_net;
        else
          v_net := round(v_qty * v_line.unit_price, 4);
          v_gross := v_net;
          v_vat := 0;
        end if;
        v_unit_cost := v_net / v_qty;
      end if;
      perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, v_unit_cost,
                                     coalesce(v_line.batch_no, v_doc.doc_no), v_line.expires_at, v_at, null, p_actor);
      v_line_known := v_unit_cost is not null;
      v_line_cost := v_net;
      if v_doc.doc_type = 'receipt' and v_unit_cost is not null then
        update public.erp_products
        set est_unit_cost = v_unit_cost, est_cost_source = 'receipt', est_cost_at = v_now, updated_by = p_actor
        where id = v_product.id;
      end if;

    elsif v_doc.doc_type in ('transfer', 'writeoff', 'production') then
      if v_qty <= 0 then
        if v_doc.doc_type = 'production' then continue; end if;
        perform public.erp_raise('ERP_INVALID_QTY', v_product.name_en);
      end if;
      for v_taken in select * from public.erp_consume(p_id, v_line.id, v_product.id, v_doc.warehouse_id, v_qty, p_actor)
      loop
        if v_taken.unit_cost is null then v_line_known := false;
        else v_line_cost := v_line_cost + v_taken.qty * v_taken.unit_cost; end if;
        if v_doc.doc_type = 'transfer' then
          perform public.erp_receive_lot(p_id, v_line.id, v_product.id, v_doc.target_warehouse_id, v_taken.qty,
                                         v_taken.unit_cost, v_taken.batch_no, v_taken.expires_at,
                                         v_taken.received_at, v_taken.origin_lot_id, p_actor);
        end if;
      end loop;
    end if;

    v_line_cost := round(v_line_cost, 4);
    update public.erp_document_lines set
      net_amount = v_net, vat_amount = v_vat, gross_amount = v_gross,
      system_qty = v_current, diff_qty = v_diff,
      cost_amount = case when v_line_known then v_line_cost else null end,
      unit_cost = case when v_line_known and v_qty > 0 then round(v_line_cost / v_qty, 6) else null end,
      cost_known = v_line_known
    where id = v_line.id;

    if v_line_known then v_total := v_total + v_line_cost; else v_known := false; end if;
  end loop;

  if v_lines = 0 then perform public.erp_raise('ERP_EMPTY_DOCUMENT', v_doc.doc_no); end if;

  if v_doc.doc_type = 'production' then
    v_batch := coalesce(v_doc.batch_no, v_doc.doc_no);
    v_expires := coalesce(v_doc.expires_at,
                          case when v_out.shelf_life_days is null then null else v_doc.doc_date + v_out.shelf_life_days end);
    v_unit_cost := case when v_known then round(v_total / v_doc.output_qty, 6) else null end;
    perform public.erp_receive_lot(p_id, null, v_out.id, v_doc.target_warehouse_id, v_doc.output_qty, v_unit_cost,
                                   v_batch, v_expires, v_at, null, p_actor);
    update public.erp_documents set output_unit_cost = v_unit_cost, batch_no = v_batch, expires_at = v_expires
    where id = p_id;
  end if;

  update public.erp_documents set
    status = 'posted', posted_at = v_now, posted_by = p_actor,
    occurred_at = coalesce(occurred_at, v_at),
    total_cost = case when v_known then round(v_total, 4) else null end,
    cost_known = v_known
  where id = p_id;

  perform public.erp_audit(p_actor, 'document', p_id, 'post', null,
    jsonb_build_object('doc_no', v_doc.doc_no, 'total_cost', case when v_known then v_total end, 'cost_known', v_known));
  return jsonb_build_object('id', p_id, 'doc_no', v_doc.doc_no, 'total_cost',
                            case when v_known then round(v_total, 4) end, 'cost_known', v_known);
end;
$$;

create or replace function public.erp_documents_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', old.doc_no); end if;
    return old;
  end if;
  if old.status = 'posted' and new.status = 'draft' and old.doc_type = 'count'
     and current_setting('erp.reopen_count', true) = '1' then
    return new;
  end if;
  if old.status = 'cancelled' or (old.status = 'posted' and new.status <> 'cancelled') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', old.doc_no);
  end if;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'erp\_count%' or p.proname in (
             'erp_business_tz', 'erp_parse_at', 'erp_doc_at', 'erp_recipe_at', 'erp_save_document', 'erp_post_document', 'erp_post_count'
           ))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
