-- Phase 9B RPCs: sales save/post/cancel/refund/match, import stubs, COGS (opt-in consume).
-- NOT applied to production until separate owner OK.

create or replace function public.erp_sales_business_date(
  p_order_at timestamptz,
  p_legal_entity_id uuid default null
)
returns date
language plpgsql
stable
as $$
declare
  v_tz text := 'Asia/Ho_Chi_Minh';
  v_cut time := time '05:00';
  v_local timestamp;
  v_d date;
begin
  if p_legal_entity_id is not null then
    select timezone, business_day_cutoff into v_tz, v_cut
    from public.erp_legal_entities where id = p_legal_entity_id;
  else
    select e.timezone, e.business_day_cutoff into v_tz, v_cut
    from public.erp_settings s
    left join public.erp_legal_entities e on e.id = s.default_legal_entity_id
    where s.id = 1;
  end if;
  v_tz := coalesce(nullif(btrim(v_tz), ''), 'Asia/Ho_Chi_Minh');
  v_cut := coalesce(v_cut, time '05:00');
  v_local := timezone(v_tz, p_order_at);
  v_d := v_local::date;
  if v_local::time < v_cut then
    v_d := v_d - 1;
  end if;
  return v_d;
end;
$$;

create or replace function public.erp_sales_make_canonical_key(
  p_source text,
  p_account_key text,
  p_external_id text
)
returns text
language sql
immutable
as $$
  select lower(btrim(p_source)) || ':' || coalesce(nullif(btrim(p_account_key), ''), '_') || ':' || btrim(p_external_id);
$$;

-- Resolve output VAT for a dish/product using R1 helpers when available.
create or replace function public.erp_sales_resolve_output_vat(
  p_dish_id uuid,
  p_product_id uuid,
  p_gross numeric,
  p_merchant_discount numeric,
  p_platform_discount numeric
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_settings public.erp_settings%rowtype;
  v_rate numeric := 8;
  v_source text := 'company_default';
  v_ex uuid;
  v_taxable numeric;
  v_vat numeric;
  v_net numeric;
  v_base numeric;
  v_incl boolean := true;
begin
  select * into v_settings from public.erp_settings where id = 1;
  v_incl := coalesce(v_settings.output_vat_enabled, true);
  v_rate := coalesce(v_settings.default_output_vat_rate, 8);

  if p_dish_id is not null and to_regclass('public.erp_vat_exceptions') is not null then
    -- Dish-level output exception (Phase 4). Never null out v_rate on miss (SELECT INTO clears targets).
    select ve.id, ve.vat_rate into v_ex, v_rate
    from public.erp_vat_exceptions ve
    where coalesce(ve.direction, 'input') = 'output'
      and coalesce(ve.scope_kind, 'product') = 'dish'
      and ve.dish_id = p_dish_id
    order by ve.updated_at desc nulls last
    limit 1;
    if found then
      v_source := 'dish_exception';
      v_rate := coalesce(v_rate, coalesce(v_settings.default_output_vat_rate, 8));
    else
      v_rate := coalesce(v_settings.default_output_vat_rate, 8);
      select ve.id, ve.vat_rate into v_ex, v_rate
      from public.erp_vat_exceptions ve
      join public.erp_dishes d on d.id = p_dish_id
      where coalesce(ve.direction, 'input') = 'output'
        and coalesce(ve.scope_kind, 'product') = 'category'
        and ve.category_id is not null
        and ve.category_id = d.category_id
      order by ve.updated_at desc nulls last
      limit 1;
      if found then
        v_source := 'category_exception';
        v_rate := coalesce(v_rate, coalesce(v_settings.default_output_vat_rate, 8));
      else
        v_rate := coalesce(v_settings.default_output_vat_rate, 8);
      end if;
    end if;
  end if;

  v_base := greatest(coalesce(p_gross, 0) - coalesce(p_merchant_discount, 0) - coalesce(p_platform_discount, 0), 0);
  if v_incl then
    v_taxable := round(v_base / (1 + coalesce(v_rate, 0) / 100.0), 4);
    v_vat := round(v_base - v_taxable, 4);
    v_net := v_taxable;
  else
    v_taxable := round(v_base, 4);
    v_vat := round(v_taxable * coalesce(v_rate, 0) / 100.0, 4);
    v_net := v_taxable;
  end if;

  return jsonb_build_object(
    'output_vat_rate', v_rate,
    'output_vat_rate_source', v_source,
    'output_vat_exception_id', v_ex,
    'taxable_amount', v_taxable,
    'output_vat_amount', v_vat,
    'net_revenue', v_net,
    'prices_include_vat', v_incl,
    'rule_ref', 'erp_sales_resolve_output_vat@9b'
  );
end;
$$;

create or replace function public.erp_save_sales_document(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_entity uuid;
  v_channel uuid := nullif(p->>'sales_channel_id', '')::uuid;
  v_location uuid := nullif(p->>'business_location_id', '')::uuid;
  v_wh uuid := nullif(p->>'warehouse_id', '')::uuid;
  v_source text := coalesce(nullif(p->>'source_system', ''), 'manual');
  v_ext text := nullif(btrim(coalesce(p->>'external_order_id', '')), '');
  v_account_key text := coalesce(nullif(btrim(coalesce(p->>'account_or_location_key', '')), ''), coalesce(v_location::text, '_'));
  v_canonical text;
  v_order_at timestamptz := coalesce((p->>'order_at')::timestamptz, now());
  v_business_date date;
  v_row public.erp_sales_documents%rowtype;
  v_line jsonb;
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_i int := 0;
  v_vat jsonb;
  v_gross numeric := 0;
  v_mdisc numeric := 0;
  v_pdisc numeric := 0;
  v_taxable numeric := 0;
  v_ovat numeric := 0;
  v_net numeric := 0;
  v_line_id uuid;
  v_dish uuid;
  v_product uuid;
  v_qty numeric;
  v_lgross numeric;
  v_lmdisc numeric;
  v_lpdisc numeric;
begin
  if v_source not in ('manual', 'poster', 'grab', 'import') then
    perform public.erp_raise('ERP_INVALID', 'source_system');
  end if;

  select coalesce(
    nullif(p->>'legal_entity_id', '')::uuid,
    s.default_legal_entity_id,
    (select id from public.erp_legal_entities where lower(code) = 'gastrofood' limit 1)
  ) into v_entity
  from public.erp_settings s where s.id = 1;

  if v_entity is null then perform public.erp_raise('ERP_NOT_FOUND', 'legal_entity'); end if;

  v_canonical := coalesce(
    nullif(btrim(coalesce(p->>'canonical_order_key', '')), ''),
    case when v_ext is not null then public.erp_sales_make_canonical_key(v_source, v_account_key, v_ext) else null end,
    'manual:' || coalesce(nullif(p->>'internal_order_id', ''), replace(gen_random_uuid()::text, '-', ''))
  );

  v_business_date := coalesce(
    nullif(p->>'business_date', '')::date,
    public.erp_sales_business_date(v_order_at, v_entity)
  );

  if v_id is not null then
    select * into v_row from public.erp_sales_documents where id = v_id and deleted_at is null for update;
    if not found then perform public.erp_raise('ERP_NOT_FOUND', 'sales_document'); end if;
    if v_row.order_status not in ('draft') then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
    end if;
    update public.erp_sales_documents set
      legal_entity_id = v_entity,
      business_location_id = v_location,
      sales_channel_id = v_channel,
      warehouse_id = v_wh,
      canonical_order_key = v_canonical,
      external_order_id = v_ext,
      source_system = v_source,
      order_at = v_order_at,
      business_date = v_business_date,
      payment_status = coalesce(nullif(p->>'payment_status', ''), payment_status),
      currency = coalesce(nullif(p->>'currency', ''), currency, 'VND'),
      notes = nullif(p->>'notes', ''),
      poster_payload = case when p ? 'poster_payload' then p->'poster_payload' else poster_payload end,
      grab_payload = case when p ? 'grab_payload' then p->'grab_payload' else grab_payload end,
      updated_at = now(),
      updated_by = v_actor
    where id = v_id;
    delete from public.erp_sales_lines where document_id = v_id;
  else
    insert into public.erp_sales_documents (
      legal_entity_id, business_location_id, sales_channel_id, warehouse_id,
      internal_order_id, canonical_order_key, external_order_id, source_system,
      currency, order_at, business_date, payment_status, notes,
      poster_payload, grab_payload, created_by, updated_by
    ) values (
      v_entity, v_location, v_channel, v_wh,
      coalesce(nullif(p->>'internal_order_id', ''), replace(gen_random_uuid()::text, '-', '')),
      v_canonical, v_ext, v_source,
      coalesce(nullif(p->>'currency', ''), 'VND'),
      v_order_at, v_business_date,
      coalesce(nullif(p->>'payment_status', ''), 'unpaid'),
      nullif(p->>'notes', ''),
      p->'poster_payload', p->'grab_payload',
      v_actor, v_actor
    ) returning id into v_id;
  end if;

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_i := v_i + 1;
    v_dish := nullif(v_line->>'dish_id', '')::uuid;
    v_product := nullif(v_line->>'product_id', '')::uuid;
    v_qty := coalesce((v_line->>'quantity')::numeric, 0);
    if v_qty <= 0 then perform public.erp_raise('ERP_INVALID', 'line_quantity'); end if;
    v_lgross := coalesce((v_line->>'gross_sales')::numeric, 0);
    v_lmdisc := coalesce((v_line->>'merchant_funded_discount')::numeric, 0);
    v_lpdisc := coalesce((v_line->>'platform_funded_discount')::numeric, 0);
    v_vat := public.erp_sales_resolve_output_vat(v_dish, v_product, v_lgross, v_lmdisc, v_lpdisc);

    insert into public.erp_sales_lines (
      document_id, line_no, product_id, dish_id, description, quantity, unit_price,
      gross_sales, merchant_funded_discount, platform_funded_discount,
      taxable_amount, output_vat_rate, output_vat_amount, net_revenue,
      output_vat_rate_source, output_vat_exception_id, output_vat_snapshot,
      modifiers, prep_product_ids
    ) values (
      v_id, coalesce((v_line->>'line_no')::int, v_i), v_product, v_dish,
      nullif(v_line->>'description', ''), v_qty,
      nullif(v_line->>'unit_price', '')::numeric,
      v_lgross, v_lmdisc, v_lpdisc,
      (v_vat->>'taxable_amount')::numeric,
      (v_vat->>'output_vat_rate')::numeric,
      (v_vat->>'output_vat_amount')::numeric,
      (v_vat->>'net_revenue')::numeric,
      v_vat->>'output_vat_rate_source',
      nullif(v_vat->>'output_vat_exception_id', '')::uuid,
      v_vat,
      coalesce(v_line->'modifiers', '[]'::jsonb),
      coalesce(
        (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_line->'prep_product_ids', '[]'::jsonb)) t(x)),
        '{}'::uuid[]
      )
    ) returning id into v_line_id;

    v_gross := v_gross + v_lgross;
    v_mdisc := v_mdisc + v_lmdisc;
    v_pdisc := v_pdisc + v_lpdisc;
    v_taxable := v_taxable + coalesce((v_vat->>'taxable_amount')::numeric, 0);
    v_ovat := v_ovat + coalesce((v_vat->>'output_vat_amount')::numeric, 0);
    v_net := v_net + coalesce((v_vat->>'net_revenue')::numeric, 0);
  end loop;

  -- Header-only draft (no lines): accept explicit totals
  if v_i = 0 then
    v_gross := coalesce((p->>'gross_sales')::numeric, 0);
    v_mdisc := coalesce((p->>'merchant_funded_discount')::numeric, 0);
    v_pdisc := coalesce((p->>'platform_funded_discount')::numeric, 0);
    v_vat := public.erp_sales_resolve_output_vat(null, null, v_gross, v_mdisc, v_pdisc);
    v_taxable := (v_vat->>'taxable_amount')::numeric;
    v_ovat := (v_vat->>'output_vat_amount')::numeric;
    v_net := (v_vat->>'net_revenue')::numeric;
  end if;

  update public.erp_sales_documents set
    gross_sales = v_gross,
    merchant_funded_discount = v_mdisc,
    platform_funded_discount = v_pdisc,
    taxable_amount = v_taxable,
    output_vat_rate = case when v_i = 0 then (v_vat->>'output_vat_rate')::numeric else null end,
    output_vat_amount = v_ovat,
    net_revenue = v_net,
    output_vat_snapshot = case when v_i = 0 then v_vat else output_vat_snapshot end,
    updated_at = now(),
    updated_by = v_actor
  where id = v_id;

  -- Optional exact source link on save
  if v_ext is not null and v_source in ('poster', 'grab', 'import') then
    insert into public.erp_sales_source_links (
      sales_document_id, source_system, external_id, account_or_location_key, match_kind, raw_payload, created_by
    ) values (
      v_id, v_source, v_ext, v_account_key, 'exact',
      coalesce(p->'source_payload', '{}'::jsonb), v_actor
    )
    on conflict (source_system, account_or_location_key, external_id) do update
      set sales_document_id = excluded.sales_document_id,
          match_kind = 'exact',
          raw_payload = excluded.raw_payload
    where erp_sales_source_links.sales_document_id = v_id
       or erp_sales_source_links.match_kind = 'unmatched';
    -- If conflict with another document → raise
    if exists (
      select 1 from public.erp_sales_source_links l
      where l.source_system = v_source
        and l.account_or_location_key = v_account_key
        and l.external_id = v_ext
        and l.sales_document_id <> v_id
    ) then
      perform public.erp_raise('ERP_DUPLICATE', 'source_link');
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.erp_post_sales_document(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_line public.erp_sales_lines%rowtype;
  v_ex uuid[];
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status = 'posted' then
    return p_id; -- idempotent re-post
  end if;
  if v_row.order_status <> 'draft' then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  if not exists (select 1 from public.erp_sales_lines where document_id = p_id)
     and coalesce(v_row.gross_sales, 0) <= 0 then
    perform public.erp_raise('ERP_INVALID', 'empty_sale');
  end if;

  -- Freeze line VAT snapshots already computed; collect exception ids
  select coalesce(array_agg(distinct output_vat_exception_id) filter (where output_vat_exception_id is not null), '{}')
    into v_ex
  from public.erp_sales_lines where document_id = p_id;

  update public.erp_sales_documents set
    order_status = 'posted',
    posted_at = now(),
    posted_by = v_actor,
    output_vat_exception_ids = v_ex,
    output_vat_rule_ref = 'erp_sales_resolve_output_vat@9b',
    output_vat_rate_source = coalesce(
      (select output_vat_rate_source from public.erp_sales_lines where document_id = p_id order by line_no limit 1),
      output_vat_rate_source,
      'company_default'
    ),
    cogs_status = case when cogs_status = 'none' then 'pending' else cogs_status end,
    cogs_pending_reason = coalesce(cogs_pending_reason, 'cogs_not_posted_auto_consume_off'),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  return p_id;
end;
$$;

create or replace function public.erp_cancel_sales_document(p_id uuid, p_actor text, p_reason text default null)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status = 'cancelled' then return p_id; end if;
  if v_row.order_status = 'draft' then
    update public.erp_sales_documents set
      order_status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
      cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      updated_at = now(), updated_by = v_actor
    where id = p_id;
    return p_id;
  end if;
  if v_row.order_status not in ('posted', 'partially_refunded', 'refunded') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  -- Soft cancel keeps history; does not hard-delete. COGS reversal is separate.
  update public.erp_sales_documents set
    order_status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_actor,
    cancel_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'cancelled'),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

-- Partial/full refund: creates reversing money fields; keeps original history.
create or replace function public.erp_refund_sales_document(
  p_id uuid,
  p_actor text,
  p_amount numeric default null,
  p_full boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_amt numeric;
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status not in ('posted', 'partially_refunded') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  v_amt := case when p_full then coalesce(v_row.gross_sales, 0) else coalesce(p_amount, 0) end;
  if v_amt <= 0 then perform public.erp_raise('ERP_INVALID', 'refund_amount'); end if;
  if v_amt > coalesce(v_row.gross_sales, 0) then perform public.erp_raise('ERP_INVALID', 'refund_gt_gross'); end if;

  update public.erp_sales_documents set
    order_status = case when p_full or v_amt >= coalesce(gross_sales, 0) then 'refunded' else 'partially_refunded' end,
    payment_status = case when p_full or v_amt >= coalesce(gross_sales, 0) then 'refunded' else payment_status end,
    notes = trim(both from coalesce(notes, '') || format(E'\nrefund %s by %s at %s', v_amt, v_actor, now())),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

create or replace function public.erp_sales_link_source(
  p_sales_id uuid,
  p_source text,
  p_external_id text,
  p_account_key text,
  p_match_kind text,
  p_payload jsonb,
  p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_key text := coalesce(nullif(btrim(coalesce(p_account_key, '')), ''), '_');
  v_match text := coalesce(nullif(p_match_kind, ''), 'manual');
  v_existing uuid;
  v_id uuid;
begin
  if p_source not in ('poster', 'grab', 'manual', 'import') then
    perform public.erp_raise('ERP_INVALID', 'source_system');
  end if;
  if v_match not in ('exact', 'manual', 'unmatched', 'conflict') then
    perform public.erp_raise('ERP_INVALID', 'match_kind');
  end if;
  if not exists (select 1 from public.erp_sales_documents where id = p_sales_id and deleted_at is null) then
    perform public.erp_raise('ERP_NOT_FOUND', 'sales_document');
  end if;

  select sales_document_id into v_existing
  from public.erp_sales_source_links
  where source_system = p_source and account_or_location_key = v_key and external_id = btrim(p_external_id);

  if v_existing is not null and v_existing <> p_sales_id then
    if v_match <> 'conflict' and v_match <> 'manual' then
      perform public.erp_raise('ERP_DUPLICATE', 'ambiguous_or_existing_link');
    end if;
    update public.erp_sales_source_links set match_kind = 'conflict', raw_payload = coalesce(p_payload, raw_payload)
    where source_system = p_source and account_or_location_key = v_key and external_id = btrim(p_external_id);
    update public.erp_sales_documents set reconciliation_status = 'conflict', updated_at = now(), updated_by = v_actor
    where id in (v_existing, p_sales_id);
    return v_existing;
  end if;

  insert into public.erp_sales_source_links (
    sales_document_id, source_system, external_id, account_or_location_key, match_kind, raw_payload, created_by
  ) values (
    p_sales_id, p_source, btrim(p_external_id), v_key, v_match, p_payload, v_actor
  )
  on conflict (source_system, account_or_location_key, external_id) do update
    set match_kind = excluded.match_kind,
        raw_payload = coalesce(excluded.raw_payload, erp_sales_source_links.raw_payload)
  returning id into v_id;

  update public.erp_sales_documents set
    reconciliation_status = case v_match
      when 'exact' then 'exact_match'
      when 'manual' then 'manual_match'
      when 'conflict' then 'conflict'
      else 'unmatched' end,
    updated_at = now(),
    updated_by = v_actor
  where id = p_sales_id;

  return v_id;
end;
$$;

-- Import stub: validates batch payload shape; does NOT apply historical rows unless explicitly applied later.
create or replace function public.erp_sales_import_stub_validate(
  p_source text,
  p_rows jsonb,
  p_actor text,
  p_file_name text default null
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid;
  v_n int := coalesce(jsonb_array_length(p_rows), 0);
begin
  if p_source not in ('poster', 'grab', 'import') then
    perform public.erp_raise('ERP_INVALID', 'source_system');
  end if;
  insert into public.erp_sales_import_batches (source_system, status, file_name, row_count, notes, created_by)
  values (
    p_source, 'validated', p_file_name, v_n,
    'Phase 9B stub: validated only — no historical apply without owner OK',
    v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

-- COGS posting: default does NOT consume stock. Opt-in p_auto_consume for local tests only.
create or replace function public.erp_sales_post_cogs(
  p_id uuid,
  p_actor text,
  p_auto_consume boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_sales_documents%rowtype;
  v_line public.erp_sales_lines%rowtype;
  v_settings public.erp_settings%rowtype;
  v_allow boolean := false;
  v_wh uuid;
  v_stock_doc uuid;
  v_stock_line uuid;
  v_product uuid;
  v_qty numeric;
  v_taken record;
  v_total numeric := 0;
  v_pending boolean := false;
  v_reason text;
  v_move_id bigint;
begin
  select * into v_row from public.erp_sales_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.order_status not in ('posted', 'partially_refunded') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.order_status);
  end if;
  if v_row.cogs_status = 'posted' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'actual_cogs', v_row.actual_cogs);
  end if;

  select * into v_settings from public.erp_settings where id = 1;
  v_allow := coalesce(p_auto_consume, false) and coalesce(v_settings.sales_auto_consume_stock, false);
  v_wh := v_row.warehouse_id;

  if not v_allow then
    update public.erp_sales_documents set
      cogs_status = 'pending',
      cogs_pending_reason = 'auto_consume_disabled',
      stock_consume_enabled = false,
      updated_at = now(),
      updated_by = v_actor
    where id = p_id;
    update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'auto_consume_disabled'
    where document_id = p_id;
    return jsonb_build_object('ok', true, 'cogs_status', 'pending', 'reason', 'auto_consume_disabled');
  end if;

  if v_wh is null then
    update public.erp_sales_documents set
      cogs_status = 'pending', cogs_pending_reason = 'warehouse_missing', updated_at = now(), updated_by = v_actor
    where id = p_id;
    return jsonb_build_object('ok', false, 'cogs_status', 'pending', 'reason', 'warehouse_missing');
  end if;

  -- Bridge stock document (writeoff) so erp_consume FK is satisfied — one per sale, idempotent.
  if v_row.stock_document_id is null then
    insert into public.erp_documents (
      doc_type, doc_no, status, warehouse_id, doc_date, reason, comment, created_by, updated_by
    ) values (
      'writeoff',
      'SL-' || replace(p_id::text, '-', ''),
      'draft',
      v_wh,
      v_row.business_date,
      'sales_cogs',
      'sales_cogs:' || p_id::text,
      v_actor, v_actor
    ) returning id into v_stock_doc;
    update public.erp_sales_documents set stock_document_id = v_stock_doc where id = p_id;
  else
    v_stock_doc := v_row.stock_document_id;
  end if;

  for v_line in select * from public.erp_sales_lines where document_id = p_id order by line_no
  loop
    -- Prefer prep_product_ids (semi-finished chosen) over exploding raw again.
    if coalesce(array_length(v_line.prep_product_ids, 1), 0) > 0 then
      foreach v_product in array v_line.prep_product_ids
      loop
        v_qty := v_line.quantity;
        begin
          insert into public.erp_document_lines (document_id, line_no, product_id, qty)
          values (v_stock_doc, (select coalesce(max(line_no),0)+1 from public.erp_document_lines where document_id = v_stock_doc), v_product, v_qty)
          returning id into v_stock_line;
          for v_taken in select * from public.erp_consume(v_stock_doc, v_stock_line, v_product, v_wh, v_qty, v_actor)
          loop
            select id into v_move_id from public.erp_movements
            where document_id = v_stock_doc and line_id = v_stock_line and lot_id = v_taken.lot_id
            order by id desc limit 1;
            insert into public.erp_sales_cogs_allocations (
              sales_document_id, sales_line_id, product_id, warehouse_id, lot_id, movement_id,
              qty, unit_cost, amount, created_by
            ) values (
              p_id, v_line.id, v_product, v_wh, v_taken.lot_id, v_move_id,
              v_taken.qty, v_taken.unit_cost,
              case when v_taken.unit_cost is null then null else round(v_taken.qty * v_taken.unit_cost, 4) end,
              v_actor
            );
            v_total := v_total + coalesce(round(v_taken.qty * coalesce(v_taken.unit_cost, 0), 4), 0);
          end loop;
        exception when others then
          if sqlerrm like '%ERP_INSUFFICIENT_STOCK%' or sqlerrm like '%INSUFFICIENT%' then
            v_pending := true;
            v_reason := coalesce(v_reason || '; ', '') || 'insufficient:' || v_product::text;
            update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'insufficient_stock'
            where id = v_line.id;
          else
            raise;
          end if;
        end;
      end loop;
    elsif v_line.product_id is not null then
      v_product := v_line.product_id;
      v_qty := v_line.quantity;
      begin
        insert into public.erp_document_lines (document_id, line_no, product_id, qty)
        values (v_stock_doc, (select coalesce(max(line_no),0)+1 from public.erp_document_lines where document_id = v_stock_doc), v_product, v_qty)
        returning id into v_stock_line;
        for v_taken in select * from public.erp_consume(v_stock_doc, v_stock_line, v_product, v_wh, v_qty, v_actor)
        loop
          select id into v_move_id from public.erp_movements
          where document_id = v_stock_doc and line_id = v_stock_line and lot_id = v_taken.lot_id
          order by id desc limit 1;
          insert into public.erp_sales_cogs_allocations (
            sales_document_id, sales_line_id, product_id, warehouse_id, lot_id, movement_id,
            qty, unit_cost, amount, created_by
          ) values (
            p_id, v_line.id, v_product, v_wh, v_taken.lot_id, v_move_id,
            v_taken.qty, v_taken.unit_cost,
            case when v_taken.unit_cost is null then null else round(v_taken.qty * v_taken.unit_cost, 4) end,
            v_actor
          );
          v_total := v_total + coalesce(round(v_taken.qty * coalesce(v_taken.unit_cost, 0), 4), 0);
        end loop;
        update public.erp_sales_lines set cogs_status = 'posted', actual_cogs = (
          select sum(amount) from public.erp_sales_cogs_allocations where sales_line_id = v_line.id and not is_reversal
        ) where id = v_line.id;
      exception when others then
        if sqlerrm like '%ERP_INSUFFICIENT_STOCK%' or sqlerrm like '%INSUFFICIENT%' then
          v_pending := true;
          v_reason := coalesce(v_reason || '; ', '') || 'insufficient:' || v_product::text;
          update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'insufficient_stock'
          where id = v_line.id;
        else
          raise;
        end if;
      end;
    else
      -- Dish without mapped product/prep: cannot auto-COGS without BOM explosion (future).
      v_pending := true;
      v_reason := coalesce(v_reason || '; ', '') || 'dish_bom_pending:' || coalesce(v_line.dish_id::text, v_line.id::text);
      update public.erp_sales_lines set cogs_status = 'pending', cogs_pending_reason = 'dish_bom_not_expanded'
      where id = v_line.id;
    end if;
  end loop;

  update public.erp_documents set status = 'posted', posted_at = now(), posted_by = v_actor, updated_by = v_actor
  where id = v_stock_doc and status = 'draft';

  update public.erp_sales_documents set
    actual_cogs = v_total,
    cogs_status = case when v_pending then 'partial' else 'posted' end,
    cogs_pending_reason = v_reason,
    stock_consume_enabled = true,
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'actual_cogs', v_total,
    'cogs_status', case when v_pending then 'partial' else 'posted' end,
    'pending_reason', v_reason,
    'stock_document_id', v_stock_doc
  );
end;
$$;

-- Output VAT register (read model)
create or replace function public.erp_sales_output_vat_register(
  p_from date,
  p_to date,
  p_location uuid default null,
  p_channel uuid default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.business_date, r.doc_no, r.id)
    from (
      select
        d.id,
        d.doc_no,
        d.business_date,
        d.order_at,
        d.order_status,
        d.sales_channel_id,
        d.business_location_id,
        d.source_system,
        d.canonical_order_key,
        d.taxable_amount,
        d.output_vat_rate,
        d.output_vat_amount,
        d.net_revenue,
        d.gross_sales,
        d.output_vat_rate_source,
        d.output_vat_rule_ref
      from public.erp_sales_documents d
      where d.deleted_at is null
        and d.order_status in ('posted', 'partially_refunded', 'refunded')
        and d.business_date between p_from and p_to
        and (p_location is null or d.business_location_id = p_location)
        and (p_channel is null or d.sales_channel_id = p_channel)
    ) r
  ), '[]'::jsonb);
end;
$$;

-- Extend erp_load_state with sales slices (wrap previous)
create or replace function public.erp_load_state(p_parts text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  want text[];
  out jsonb := '{}'::jsonb;
  prev jsonb;
begin
  want := string_to_array(nullif(btrim(coalesce(p_parts, '')), ''), ',');

  -- Prefer prior wrapper chain: call finance-extended core if renamed history exists
  if to_regprocedure('public.erp_load_state_core(text)') is not null then
    prev := coalesce(public.erp_load_state_core(p_parts), '{}'::jsonb);
  else
    prev := '{}'::jsonb;
  end if;
  out := prev;

  -- Re-attach finance parts if core is pre-finance (idempotent overwrite OK)
  if want is null or 'financeAccounts' = any(want) then
    out := out || jsonb_build_object(
      'financeAccounts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_accounts r)
    );
  end if;
  if want is null or 'financeCategories' = any(want) then
    out := out || jsonb_build_object(
      'financeCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_categories r)
    );
  end if;
  if want is null or 'financeTransactions' = any(want) then
    out := out || jsonb_build_object(
      'financeTransactions',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc), '[]'::jsonb)
        from (select * from public.erp_finance_transactions order by occurred_at desc limit 10000) r
      )
    );
  end if;
  if want is null or 'financeShifts' = any(want) then
    out := out || jsonb_build_object(
      'financeShifts',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.opened_at desc), '[]'::jsonb)
        from (select * from public.erp_finance_shifts order by opened_at desc limit 2000) r
      )
    );
  end if;
  if want is null or 'financeEmployees' = any(want) then
    out := out || jsonb_build_object(
      'financeEmployees',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from public.erp_finance_employees r)
    );
  end if;
  if want is null or 'financePayroll' = any(want) then
    out := out || jsonb_build_object(
      'financePayroll',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
        from (select * from public.erp_finance_payroll order by period_end desc limit 2000) r
      )
    );
  end if;

  if want is null or 'legalEntities' = any(want) then
    out := out || jsonb_build_object(
      'legalEntities',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.code), '[]'::jsonb) from public.erp_legal_entities r where r.is_active)
    );
  end if;
  if want is null or 'salesDocuments' = any(want) then
    out := out || jsonb_build_object(
      'salesDocuments',
      (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc, r.created_at desc), '[]'::jsonb)
        from (
          select * from public.erp_sales_documents
          where deleted_at is null
          order by business_date desc, created_at desc
          limit 3000
        ) r
      )
    );
  end if;
  if want is null or 'salesLines' = any(want) then
    out := out || jsonb_build_object(
      'salesLines',
      (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
        from (
          select l.* from public.erp_sales_lines l
          join public.erp_sales_documents d on d.id = l.document_id
          where d.deleted_at is null
          order by l.document_id, l.line_no
          limit 20000
        ) r
      )
    );
  end if;
  if want is null or 'salesSourceLinks' = any(want) then
    out := out || jsonb_build_object(
      'salesSourceLinks',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_source_links order by created_at desc limit 10000) r)
    );
  end if;

  return out;
end;
$$;

do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_sales_business_date', 'erp_sales_make_canonical_key', 'erp_sales_resolve_output_vat',
             'erp_save_sales_document', 'erp_post_sales_document', 'erp_cancel_sales_document',
             'erp_refund_sales_document', 'erp_sales_link_source', 'erp_sales_import_stub_validate',
             'erp_sales_post_cogs', 'erp_sales_output_vat_register', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
