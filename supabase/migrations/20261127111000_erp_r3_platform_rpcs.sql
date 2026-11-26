-- Phase 9D RPCs: platform import pipeline, settlements, payouts, dashboard.
-- Raw GrabMerchant parse requires active column map (owner sample). Normalized v1 always allowed.

create or replace function public.erp_platform_oct2026_fixture_math()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'gross_sales', 434904005,
    'merchant_discounts', 764000,
    'net_sales', 434904005 - 764000,
    'channel_commission', 85240734,
    'marketing', 30349488,
    'chargebacks', 76347,
    'net_earnings_after_marketing',
      (434904005 - 764000) - 85240734 - 30349488 - 76347,
    'checks', jsonb_build_object(
      'net_sales_ok', (434904005 - 764000) = 434140005,
      'earnings_ok', ((434904005 - 764000) - 85240734 - 30349488 - 76347) = 318473436
    ),
    'vat_note', 'Commission and advertising VAT unverified — do not mark deductible'
  );
$$;

-- Create / update platform account
create or replace function public.erp_save_platform_account(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if v_id is null then
    insert into public.erp_platform_accounts (
      platform_code, merchant_id, store_id, display_name, legal_entity_id, business_location_id,
      sales_channel_id, currency, is_active, notes, created_by, updated_by
    ) values (
      coalesce(nullif(p->>'platform_code', ''), 'grab'),
      btrim(p->>'merchant_id'),
      nullif(btrim(coalesce(p->>'store_id', '')), ''),
      coalesce(nullif(p->>'display_name', ''), btrim(p->>'merchant_id')),
      nullif(p->>'legal_entity_id', '')::uuid,
      nullif(p->>'business_location_id', '')::uuid,
      nullif(p->>'sales_channel_id', '')::uuid,
      coalesce(nullif(p->>'currency', ''), 'VND'),
      coalesce((p->>'is_active')::boolean, true),
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_platform_accounts set
      display_name = coalesce(nullif(p->>'display_name', ''), display_name),
      store_id = coalesce(nullif(btrim(coalesce(p->>'store_id', '')), ''), store_id),
      legal_entity_id = coalesce(nullif(p->>'legal_entity_id', '')::uuid, legal_entity_id),
      business_location_id = coalesce(nullif(p->>'business_location_id', '')::uuid, business_location_id),
      sales_channel_id = coalesce(nullif(p->>'sales_channel_id', '')::uuid, sales_channel_id),
      is_active = coalesce((p->>'is_active')::boolean, is_active),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Upload batch metadata (no auto-apply). Duplicate file sha blocked.
create or replace function public.erp_platform_import_upload(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid;
  v_sha text := nullif(btrim(coalesce(p->>'file_sha256', '')), '');
  v_fmt text := coalesce(nullif(p->>'source_format', ''), 'normalized_json_v1');
  v_platform text := coalesce(nullif(p->>'platform_code', ''), 'grab');
  v_existing uuid;
begin
  if v_fmt in ('grab_merchant_csv', 'grab_merchant_xlsx') then
    if not exists (
      select 1 from public.erp_platform_column_maps
      where platform_code = v_platform and is_active
    ) then
      perform public.erp_raise('ERP_INVALID', 'grab_column_map_missing_provide_sample');
    end if;
  end if;

  if v_sha is not null then
    select id into v_existing
    from public.erp_platform_import_batches
    where platform_code = v_platform and file_sha256 = v_sha
      and status not in ('rejected', 'failed')
    limit 1;
    if v_existing is not null then
      perform public.erp_raise('ERP_DUPLICATE', 'import_file_sha256');
    end if;
  end if;

  insert into public.erp_platform_import_batches (
    platform_account_id, platform_code, source_format, status,
    file_name, file_sha256, file_storage_ref, notes, created_by, updated_by
  ) values (
    nullif(p->>'platform_account_id', '')::uuid,
    v_platform, v_fmt, 'uploaded',
    nullif(p->>'file_name', ''),
    v_sha,
    nullif(p->>'file_storage_ref', ''),
    nullif(p->>'notes', ''),
    v_actor, v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Parse+validate+preview in one step from normalized rows (client parses CSV/JSON first).
-- Does NOT apply. Status → preview (or failed).
create or replace function public.erp_platform_import_preview(p_batch_id uuid, p_rows jsonb, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_batch public.erp_platform_import_batches%rowtype;
  v_row jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_i int := 0;
  v_ok int := 0;
  v_ext text;
  v_op text;
  v_dup int;
  v_preview jsonb := '[]'::jsonb;
  v_gross numeric := 0;
  v_mdisc numeric := 0;
  v_nsales numeric := 0;
  v_comm numeric := 0;
  v_ads numeric := 0;
  v_cb numeric := 0;
  v_earn numeric := 0;
  v_has_gross boolean;
  v_has_mdisc boolean;
  v_has_nsales boolean;
begin
  select * into v_batch from public.erp_platform_import_batches where id = p_batch_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'import_batch'); end if;
  if v_batch.status in ('applied', 'confirmed') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_batch.status);
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_i := v_i + 1;
    v_ext := nullif(btrim(coalesce(v_row->>'external_order_id', '')), '');
    v_op := nullif(btrim(coalesce(v_row->>'operation_key', '')), '');
    if v_op is null then
      v_op := coalesce(v_batch.platform_code, 'grab') || ':' || coalesce(v_ext, 'row' || v_i::text) || ':' || coalesce(v_row->>'line_kind', 'order');
    end if;

    if v_row ? 'gross_sales' and v_row->>'gross_sales' is not null and btrim(v_row->>'gross_sales') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_i, 'error', 'empty_gross_sales_string'));
      continue;
    end if;

    -- Duplicate operation already applied?
    select count(*) into v_dup from public.erp_platform_settlement_lines where operation_key = v_op and not is_duplicate;
    if v_dup > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row', v_i, 'error', 'duplicate_operation', 'operation_key', v_op));
      -- still show in preview as duplicate candidate
      v_preview := v_preview || jsonb_build_array(v_row || jsonb_build_object('operation_key', v_op, '_duplicate', true));
      continue;
    end if;

    v_ok := v_ok + 1;
    v_preview := v_preview || jsonb_build_array(v_row || jsonb_build_object('operation_key', v_op, '_duplicate', false));

    if v_row ? 'gross_sales' and nullif(v_row->>'gross_sales', '') is not null then
      v_gross := v_gross + (v_row->>'gross_sales')::numeric; v_has_gross := true;
    end if;
    if v_row ? 'merchant_funded_discount' and nullif(v_row->>'merchant_funded_discount', '') is not null then
      v_mdisc := v_mdisc + (v_row->>'merchant_funded_discount')::numeric; v_has_mdisc := true;
    end if;
    if v_row ? 'net_sales' and nullif(v_row->>'net_sales', '') is not null then
      v_nsales := v_nsales + (v_row->>'net_sales')::numeric; v_has_nsales := true;
    end if;
    if v_row ? 'platform_commission' and nullif(v_row->>'platform_commission', '') is not null then
      v_comm := v_comm + (v_row->>'platform_commission')::numeric;
    end if;
    if v_row ? 'advertising_expense' and nullif(v_row->>'advertising_expense', '') is not null then
      v_ads := v_ads + (v_row->>'advertising_expense')::numeric;
    end if;
    if v_row ? 'chargeback_amount' and nullif(v_row->>'chargeback_amount', '') is not null then
      v_cb := v_cb + (v_row->>'chargeback_amount')::numeric;
    end if;
    if v_row ? 'net_earnings' and nullif(v_row->>'net_earnings', '') is not null then
      v_earn := v_earn + (v_row->>'net_earnings')::numeric;
    end if;
  end loop;

  update public.erp_platform_import_batches set
    status = case when jsonb_array_length(v_errors) > 0 and v_ok = 0 then 'failed' else 'preview' end,
    row_count = v_i,
    error_count = jsonb_array_length(v_errors),
    validation_errors = v_errors,
    preview = jsonb_build_object(
      'rows', v_preview,
      'totals', jsonb_build_object(
        'gross_sales', case when v_has_gross then v_gross else null end,
        'merchant_funded_discounts', case when v_has_mdisc then v_mdisc else null end,
        'net_sales', case when v_has_nsales then v_nsales else null end,
        'platform_commission', nullif(v_comm, 0),
        'advertising_expenses', nullif(v_ads, 0),
        'chargebacks', nullif(v_cb, 0),
        'net_earnings', nullif(v_earn, 0)
      ),
      'note', 'Missing fields stay null — never auto-zeroed'
    ),
    updated_at = now(),
    updated_by = v_actor
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'status', (select status from public.erp_platform_import_batches where id = p_batch_id),
    'row_count', v_i,
    'ok_count', v_ok,
    'error_count', jsonb_array_length(v_errors),
    'errors', v_errors,
    'preview_totals', (select preview->'totals' from public.erp_platform_import_batches where id = p_batch_id)
  );
end;
$$;

create or replace function public.erp_platform_import_confirm(p_batch_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_batch public.erp_platform_import_batches%rowtype;
begin
  select * into v_batch from public.erp_platform_import_batches where id = p_batch_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_batch.status not in ('preview', 'reconciled', 'validated', 'parsed') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_batch.status);
  end if;
  update public.erp_platform_import_batches set
    status = 'confirmed', confirmed_at = now(), confirmed_by = v_actor, updated_at = now(), updated_by = v_actor
  where id = p_batch_id;
  return p_batch_id;
end;
$$;

-- Apply confirmed batch → settlement + lines. Idempotent on settlement_key / operation_key.
-- Does NOT create sales revenue docs; links to existing 9B sales when exact grab source link exists.
-- Does NOT create FIFO consume. Creates Pending Input VAT expense rows only when commission/ads present and apply_vat flag.
create or replace function public.erp_platform_import_apply(
  p_batch_id uuid,
  p_actor text,
  p_settlement_key text default null,
  p_create_vat_expenses boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_batch public.erp_platform_import_batches%rowtype;
  v_acct public.erp_platform_accounts%rowtype;
  v_settlement uuid;
  v_key text;
  v_row jsonb;
  v_lines jsonb;
  v_created int := 0;
  v_skipped int := 0;
  v_linked int := 0;
  v_op text;
  v_ext text;
  v_line_id uuid;
  v_sales uuid;
  v_match text;
  v_poster_gross numeric;
  v_grab_gross numeric;
  v_diff numeric;
  v_tot jsonb;
  v_exp uuid;
begin
  select * into v_batch from public.erp_platform_import_batches where id = p_batch_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_batch.status = 'applied' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'batch_id', p_batch_id);
  end if;
  if v_batch.status <> 'confirmed' then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'must_confirm_before_apply:' || v_batch.status);
  end if;

  if v_batch.platform_account_id is not null then
    select * into v_acct from public.erp_platform_accounts where id = v_batch.platform_account_id;
  else
    select * into v_acct from public.erp_platform_accounts
    where platform_code = v_batch.platform_code and is_active
    order by created_at limit 1;
  end if;
  if v_acct.id is null then perform public.erp_raise('ERP_NOT_FOUND', 'platform_account'); end if;

  v_key := coalesce(nullif(p_settlement_key, ''), v_batch.platform_code || ':' || v_acct.merchant_id || ':batch:' || p_batch_id::text);
  v_tot := coalesce(v_batch.preview->'totals', '{}'::jsonb);
  v_lines := coalesce(v_batch.preview->'rows', '[]'::jsonb);

  select id into v_settlement from public.erp_platform_settlements where settlement_key = v_key and status <> 'cancelled';
  if v_settlement is null then
    insert into public.erp_platform_settlements (
      platform_account_id, import_batch_id, legal_entity_id, business_location_id, sales_channel_id,
      settlement_key, settlement_date, currency,
      gross_sales, merchant_funded_discounts, net_sales,
      platform_commission, advertising_expenses, chargebacks, net_earnings_after_marketing,
      commission_vat_status, advertising_vat_status,
      status, is_estimated, source_payload, created_by, updated_by, posted_at, posted_by
    ) values (
      v_acct.id, p_batch_id, v_acct.legal_entity_id, v_acct.business_location_id, v_acct.sales_channel_id,
      v_key,
      coalesce(
        nullif(v_tot->>'settlement_date', '')::date,
        (
          select min(nullif(x->>'settlement_date', '')::date)
          from jsonb_array_elements(v_lines) t(x)
        ),
        current_date
      ),
      coalesce(v_acct.currency, 'VND'),
      nullif(v_tot->>'gross_sales', '')::numeric,
      nullif(v_tot->>'merchant_funded_discounts', '')::numeric,
      nullif(v_tot->>'net_sales', '')::numeric,
      nullif(v_tot->>'platform_commission', '')::numeric,
      nullif(v_tot->>'advertising_expenses', '')::numeric,
      nullif(v_tot->>'chargebacks', '')::numeric,
      nullif(v_tot->>'net_earnings', '')::numeric,
      'unverified', 'unverified',
      'posted', false, v_batch.preview, v_actor, v_actor, now(), v_actor
    ) returning id into v_settlement;
  end if;

  for v_row in select * from jsonb_array_elements(v_lines)
  loop
    if coalesce((v_row->>'_duplicate')::boolean, false) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_op := v_row->>'operation_key';
    v_ext := nullif(btrim(coalesce(v_row->>'external_order_id', '')), '');
    if exists (select 1 from public.erp_platform_settlement_lines where operation_key = v_op and not is_duplicate) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_sales := null;
    v_match := 'unmatched';
    v_diff := null;
    v_poster_gross := null;
    v_grab_gross := nullif(v_row->>'gross_sales', '')::numeric;

    if v_ext is not null then
      select l.sales_document_id into v_sales
      from public.erp_sales_source_links l
      where l.source_system = 'grab'
        and l.external_id = v_ext
        and l.account_or_location_key = coalesce(v_acct.merchant_id, '_')
      limit 1;
      if v_sales is not null then
        select gross_sales into v_poster_gross from public.erp_sales_documents where id = v_sales;
        if v_grab_gross is not null and v_poster_gross is not null and abs(v_grab_gross - v_poster_gross) > 1 then
          v_match := 'conflict';
          v_diff := round(v_grab_gross - v_poster_gross, 4);
        else
          v_match := 'matched';
          v_diff := 0;
        end if;
        v_linked := v_linked + 1;
      end if;
    end if;

    insert into public.erp_platform_settlement_lines (
      settlement_id, import_batch_id, line_kind, external_order_id, operation_key,
      order_at, settlement_date, raw_values,
      gross_sales, merchant_funded_discount, platform_funded_discount, net_sales,
      platform_commission, commission_vat, advertising_expense, advertising_vat,
      service_fee, refund_amount, chargeback_amount, financial_adjustment, net_earnings,
      sales_document_id, canonical_order_key, match_status, match_diff, match_reason,
      advertising_campaign, advertising_source, vat_deduction_status, created_by
    ) values (
      v_settlement, p_batch_id,
      coalesce(nullif(v_row->>'line_kind', ''), 'order'),
      v_ext, v_op,
      nullif(v_row->>'order_at', '')::timestamptz,
      nullif(v_row->>'settlement_date', '')::date,
      v_row->'raw_values',
      nullif(v_row->>'gross_sales', '')::numeric,
      nullif(v_row->>'merchant_funded_discount', '')::numeric,
      nullif(v_row->>'platform_funded_discount', '')::numeric,
      nullif(v_row->>'net_sales', '')::numeric,
      nullif(v_row->>'platform_commission', '')::numeric,
      nullif(v_row->>'commission_vat', '')::numeric,
      nullif(v_row->>'advertising_expense', '')::numeric,
      nullif(v_row->>'advertising_vat', '')::numeric,
      nullif(v_row->>'service_fee', '')::numeric,
      nullif(v_row->>'refund_amount', '')::numeric,
      nullif(v_row->>'chargeback_amount', '')::numeric,
      nullif(v_row->>'financial_adjustment', '')::numeric,
      nullif(v_row->>'net_earnings', '')::numeric,
      v_sales,
      case when v_ext is not null then 'grab:' || coalesce(v_acct.merchant_id, '_') || ':' || v_ext else null end,
      v_match, v_diff,
      case when v_match = 'conflict' then 'gross_mismatch_poster_vs_grab' else null end,
      nullif(v_row->>'advertising_campaign', ''),
      nullif(v_row->>'advertising_source', ''),
      case
        when nullif(v_row->>'commission_vat', '') is not null or nullif(v_row->>'advertising_vat', '') is not null
          then 'unverified'
        else 'unverified'
      end,
      v_actor
    ) returning id into v_line_id;
    v_created := v_created + 1;

    if v_match in ('matched', 'conflict', 'unmatched') then
      insert into public.erp_platform_reconciliation (
        platform_account_id, kind, status, settlement_id, settlement_line_id, sales_document_id,
        poster_amount, grab_amount, difference, reason, created_by, updated_by
      ) values (
        v_acct.id, 'order_match', v_match, v_settlement, v_line_id, v_sales,
        v_poster_gross, v_grab_gross, v_diff,
        case when v_match = 'conflict' then 'gross_mismatch' when v_match = 'unmatched' then 'no_grab_sales_link' else null end,
        v_actor, v_actor
      );
    end if;
  end loop;

  -- Optional: Pending Input VAT expenses for commission + ads totals (9C) — never deductible/auto from forecast
  if p_create_vat_expenses then
    if nullif(v_tot->>'platform_commission', '') is not null then
      v_exp := public.erp_save_expense_document(jsonb_build_object(
        'expense_category', 'platform_commission',
        'description', 'Grab commission settlement ' || v_key,
        'transaction_date', coalesce((v_tot->>'settlement_date'), current_date::text),
        'net_amount', (v_tot->>'platform_commission')::numeric,
        'tax_rate', 0,
        'vat_amount', 0,
        'gross_amount', (v_tot->>'platform_commission')::numeric,
        'vat_deduction_status', 'pending',
        'platform_source', 'grab',
        'platform_fee_kind', 'commission',
        'notes', 'VAT unverified — Pending until tax invoice'
      ), v_actor);
      perform public.erp_post_expense_document(v_exp, v_actor);
    end if;
    if nullif(v_tot->>'advertising_expenses', '') is not null then
      v_exp := public.erp_save_expense_document(jsonb_build_object(
        'expense_category', 'platform_advertising',
        'description', 'Grab advertising settlement ' || v_key,
        'transaction_date', coalesce((v_tot->>'settlement_date'), current_date::text),
        'net_amount', (v_tot->>'advertising_expenses')::numeric,
        'tax_rate', 0,
        'vat_amount', 0,
        'gross_amount', (v_tot->>'advertising_expenses')::numeric,
        'vat_deduction_status', 'pending',
        'platform_source', 'grab',
        'platform_fee_kind', 'advertising',
        'notes', 'VAT unverified — Pending until tax invoice; do not double-count ads report'
      ), v_actor);
      perform public.erp_post_expense_document(v_exp, v_actor);
    end if;
  end if;

  update public.erp_platform_import_batches set
    status = 'applied', applied_at = now(), applied_by = v_actor, updated_at = now(), updated_by = v_actor
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'settlement_id', v_settlement,
    'lines_created', v_created,
    'lines_skipped_duplicate', v_skipped,
    'sales_linked', v_linked,
    'note', 'No sales revenue created; no FIFO consume; Net Earnings ≠ bank payout'
  );
end;
$$;

-- Payout + allocations; optional link to existing cashbook tx (no duplicate cash)
create or replace function public.erp_platform_save_payout(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_key text := coalesce(nullif(p->>'payout_key', ''), 'payout:' || coalesce(p->>'payout_reference', gen_random_uuid()::text));
  v_alloc jsonb;
  v_sum numeric := 0;
begin
  if v_id is null then
    select id into v_id from public.erp_platform_payouts where payout_key = v_key and status <> 'cancelled';
  end if;
  if v_id is null then
    insert into public.erp_platform_payouts (
      platform_account_id, payout_key, payout_reference, payout_date, currency,
      expected_amount, actual_amount, outstanding_amount,
      bank_account_id, finance_transaction_id, status, notes, created_by, updated_by
    ) values (
      (p->>'platform_account_id')::uuid,
      v_key,
      nullif(p->>'payout_reference', ''),
      (p->>'payout_date')::date,
      coalesce(nullif(p->>'currency', ''), 'VND'),
      nullif(p->>'expected_amount', '')::numeric,
      nullif(p->>'actual_amount', '')::numeric,
      nullif(p->>'outstanding_amount', '')::numeric,
      nullif(p->>'bank_account_id', '')::uuid,
      nullif(p->>'finance_transaction_id', '')::uuid,
      coalesce(nullif(p->>'status', ''), 'draft'),
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_platform_payouts set
      payout_reference = coalesce(nullif(p->>'payout_reference', ''), payout_reference),
      payout_date = coalesce(nullif(p->>'payout_date', '')::date, payout_date),
      expected_amount = coalesce(nullif(p->>'expected_amount', '')::numeric, expected_amount),
      actual_amount = coalesce(nullif(p->>'actual_amount', '')::numeric, actual_amount),
      outstanding_amount = coalesce(nullif(p->>'outstanding_amount', '')::numeric, outstanding_amount),
      bank_account_id = coalesce(nullif(p->>'bank_account_id', '')::uuid, bank_account_id),
      finance_transaction_id = coalesce(nullif(p->>'finance_transaction_id', '')::uuid, finance_transaction_id),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id and status in ('draft', 'partial');
    delete from public.erp_platform_payout_allocations where payout_id = v_id;
  end if;

  for v_alloc in select * from jsonb_array_elements(coalesce(p->'allocations', '[]'::jsonb))
  loop
    insert into public.erp_platform_payout_allocations (payout_id, settlement_id, allocated_amount, notes, created_by)
    values (
      v_id,
      (v_alloc->>'settlement_id')::uuid,
      (v_alloc->>'allocated_amount')::numeric,
      nullif(v_alloc->>'notes', ''),
      v_actor
    );
    v_sum := v_sum + coalesce((v_alloc->>'allocated_amount')::numeric, 0);
  end loop;

  if nullif(p->>'finance_transaction_id', '') is not null then
    insert into public.erp_platform_reconciliation (
      platform_account_id, kind, status, payout_id, finance_transaction_id,
      grab_amount, difference, reason, created_by, updated_by
    ) values (
      (p->>'platform_account_id')::uuid,
      'payout_bank',
      'matched',
      v_id,
      (p->>'finance_transaction_id')::uuid,
      nullif(p->>'actual_amount', '')::numeric,
      0,
      'linked_existing_cash_tx',
      v_actor, v_actor
    )
    on conflict (unique_bank_link) do nothing;
  end if;

  return v_id;
end;
$$;

create or replace function public.erp_platform_post_payout(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_platform_payouts%rowtype;
begin
  select * into v_row from public.erp_platform_payouts where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status = 'posted' then return p_id; end if;
  update public.erp_platform_payouts set
    status = case
      when actual_amount is not null and expected_amount is not null and actual_amount < expected_amount then 'partial'
      else 'posted'
    end,
    outstanding_amount = case
      when expected_amount is not null and actual_amount is not null then greatest(expected_amount - actual_amount, 0)
      else outstanding_amount
    end,
    posted_at = now(),
    posted_by = v_actor,
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

-- Dashboard aggregates (actual only; never inject R1 forecast %)
create or replace function public.erp_platform_dashboard(
  p_from date default null,
  p_to date default null,
  p_account uuid default null,
  p_location uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_s record;
  v_p record;
begin
  select
    coalesce(sum(gross_sales), 0) as gross_sales,
    coalesce(sum(net_sales), 0) as net_sales,
    coalesce(sum(platform_commission), 0) as commission,
    coalesce(sum(advertising_expenses), 0) as advertising,
    coalesce(sum(refunds), 0) as refunds,
    coalesce(sum(chargebacks), 0) as chargebacks,
    coalesce(sum(financial_adjustments), 0) as adjustments,
    coalesce(sum(net_earnings_after_marketing), 0) as net_earnings
  into v_s
  from public.erp_platform_settlements s
  where s.status = 'posted'
    and not s.is_estimated
    and (p_account is null or s.platform_account_id = p_account)
    and (p_location is null or s.business_location_id = p_location)
    and (p_from is null or coalesce(s.settlement_date, s.period_to, s.period_from, s.posted_at::date, s.created_at::date) >= p_from)
    and (p_to is null or coalesce(s.settlement_date, s.period_to, s.period_from, s.posted_at::date, s.created_at::date) <= p_to);

  select
    coalesce(sum(actual_amount), 0) as actual_payouts,
    coalesce(sum(outstanding_amount), 0) as outstanding
  into v_p
  from public.erp_platform_payouts p
  where p.status in ('posted', 'partial')
    and (p_account is null or p.platform_account_id = p_account)
    and (p_from is null or p.payout_date >= p_from)
    and (p_to is null or p.payout_date <= p_to);

  return jsonb_build_object(
    'gross_sales', v_s.gross_sales,
    'net_sales', v_s.net_sales,
    'actual_commission', v_s.commission,
    'actual_advertising', v_s.advertising,
    'refunds', v_s.refunds,
    'chargebacks', v_s.chargebacks,
    'other_adjustments', v_s.adjustments,
    'net_earnings', v_s.net_earnings,
    'actual_payouts', v_p.actual_payouts,
    'outstanding_balance', v_p.outstanding,
    'reconciliation_difference', round(coalesce(v_s.net_earnings, 0) - coalesce(v_p.actual_payouts, 0), 4),
    'notes', jsonb_build_array(
      'Forecast channel % not included',
      'Net Earnings is not company net profit',
      'Net Earnings is not automatically a bank receipt'
    )
  );
end;
$$;

-- Manual match settlement line ↔ sales doc
create or replace function public.erp_platform_manual_match(
  p_line_id uuid,
  p_sales_id uuid,
  p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_line public.erp_platform_settlement_lines%rowtype;
begin
  select * into v_line from public.erp_platform_settlement_lines where id = p_line_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND', 'settlement_line'); end if;
  if not exists (select 1 from public.erp_sales_documents where id = p_sales_id and deleted_at is null) then
    perform public.erp_raise('ERP_NOT_FOUND', 'sales_document');
  end if;
  update public.erp_platform_settlement_lines set
    sales_document_id = p_sales_id,
    match_status = 'manually_matched',
    match_reason = 'manual_match'
  where id = p_line_id;
  update public.erp_platform_reconciliation set
    status = 'manually_matched',
    sales_document_id = p_sales_id,
    updated_at = now(),
    updated_by = v_actor
  where settlement_line_id = p_line_id;
  return p_line_id;
end;
$$;

-- Extend load_state with platform parts (preserve prior 9B/9C)
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
  if to_regprocedure('public.erp_load_state_core(text)') is not null then
    prev := coalesce(public.erp_load_state_core(p_parts), '{}'::jsonb);
  else
    prev := '{}'::jsonb;
  end if;
  out := prev;

  if want is null or 'financeAccounts' = any(want) then
    out := out || jsonb_build_object('financeAccounts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_accounts r));
  end if;
  if want is null or 'financeCategories' = any(want) then
    out := out || jsonb_build_object('financeCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.name), '[]'::jsonb) from public.erp_finance_categories r));
  end if;
  if want is null or 'financeTransactions' = any(want) then
    out := out || jsonb_build_object('financeTransactions',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc), '[]'::jsonb)
       from (select * from public.erp_finance_transactions order by occurred_at desc limit 10000) r));
  end if;
  if want is null or 'financeShifts' = any(want) then
    out := out || jsonb_build_object('financeShifts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.opened_at desc), '[]'::jsonb)
       from (select * from public.erp_finance_shifts order by opened_at desc limit 2000) r));
  end if;
  if want is null or 'financeEmployees' = any(want) then
    out := out || jsonb_build_object('financeEmployees',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from public.erp_finance_employees r));
  end if;
  if want is null or 'financePayroll' = any(want) then
    out := out || jsonb_build_object('financePayroll',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_finance_payroll order by period_end desc limit 2000) r));
  end if;
  if want is null or 'legalEntities' = any(want) then
    out := out || jsonb_build_object('legalEntities',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.code), '[]'::jsonb) from public.erp_legal_entities r where r.is_active));
  end if;
  if want is null or 'salesDocuments' = any(want) then
    out := out || jsonb_build_object('salesDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc), '[]'::jsonb)
       from (select * from public.erp_sales_documents where deleted_at is null order by business_date desc limit 3000) r));
  end if;
  if want is null or 'salesLines' = any(want) then
    out := out || jsonb_build_object('salesLines',
      (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       from (select l.* from public.erp_sales_lines l join public.erp_sales_documents d on d.id=l.document_id
             where d.deleted_at is null order by l.document_id, l.line_no limit 20000) r));
  end if;
  if want is null or 'salesSourceLinks' = any(want) then
    out := out || jsonb_build_object('salesSourceLinks',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_source_links order by created_at desc limit 10000) r));
  end if;
  if want is null or 'inputVatCategories' = any(want) then
    out := out || jsonb_build_object('inputVatCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from public.erp_input_vat_categories r where r.is_active));
  end if;
  if want is null or 'taxInvoices' = any(want) then
    out := out || jsonb_build_object('taxInvoices',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.invoice_date desc), '[]'::jsonb)
       from (select * from public.erp_tax_invoices where deleted_at is null order by invoice_date desc limit 3000) r));
  end if;
  if want is null or 'expenseDocuments' = any(want) then
    out := out || jsonb_build_object('expenseDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_documents where deleted_at is null order by transaction_date desc limit 3000) r));
  end if;

  -- Phase 9D
  if want is null or 'platformAccounts' = any(want) then
    out := out || jsonb_build_object('platformAccounts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.platform_code, r.display_name), '[]'::jsonb)
       from public.erp_platform_accounts r where r.is_active));
  end if;
  if want is null or 'platformImportBatches' = any(want) then
    out := out || jsonb_build_object('platformImportBatches',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_platform_import_batches order by created_at desc limit 500) r));
  end if;
  if want is null or 'platformSettlements' = any(want) then
    out := out || jsonb_build_object('platformSettlements',
      (select coalesce(jsonb_agg(to_jsonb(r) order by coalesce(r.settlement_date, r.period_to) desc nulls last), '[]'::jsonb)
       from (select * from public.erp_platform_settlements where status <> 'cancelled' order by created_at desc limit 500) r));
  end if;
  if want is null or 'platformSettlementLines' = any(want) then
    out := out || jsonb_build_object('platformSettlementLines',
      (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       from (select * from public.erp_platform_settlement_lines order by created_at desc limit 20000) r));
  end if;
  if want is null or 'platformPayouts' = any(want) then
    out := out || jsonb_build_object('platformPayouts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.payout_date desc), '[]'::jsonb)
       from (select * from public.erp_platform_payouts where status <> 'cancelled' order by payout_date desc limit 500) r));
  end if;
  if want is null or 'platformReconciliation' = any(want) then
    out := out || jsonb_build_object('platformReconciliation',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_platform_reconciliation order by created_at desc limit 5000) r));
  end if;

  return out;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_platform_oct2026_fixture_math', 'erp_save_platform_account',
             'erp_platform_import_upload', 'erp_platform_import_preview',
             'erp_platform_import_confirm', 'erp_platform_import_apply',
             'erp_platform_save_payout', 'erp_platform_post_payout',
             'erp_platform_dashboard', 'erp_platform_manual_match', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
