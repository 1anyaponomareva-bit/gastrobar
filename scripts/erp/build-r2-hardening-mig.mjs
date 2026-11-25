import { readFileSync, writeFileSync } from "node:fs";

const e8 = readFileSync("supabase/migrations/20261125180000_erp_production_cost_lineage.sql", "utf8");
const saveMatch = e8.match(/create or replace function public\.erp_vat_adj_save[\s\S]*?^\$\$;/m);
const postMatch = e8.match(/create or replace function public\.erp_vat_adj_post[\s\S]*?^\$\$;/m);
if (!saveMatch || !postMatch) throw new Error("missing fn from 8E");

let save = saveMatch[0];
const nl = save.includes("\r\n") ? "\r\n" : "\n";
const saveNeedle =
  `  if v_reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;${nl}` +
  `  v_preview := public.erp_vat_adj_preview(p);`;
const saveInject =
  `  if v_reason is null then perform public.erp_raise('ERP_INVALID', 'reason'); end if;${nl}` +
  `  -- Backdated gate (company setting default OFF; period close = Release 3)${nl}` +
  `  if coalesce(nullif(p->>'adj_date', '')::date, public.erp_business_today()) < public.erp_business_today() then${nl}` +
  `    if not coalesce((select vat_adj_allow_backdated from public.erp_settings where id = 1), false) then${nl}` +
  `      perform public.erp_raise('ERP_BACKDATED', 'backdated_adjustments_disabled');${nl}` +
  `    end if;${nl}` +
  `    if not v_confirm then${nl}` +
  `      perform public.erp_raise('ERP_BACKDATED', 'confirm_backdated_required');${nl}` +
  `    end if;${nl}` +
  `    if nullif(btrim(coalesce(p->>'reason_note', '')), '') is null then${nl}` +
  `      perform public.erp_raise('ERP_BACKDATED', 'reason_note_required');${nl}` +
  `    end if;${nl}` +
  `  end if;${nl}` +
  `  v_preview := public.erp_vat_adj_preview(p);`;
if (!save.includes(saveNeedle)) throw new Error("save needle missing");
save = save.replace(saveNeedle, saveInject);

let post = postMatch[0];
const pnl = post.includes("\r\n") ? "\r\n" : "\n";
const oldGuardRe =
  /[ \t]*-- Backdated: adj_date before Vietnam today requires explicit confirmation \(no period-close table yet\)\.\r?\n[ \t]*if v_adj\.adj_date < public\.erp_business_today\(\)\r?\n[ \t]*and \(v_adj\.backdated_confirmed_by is null or v_adj\.backdated_confirmed_at is null\) then\r?\n[ \t]*perform public\.erp_raise\('ERP_BACKDATED', 'confirm_backdated_required'\);\r?\n[ \t]*end if;/;
if (!oldGuardRe.test(post)) throw new Error("post guard text not found");
post = post.replace(
  oldGuardRe,
  `  -- Backdated: company setting (default OFF) + confirmation + reason_note. Period close = Release 3.${pnl}` +
    `  if v_adj.adj_date < public.erp_business_today() then${pnl}` +
    `    if not coalesce((select vat_adj_allow_backdated from public.erp_settings where id = 1), false) then${pnl}` +
    `      perform public.erp_raise('ERP_BACKDATED', 'backdated_adjustments_disabled');${pnl}` +
    `    end if;${pnl}` +
    `    if v_adj.backdated_confirmed_by is null or v_adj.backdated_confirmed_at is null then${pnl}` +
    `      perform public.erp_raise('ERP_BACKDATED', 'confirm_backdated_required');${pnl}` +
    `    end if;${pnl}` +
    `    if nullif(btrim(coalesce(v_adj.reason_note, '')), '') is null then${pnl}` +
    `      perform public.erp_raise('ERP_BACKDATED', 'reason_note_required');${pnl}` +
    `    end if;${pnl}` +
    `  end if;`,
);

const prefix = `-- Release 2 pre-production hardening (post-8G owner gates).
-- Additive. Does NOT rewrite historical documents, lots, or sale prices.
-- 1) Tax settings validate against active erp_tax_rates catalog (effective dates).
-- 2) Backdated VAT adjustments disabled by default until explicit company setting.
-- 3) Backdated posts require reason_note + confirmation + audit when setting is on.

alter table public.erp_settings
  add column if not exists vat_adj_allow_backdated boolean not null default false;

comment on column public.erp_settings.vat_adj_allow_backdated is
  'When false (default), posting a VAT cost adjustment with adj_date before Vietnam today is refused. Checkbox alone is not enough. Full financial-period close is Release 3.';

create or replace function public.erp_tax_rate_percent_allowed(
  p_rate numeric,
  p_as_of date default null,
  p_treatment text default null
)
returns boolean
language sql
stable
as $$
  select
    p_rate is not null
    and exists (
      select 1
      from public.erp_tax_rates r
      where r.is_active
        and r.rate = p_rate
        and (
          p_treatment is null
          or nullif(btrim(p_treatment), '') is null
          or r.tax_treatment = p_treatment
        )
        and r.effective_from <= coalesce(p_as_of, (timezone('Asia/Ho_Chi_Minh', now()))::date)
        and (r.effective_to is null or r.effective_to >= coalesce(p_as_of, (timezone('Asia/Ho_Chi_Minh', now()))::date))
    );
$$;

comment on function public.erp_tax_rate_percent_allowed(numeric, date, text) is
  'True when an active catalog rate matches percent (and optional treatment) on as-of date.';

create or replace function public.erp_tax_rate_is_legacy_percent(p_rate numeric)
returns boolean
language sql
stable
as $$
  select public.erp_tax_rate_percent_allowed(p_rate, null, null);
$$;

revoke all on function public.erp_tax_rate_percent_allowed(numeric, date, text) from public, anon, authenticated;
grant execute on function public.erp_tax_rate_percent_allowed(numeric, date, text) to service_role;

create or replace function public.erp_save_settings(p jsonb, p_actor text)
returns void
language plpgsql
as $$
declare
  v_in numeric;
  v_out numeric;
  v_method text;
  v_in_id uuid;
  v_out_id uuid;
  v_recipe_src text;
  v_as_of date := public.erp_business_today();
begin
  if p ? 'default_input_vat_rate' and nullif(p->>'default_input_vat_rate', '') is not null then
    v_in := (p->>'default_input_vat_rate')::numeric;
    if not public.erp_tax_rate_percent_allowed(v_in, v_as_of, null) then
      perform public.erp_raise('ERP_INVALID', 'default_input_vat_rate');
    end if;
  end if;
  if p ? 'default_output_vat_rate' and nullif(p->>'default_output_vat_rate', '') is not null then
    v_out := (p->>'default_output_vat_rate')::numeric;
    if not public.erp_tax_rate_percent_allowed(v_out, v_as_of, null) then
      perform public.erp_raise('ERP_INVALID', 'default_output_vat_rate');
    end if;
  end if;
  if p ? 'vat_accounting_method' then
    v_method := nullif(btrim(p->>'vat_accounting_method'), '');
    if v_method is not null and v_method not in ('cash', 'accrual', 'hybrid', 'unconfirmed') then
      perform public.erp_raise('ERP_INVALID', 'vat_accounting_method');
    end if;
  end if;
  if p ? 'default_input_tax_rate_id' and nullif(p->>'default_input_tax_rate_id', '') is not null then
    v_in_id := (p->>'default_input_tax_rate_id')::uuid;
    if not exists (
      select 1 from public.erp_tax_rates r
      where r.id = v_in_id and r.is_active
        and r.effective_from <= v_as_of
        and (r.effective_to is null or r.effective_to >= v_as_of)
    ) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_input_tax_rate_id');
    end if;
  end if;
  if p ? 'default_output_tax_rate_id' and nullif(p->>'default_output_tax_rate_id', '') is not null then
    v_out_id := (p->>'default_output_tax_rate_id')::uuid;
    if not exists (
      select 1 from public.erp_tax_rates r
      where r.id = v_out_id and r.is_active
        and r.effective_from <= v_as_of
        and (r.effective_to is null or r.effective_to >= v_as_of)
    ) then
      perform public.erp_raise('ERP_NOT_FOUND', 'default_output_tax_rate_id');
    end if;
  end if;

  v_recipe_src := nullif(btrim(coalesce(p->>'recipe_cost_source', '')), '');
  if v_recipe_src is not null and v_recipe_src not in (
    'manual_estimated', 'last_purchase', 'weighted_average', 'estimated_fifo'
  ) then
    perform public.erp_raise('ERP_INVALID', 'recipe_cost_source');
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
    vat_adj_allow_backdated = case
      when p ? 'vat_adj_allow_backdated'
        then coalesce((p->>'vat_adj_allow_backdated')::boolean, vat_adj_allow_backdated)
      else vat_adj_allow_backdated
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

-- ---------------------------------------------------------------------------
-- Backdated VAT adj: patched from Phase 8E bodies
-- ---------------------------------------------------------------------------

`;

const out = prefix + save + "\n\n" + post + "\n";
writeFileSync("supabase/migrations/20261125200000_erp_r2_preprod_hardening.sql", out);
console.log(
  "wrote",
  out.length,
  "save",
  save.includes("backdated_adjustments_disabled"),
  "post",
  post.includes("backdated_adjustments_disabled"),
);
