-- Phase 8F — Recipe costing policy + forecast dish cost snapshots.
-- Additive. Does NOT change FIFO consume, posted lots, historical sales cost, or P&L.
-- Forecast snapshots are display/audit only; never rewrite posted financial registers.

-- ---------------------------------------------------------------------------
-- Centralized tech-card cost source (maps to MenuPriceSource in app).
-- ---------------------------------------------------------------------------

alter table public.erp_settings
  add column if not exists recipe_cost_source text
    not null default 'manual_estimated'
    check (recipe_cost_source in (
      'manual_estimated',
      'last_purchase',
      'weighted_average',
      'estimated_fifo'
    ));

comment on column public.erp_settings.recipe_cost_source is
  'Phase 8F: planned tech-card cost policy. Actual stock write-off remains FIFO via erp_consume.';

-- ---------------------------------------------------------------------------
-- Forecast dish cost history (does not alter historical sale COGS).
-- ---------------------------------------------------------------------------

create table if not exists public.erp_dish_cost_snapshots (
  id bigint generated always as identity primary key,
  dish_id uuid not null references public.erp_dishes (id) on delete cascade,
  calculated_at timestamptz not null default now(),
  calculated_by text,
  cost_source text,
  food_cost numeric,
  packaging_cost numeric,
  total_product_cost numeric,
  cost_complete boolean not null default false,
  change_reason text,
  changed_ingredients jsonb not null default '[]'::jsonb,
  line_breakdown jsonb not null default '[]'::jsonb,
  previous_total numeric,
  notes text
);

create index if not exists erp_dish_cost_snapshots_dish_idx
  on public.erp_dish_cost_snapshots (dish_id, calculated_at desc, id desc);

alter table public.erp_dish_cost_snapshots enable row level security;
revoke all on public.erp_dish_cost_snapshots from public, anon, authenticated;
grant all on public.erp_dish_cost_snapshots to service_role;

create or replace function public.erp_record_dish_cost_snapshot(p jsonb, p_actor text)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
  v_dish uuid := nullif(p->>'dish_id', '')::uuid;
  v_prev numeric;
begin
  if v_dish is null then
    perform public.erp_raise('ERP_BAD_REQUEST', 'dish_id required');
  end if;
  if not exists (select 1 from public.erp_dishes where id = v_dish) then
    perform public.erp_raise('ERP_NOT_FOUND', 'dish');
  end if;

  select s.total_product_cost into v_prev
  from public.erp_dish_cost_snapshots s
  where s.dish_id = v_dish
  order by s.calculated_at desc, s.id desc
  limit 1;

  insert into public.erp_dish_cost_snapshots (
    dish_id, calculated_by, cost_source,
    food_cost, packaging_cost, total_product_cost, cost_complete,
    change_reason, changed_ingredients, line_breakdown, previous_total, notes
  ) values (
    v_dish,
    p_actor,
    nullif(p->>'cost_source', ''),
    nullif(p->>'food_cost', '')::numeric,
    nullif(p->>'packaging_cost', '')::numeric,
    nullif(p->>'total_product_cost', '')::numeric,
    coalesce((p->>'cost_complete')::boolean, false),
    nullif(p->>'change_reason', ''),
    coalesce(p->'changed_ingredients', '[]'::jsonb),
    coalesce(p->'line_breakdown', '[]'::jsonb),
    coalesce(nullif(p->>'previous_total', '')::numeric, v_prev),
    nullif(p->>'notes', '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.erp_dish_cost_history(p_dish uuid, p_limit integer default 20)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.calculated_at desc, r.id desc), '[]'::jsonb)
  from (
    select *
    from public.erp_dish_cost_snapshots
    where dish_id = p_dish
    order by calculated_at desc, id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) r;
$$;

revoke all on function public.erp_record_dish_cost_snapshot(jsonb, text) from public, anon, authenticated;
revoke all on function public.erp_dish_cost_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.erp_record_dish_cost_snapshot(jsonb, text) to service_role;
grant execute on function public.erp_dish_cost_history(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Persist recipe_cost_source via erp_save_settings (extend existing body).
-- ---------------------------------------------------------------------------

create or replace function public.erp_save_settings(p jsonb, p_actor text)
returns void
language plpgsql
as $$
declare
  v_method text;
  v_in_id uuid;
  v_out_id uuid;
  v_recipe_src text;
begin
  if p is null then
    perform public.erp_raise('ERP_BAD_REQUEST', 'settings payload required');
  end if;

  v_method := nullif(btrim(coalesce(p->>'vat_accounting_method', '')), '');
  if v_method is not null and v_method not in ('cash', 'accrual', 'hybrid', 'unconfirmed') then
    perform public.erp_raise('ERP_BAD_REQUEST', 'vat_accounting_method');
  end if;
  if v_method = 'unconfirmed' then
    v_method := null;
  end if;

  v_recipe_src := nullif(btrim(coalesce(p->>'recipe_cost_source', '')), '');
  if v_recipe_src is not null and v_recipe_src not in (
    'manual_estimated', 'last_purchase', 'weighted_average', 'estimated_fifo'
  ) then
    perform public.erp_raise('ERP_BAD_REQUEST', 'recipe_cost_source');
  end if;

  v_in_id := null;
  v_out_id := null;
  if p ? 'default_input_tax_rate_id' and nullif(p->>'default_input_tax_rate_id', '') is not null then
    v_in_id := (p->>'default_input_tax_rate_id')::uuid;
    if not exists (select 1 from public.erp_tax_rates where id = v_in_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_input_tax_rate_id');
    end if;
  end if;
  if p ? 'default_output_tax_rate_id' and nullif(p->>'default_output_tax_rate_id', '') is not null then
    v_out_id := (p->>'default_output_tax_rate_id')::uuid;
    if not exists (select 1 from public.erp_tax_rates where id = v_out_id) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_output_tax_rate_id');
    end if;
  end if;

  update public.erp_settings set
    input_vat_enabled = coalesce((p->>'input_vat_enabled')::boolean, input_vat_enabled),
    output_vat_enabled = coalesce((p->>'output_vat_enabled')::boolean, output_vat_enabled),
    default_input_vat_rate = case when p ? 'default_input_vat_rate'
                                  then coalesce(nullif(p->>'default_input_vat_rate', '')::numeric, 8)
                                  else default_input_vat_rate end,
    default_output_vat_rate = case when p ? 'default_output_vat_rate'
                                  then coalesce(nullif(p->>'default_output_vat_rate', '')::numeric, 8)
                                  else default_output_vat_rate end,
    vat_accounting_method = case when p ? 'vat_accounting_method' then v_method else vat_accounting_method end,
    purchase_prices_include_vat_default = case
      when p ? 'purchase_prices_include_vat_default'
        then coalesce((p->>'purchase_prices_include_vat_default')::boolean, purchase_prices_include_vat_default)
      else purchase_prices_include_vat_default
    end,
    default_input_tax_rate_id = case
      when p ? 'default_input_tax_rate_id' then v_in_id
      when p ? 'default_input_vat_rate' then public.erp_resolve_tax_rate_id(
        coalesce(nullif(p->>'default_input_vat_rate', '')::numeric, 8), 'standard'
      )
      else default_input_tax_rate_id
    end,
    default_output_tax_rate_id = case
      when p ? 'default_output_tax_rate_id' then v_out_id
      when p ? 'default_output_vat_rate' then public.erp_resolve_tax_rate_id(
        coalesce(nullif(p->>'default_output_vat_rate', '')::numeric, 8), 'standard'
      )
      else default_output_tax_rate_id
    end,
    recipe_cost_source = case
      when p ? 'recipe_cost_source' then coalesce(v_recipe_src, recipe_cost_source)
      else recipe_cost_source
    end,
    updated_by = p_actor,
    updated_at = now()
  where id = 1;

  delete from public.erp_vat_exceptions e
  using public.erp_settings s
  where s.id = 1
    and e.direction = 'input'
    and e.vat_rate is not distinct from coalesce(s.default_input_vat_rate, 8);
  delete from public.erp_vat_exceptions e
  using public.erp_settings s
  where s.id = 1
    and e.direction = 'output'
    and e.vat_rate is not distinct from coalesce(s.default_output_vat_rate, 8);

  perform public.erp_audit(p_actor, 'settings', null, 'save', null, p);
end;
$$;
