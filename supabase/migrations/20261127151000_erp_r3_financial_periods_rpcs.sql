-- Phase 9H RPCs: periods, close checklist, snapshots, protection, reopen, corrections, audit.

create or replace function public.erp_audit_ext(
  p_actor text,
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_reason text default null,
  p_data jsonb default null,
  p_period_id uuid default null,
  p_prev jsonb default null,
  p_new jsonb default null,
  p_role text default null,
  p_request_id text default null,
  p_source text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.erp_audit_log (
    actor, entity, entity_id, action, reason, data,
    financial_period_id, previous_values, new_values, user_role, request_id, source_system
  ) values (
    p_actor, p_entity, p_entity_id, p_action, p_reason, p_data,
    p_period_id, p_prev, p_new, p_role, p_request_id, p_source
  );
  if p_entity in ('product', 'recipe', 'dish') and to_regprocedure('public.erp_snapshot_card(text,uuid,text,text)') is not null then
    perform public.erp_snapshot_card(p_entity, p_entity_id, p_actor, p_action);
  end if;
end;
$$;

-- Keep legacy erp_audit as thin wrapper
create or replace function public.erp_audit(
  p_actor text, p_entity text, p_entity_id uuid, p_action text,
  p_reason text default null, p_data jsonb default null
)
returns void
language plpgsql
as $$
begin
  perform public.erp_audit_ext(p_actor, p_entity, p_entity_id, p_action, p_reason, p_data);
end;
$$;

create or replace function public.erp_period_for_date(
  p_date date,
  p_legal_entity uuid default null
)
returns uuid
language sql
stable
as $$
  select id
  from public.erp_financial_periods
  where p_date between period_start and period_end
    and legal_entity_id is not distinct from p_legal_entity
  order by created_at desc
  limit 1;
$$;

-- Writable if period open/under_review/reopened; closed blocks mutations of historical docs
create or replace function public.erp_assert_period_writable(
  p_date date,
  p_actor text,
  p_entity text default 'document',
  p_allow_payment boolean default false
)
returns void
language plpgsql
stable
as $$
declare
  v_row public.erp_financial_periods%rowtype;
begin
  if p_date is null then return; end if;
  select * into v_row
  from public.erp_financial_periods
  where p_date between period_start and period_end
  order by created_at desc
  limit 1;
  if not found then return; end if; -- no period defined → allow (open by default)
  if v_row.status = 'closed' then
    if p_allow_payment then
      -- payments may post in a different (open) period; caller must use payment date for CF
      return;
    end if;
    perform public.erp_raise('ERP_PERIOD_CLOSED', coalesce(v_row.period_name, v_row.id::text) || ':' || p_entity);
  end if;
end;
$$;

create or replace function public.erp_financial_period_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_start date := (p->>'period_start')::date;
  v_end date := (p->>'period_end')::date;
  v_entity uuid := nullif(p->>'legal_entity_id', '')::uuid;
  v_overlap uuid;
begin
  if v_start is null or v_end is null or v_end < v_start then
    perform public.erp_raise('ERP_INVALID', 'period');
  end if;

  select id into v_overlap
  from public.erp_financial_periods
  where legal_entity_id is not distinct from v_entity
    and (v_id is null or id <> v_id)
    and daterange(period_start, period_end, '[]') && daterange(v_start, v_end, '[]')
  limit 1;
  if v_overlap is not null then
    perform public.erp_raise('ERP_INVALID', 'overlapping_financial_period');
  end if;

  if v_id is null then
    insert into public.erp_financial_periods (
      legal_entity_id, period_name, period_start, period_end, status, opened_by, created_by, updated_by
    ) values (
      v_entity,
      coalesce(nullif(p->>'period_name', ''), to_char(v_start, 'YYYY-MM')),
      v_start, v_end, 'open', v_actor, v_actor, v_actor
    ) returning id into v_id;
  else
    if exists (select 1 from public.erp_financial_periods where id = v_id and status = 'closed') then
      perform public.erp_raise('ERP_PERIOD_CLOSED', 'edit_closed_period');
    end if;
    update public.erp_financial_periods set
      period_name = coalesce(nullif(p->>'period_name', ''), period_name),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(), updated_by = v_actor
    where id = v_id;
  end if;

  perform public.erp_audit_ext(v_actor, 'financial_period', v_id, 'save', null, p, v_id);
  return v_id;
end;
$$;

create or replace function public.erp_financial_period_set_status(
  p_id uuid, p_status text, p_actor text, p_reason text default null
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_financial_periods%rowtype;
begin
  if p_status not in ('open', 'under_review', 'closed', 'reopened') then
    perform public.erp_raise('ERP_INVALID', 'status');
  end if;
  select * into v_row from public.erp_financial_periods where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;

  -- Use dedicated close/reopen RPCs for closed/reopened transitions
  if p_status in ('closed', 'reopened') then
    perform public.erp_raise('ERP_INVALID', 'use_close_or_reopen_rpc');
  end if;
  if v_row.status = 'closed' then
    perform public.erp_raise('ERP_PERIOD_CLOSED', 'set_status');
  end if;

  update public.erp_financial_periods set
    status = p_status,
    updated_at = now(), updated_by = v_actor
  where id = p_id;

  perform public.erp_audit_ext(v_actor, 'financial_period', p_id, 'set_status', p_reason,
    jsonb_build_object('from', v_row.status, 'to', p_status), p_id,
    jsonb_build_object('status', v_row.status), jsonb_build_object('status', p_status));
  return p_id;
end;
$$;

-- Closing checklist (9H-B)
create or replace function public.erp_period_close_checklist(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_row public.erp_financial_periods%rowtype;
  v_checks jsonb := '[]'::jsonb;
  v_cnt int;
  v_block int := 0;
  v_warn int := 0;
begin
  select * into v_row from public.erp_financial_periods where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;

  -- Sales incomplete / pending cogs (warning unless complete required)
  select count(*) into v_cnt from public.erp_sales_documents
  where deleted_at is null and business_date between v_row.period_start and v_row.period_end
    and order_status = 'draft';
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'sales_draft', 'check_group', 'sales',
    'severity', case when v_cnt > 0 then 'blocking_error' else 'passed' end,
    'message', format('Draft sales documents: %s', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_block := v_block + 1; end if;

  select count(*) into v_cnt from public.erp_sales_documents
  where deleted_at is null and business_date between v_row.period_start and v_row.period_end
    and order_status in ('posted','partially_refunded') and cogs_status in ('pending','partial','none');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'pending_cogs', 'check_group', 'cogs',
    'severity', case when v_cnt > 0 then 'warning' else 'passed' end,
    'message', format('Sales with pending/partial COGS: %s', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_warn := v_warn + 1; end if;

  select count(*) into v_cnt from public.erp_platform_settlement_lines
  where match_status in ('unmatched','conflict')
    and coalesce(settlement_date, created_at::date) between v_row.period_start and v_row.period_end;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'unmatched_platform', 'check_group', 'platform',
    'severity', case when v_cnt > 0 then 'warning' else 'passed' end,
    'message', format('Unmatched platform lines: %s', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_warn := v_warn + 1; end if;

  select count(*) into v_cnt from public.erp_expense_documents
  where deleted_at is null and status = 'draft'
    and coalesce(recognition_date, transaction_date) between v_row.period_start and v_row.period_end;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'expense_draft', 'check_group', 'opex',
    'severity', case when v_cnt > 0 then 'blocking_error' else 'passed' end,
    'message', format('Draft expenses: %s', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_block := v_block + 1; end if;

  select count(*) into v_cnt from public.erp_payroll_accruals
  where status = 'draft' and period_end between v_row.period_start and v_row.period_end;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'payroll_draft', 'check_group', 'payroll',
    'severity', case when v_cnt > 0 then 'warning' else 'passed' end,
    'message', format('Draft payroll accruals: %s (payment not required for Accrual close)', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_warn := v_warn + 1; end if;

  select count(*) into v_cnt from public.erp_fixed_assets
  where status = 'active' and depreciation_start_date <= v_row.period_end
    and useful_life_months is null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'asset_missing_life', 'check_group', 'assets',
    'severity', case when v_cnt > 0 then 'warning' else 'passed' end,
    'message', format('Active assets missing useful life: %s', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_warn := v_warn + 1; end if;

  -- VAT settlement independence info
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'vat_period_independent', 'check_group', 'vat',
    'severity', 'information',
    'message', 'Financial close does not file/pay VAT or close VAT tax period (Phase 9E independent)'
  ));

  -- Pending input VAT = warning (not auto blocking)
  select count(*) into v_cnt from public.erp_expense_documents
  where deleted_at is null and status = 'posted' and vat_deduction_status = 'pending'
    and coalesce(recognition_date, transaction_date) between v_row.period_start and v_row.period_end;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'pending_input_vat', 'check_group', 'vat',
    'severity', case when v_cnt > 0 then 'warning' else 'passed' end,
    'message', format('Posted expenses with Pending Input VAT: %s (carry allowed)', v_cnt), 'count', v_cnt
  ));
  if v_cnt > 0 then v_warn := v_warn + 1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check_code', 'reports_ready', 'check_group', 'reports',
    'severity', 'information',
    'message', 'Accrual P&L / CF / AP-AR / profitability will be snapshotted on close'
  ));

  return jsonb_build_object(
    'period_id', p_id,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end,
    'checks', v_checks,
    'blocking_error_count', v_block,
    'warning_count', v_warn,
    'can_close', v_block = 0,
    'can_close_with_warnings', v_block = 0
  );
end;
$$;

create or replace function public.erp_period_close(
  p_id uuid,
  p_actor text,
  p_ack_warnings boolean default false,
  p_ack_reason text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_financial_periods%rowtype;
  v_check jsonb;
  v_closing_id uuid;
  v_ver int;
  v_c jsonb;
  v_pnl jsonb;
  v_cf jsonb;
  v_allow_warn boolean;
begin
  select * into v_row from public.erp_financial_periods where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status = 'closed' then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'already_closed');
  end if;
  if v_row.status not in ('open', 'under_review', 'reopened') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.status);
  end if;

  v_check := public.erp_period_close_checklist(p_id);
  if coalesce((v_check->>'blocking_error_count')::int, 0) > 0 then
    perform public.erp_raise('ERP_INVALID', 'blocking_errors');
  end if;
  select coalesce(allow_close_with_warnings, false) into v_allow_warn from public.erp_settings where id = 1;
  if coalesce((v_check->>'warning_count')::int, 0) > 0 and not coalesce(p_ack_warnings, false) then
    if not v_allow_warn then
      perform public.erp_raise('ERP_INVALID', 'warnings_require_ack');
    end if;
  end if;
  if coalesce(p_ack_warnings, false) and coalesce(nullif(p_ack_reason, ''), '') = '' then
    perform public.erp_raise('ERP_INVALID', 'warnings_ack_reason_required');
  end if;

  v_ver := v_row.closing_version + 1;
  insert into public.erp_period_closings (
    period_id, closing_version, status, closed_by, warnings_acknowledged, warnings_ack_reason
  ) values (
    p_id, v_ver, 'completed', v_actor, coalesce(p_ack_warnings, false), p_ack_reason
  ) returning id into v_closing_id;

  -- Persist checks
  for v_c in select * from jsonb_array_elements(coalesce(v_check->'checks', '[]'::jsonb))
  loop
    insert into public.erp_period_close_checks (
      period_id, closing_id, check_code, check_group, severity, message, meta
    ) values (
      p_id, v_closing_id,
      v_c->>'check_code', v_c->>'check_group', v_c->>'severity', v_c->>'message', v_c
    );
  end loop;

  -- Snapshots (immutable)
  v_pnl := public.erp_accrual_pnl(v_row.period_start, v_row.period_end, null);
  v_cf := public.erp_management_cashflow(v_row.period_start, v_row.period_end);

  insert into public.erp_period_snapshots (period_id, closing_id, report_kind, report_version, payload, applied_rules, data_completeness, closed_by)
  values
    (p_id, v_closing_id, 'accrual_pnl', v_ver, v_pnl, jsonb_build_object('rule', 'erp_accrual_pnl@9g'), v_pnl->'completeness'->>'status', v_actor),
    (p_id, v_closing_id, 'cash_flow', v_ver, v_cf, jsonb_build_object('rule', 'erp_management_cashflow@9g'), 'Actual', v_actor),
    (p_id, v_closing_id, 'channel_profitability', v_ver,
      public.erp_profitability_channels(v_row.period_start, v_row.period_end, null),
      jsonb_build_object('rule', 'erp_profitability_channels@9f'), null, v_actor),
    (p_id, v_closing_id, 'location_profitability', v_ver,
      public.erp_profitability_locations(v_row.period_start, v_row.period_end),
      jsonb_build_object('rule', 'erp_profitability_locations@9f'), null, v_actor),
    (p_id, v_closing_id, 'product_profitability', v_ver,
      public.erp_profitability_products(v_row.period_start, v_row.period_end, null, null),
      jsonb_build_object('rule', 'erp_profitability_products@9f'), null, v_actor),
    (p_id, v_closing_id, 'accounts_payable', v_ver,
      (select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb))
       from public.erp_ap_ar_items i where i.kind='payable'),
      null, null, v_actor),
    (p_id, v_closing_id, 'accounts_receivable', v_ver,
      (select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb))
       from public.erp_ap_ar_items i where i.kind='receivable'),
      null, null, v_actor),
    (p_id, v_closing_id, 'vat_summary', v_ver,
      (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.erp_vat_settlements s
       where s.period_end between v_row.period_start and v_row.period_end),
      jsonb_build_object('note', 'VAT lifecycle independent of financial close'), null, v_actor),
    (p_id, v_closing_id, 'fixed_assets_summary', v_ver,
      (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.erp_fixed_assets a where a.status='active'),
      null, null, v_actor),
    (p_id, v_closing_id, 'payroll_summary', v_ver,
      (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.erp_payroll_accruals p
       where p.status='posted' and p.period_end between v_row.period_start and v_row.period_end),
      null, null, v_actor),
    (p_id, v_closing_id, 'actual_cogs', v_ver,
      jsonb_build_object(
        'food_cogs', v_pnl->'food_actual_cogs',
        'packaging_cogs', v_pnl->'packaging_actual_cogs',
        'total_cogs', v_pnl->'total_cogs'
      ),
      null, v_pnl->'completeness'->>'status', v_actor);

  -- Supersede prior closing marker (keep rows)
  update public.erp_period_closings set status = 'superseded'
  where period_id = p_id and id <> v_closing_id and status = 'completed';

  update public.erp_financial_periods set
    status = 'closed',
    closed_at = now(),
    closed_by = v_actor,
    closing_version = v_ver,
    data_completeness = coalesce(v_pnl->'completeness'->>'status', 'Partial'),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  perform public.erp_audit_ext(v_actor, 'financial_period', p_id, 'close', p_ack_reason,
    jsonb_build_object('closing_id', v_closing_id, 'version', v_ver, 'warnings_acked', p_ack_warnings),
    p_id, jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'closed', 'version', v_ver));

  return jsonb_build_object(
    'ok', true,
    'period_id', p_id,
    'closing_id', v_closing_id,
    'closing_version', v_ver,
    'checklist', v_check
  );
end;
$$;

create or replace function public.erp_period_reopen(
  p_id uuid,
  p_actor text,
  p_reason text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_financial_periods%rowtype;
  v_req uuid;
begin
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then
    perform public.erp_raise('ERP_INVALID', 'reopening_reason_required');
  end if;
  select * into v_row from public.erp_financial_periods where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status <> 'closed' then
    perform public.erp_raise('ERP_INVALID', 'period_not_closed');
  end if;

  insert into public.erp_period_reopen_requests (
    period_id, reason, requested_by, approved_by, approved_at, status
  ) values (
    p_id, p_reason, v_actor, v_actor, now(), 'approved'
  ) returning id into v_req;

  update public.erp_financial_periods set
    status = 'reopened',
    reopened_at = now(),
    reopened_by = v_actor,
    reopening_reason = p_reason,
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  perform public.erp_audit_ext(v_actor, 'financial_period', p_id, 'reopen', p_reason,
    jsonb_build_object('request_id', v_req), p_id,
    jsonb_build_object('status', 'closed'), jsonb_build_object('status', 'reopened'));

  return p_id;
end;
$$;

create or replace function public.erp_financial_correction_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid;
  v_orig_period uuid := nullif(p->>'original_period_id', '')::uuid;
  v_recog uuid := nullif(p->>'recognition_period_id', '')::uuid;
begin
  if v_orig_period is not null and exists (
    select 1 from public.erp_financial_periods where id = v_orig_period and status = 'closed'
  ) and v_recog is not null and v_recog = v_orig_period then
    -- Correction into closed original period not allowed without reopen
    perform public.erp_raise('ERP_PERIOD_CLOSED', 'correction_into_closed_period');
  end if;

  insert into public.erp_financial_corrections (
    correction_kind, original_document_type, original_document_id,
    original_period_id, recognition_period_id,
    original_amount, adjustment_amount, adjustment_reason,
    supporting_document_ref, status, created_by, notes
  ) values (
    coalesce(nullif(p->>'correction_kind', ''), 'other'),
    nullif(p->>'original_document_type', ''),
    nullif(p->>'original_document_id', '')::uuid,
    v_orig_period, v_recog,
    nullif(p->>'original_amount', '')::numeric,
    (p->>'adjustment_amount')::numeric,
    coalesce(nullif(p->>'adjustment_reason', ''), 'correction'),
    nullif(p->>'supporting_document_ref', ''),
    'draft', v_actor, nullif(p->>'notes', '')
  ) returning id into v_id;

  perform public.erp_audit_ext(v_actor, 'financial_correction', v_id, 'save', p->>'adjustment_reason', p, v_recog);
  return v_id;
end;
$$;

create or replace function public.erp_financial_correction_post(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_financial_corrections%rowtype;
begin
  select * into v_row from public.erp_financial_corrections where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status = 'posted' then return p_id; end if;

  if v_row.recognition_period_id is not null then
    perform public.erp_assert_period_writable(
      (select period_start from public.erp_financial_periods where id = v_row.recognition_period_id),
      v_actor, 'financial_correction'
    );
  end if;

  update public.erp_financial_corrections set
    status = 'posted', approved_by = v_actor, approved_at = now()
  where id = p_id;

  perform public.erp_audit_ext(v_actor, 'financial_correction', p_id, 'post', v_row.adjustment_reason, null, v_row.recognition_period_id);
  return p_id;
end;
$$;

-- Backend protection: block UPDATEs to historical docs whose date falls in a Closed period.
-- Payments in a new open period use payment_date (open) and do not mutate closed expense amounts.
create or replace function public.erp_period_protect_row()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_closed boolean;
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  -- to_jsonb avoids multi-table NEW.column plan cache errors across heterogeneous triggers
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row := case when tg_op = 'DELETE' then v_old else v_new end;

  v_date := case tg_table_name
    when 'erp_sales_documents' then nullif(v_row->>'business_date', '')::date
    when 'erp_expense_documents' then coalesce(
      nullif(v_row->>'recognition_date', '')::date,
      nullif(v_row->>'transaction_date', '')::date
    )
    when 'erp_payroll_accruals' then nullif(v_row->>'period_end', '')::date
    when 'erp_documents' then nullif(v_row->>'doc_date', '')::date
    when 'erp_vat_settlements' then nullif(v_row->>'period_end', '')::date
    when 'erp_depreciation_entries' then nullif(v_row->>'period_end', '')::date
    else null
  end;

  if v_date is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (
    select 1 from public.erp_financial_periods
    where status = 'closed' and v_date between period_start and period_end
  ) into v_closed;

  if v_closed then
    -- Allow payment_status / amount_paid updates on expenses (cash in later period)
    if tg_table_name = 'erp_expense_documents' and tg_op = 'UPDATE'
       and (v_new->>'net_amount') is not distinct from (v_old->>'net_amount')
       and (v_new->>'gross_amount') is not distinct from (v_old->>'gross_amount')
       and (v_new->>'vat_amount') is not distinct from (v_old->>'vat_amount')
       and (v_new->>'status') is not distinct from (v_old->>'status')
       and (v_new->>'expense_category') is not distinct from (v_old->>'expense_category')
       and (
         (v_new->>'payment_status') is distinct from (v_old->>'payment_status')
         or (v_new->>'amount_paid') is distinct from (v_old->>'amount_paid')
         or (v_new->>'payment_date') is distinct from (v_old->>'payment_date')
       ) then
      return new;
    end if;
    -- Allow VAT settlement payment fields similarly
    if tg_table_name = 'erp_vat_settlements' and tg_op = 'UPDATE'
       and (v_new->>'output_vat') is not distinct from (v_old->>'output_vat')
       and (v_new->>'vat_payable') is not distinct from (v_old->>'vat_payable')
       and (v_new->>'settlement_status') is not distinct from (v_old->>'settlement_status')
       and (
         (v_new->>'vat_paid') is distinct from (v_old->>'vat_paid')
         or (v_new->>'payment_status') is distinct from (v_old->>'payment_status')
       ) then
      return new;
    end if;
    perform public.erp_raise('ERP_PERIOD_CLOSED', tg_table_name);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'erp_sales_documents', 'erp_expense_documents', 'erp_payroll_accruals',
    'erp_documents', 'erp_vat_settlements', 'erp_depreciation_entries'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists erp_period_protect_ins on public.%I', t);
    execute format('drop trigger if exists erp_period_protect_upd on public.%I', t);
    execute format('drop trigger if exists erp_period_protect_del on public.%I', t);
    execute format(
      'create trigger erp_period_protect_ins before insert on public.%I for each row execute function public.erp_period_protect_row()',
      t
    );
    execute format(
      'create trigger erp_period_protect_upd before update on public.%I for each row execute function public.erp_period_protect_row()',
      t
    );
    execute format(
      'create trigger erp_period_protect_del before delete on public.%I for each row execute function public.erp_period_protect_row()',
      t
    );
  end loop;
end $$;

-- Protect COGS allocations / sales lines via parent sale date
create or replace function public.erp_period_protect_sales_child()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_doc uuid;
begin
  if tg_table_name = 'erp_sales_cogs_allocations' then
    v_doc := case when tg_op = 'DELETE' then old.sales_document_id else new.sales_document_id end;
  elsif tg_table_name = 'erp_sales_lines' then
    v_doc := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select d.business_date into v_date
  from public.erp_sales_documents d
  where d.id = v_doc;
  if v_date is not null and exists (
    select 1 from public.erp_financial_periods
    where status = 'closed' and v_date between period_start and period_end
  ) then
    perform public.erp_raise('ERP_PERIOD_CLOSED', tg_table_name);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  if to_regclass('public.erp_sales_cogs_allocations') is not null then
    drop trigger if exists erp_period_protect_cogs_upd on public.erp_sales_cogs_allocations;
    drop trigger if exists erp_period_protect_cogs_ins on public.erp_sales_cogs_allocations;
    create trigger erp_period_protect_cogs_upd before update or delete on public.erp_sales_cogs_allocations
      for each row execute function public.erp_period_protect_sales_child();
    create trigger erp_period_protect_cogs_ins before insert on public.erp_sales_cogs_allocations
      for each row execute function public.erp_period_protect_sales_child();
  end if;
  if to_regclass('public.erp_sales_lines') is not null then
    drop trigger if exists erp_period_protect_slines on public.erp_sales_lines;
    create trigger erp_period_protect_slines before update or delete on public.erp_sales_lines
      for each row execute function public.erp_period_protect_sales_child();
  end if;
end $$;

-- Audit log immutability for anon/authenticated (no update/delete policies)
create or replace function public.erp_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  perform public.erp_raise('ERP_FORBIDDEN', 'audit_log_immutable');
  return null;
end;
$$;

drop trigger if exists erp_audit_log_no_upd on public.erp_audit_log;
drop trigger if exists erp_audit_log_no_del on public.erp_audit_log;
create trigger erp_audit_log_no_upd before update on public.erp_audit_log
  for each row execute function public.erp_audit_log_immutable();
create trigger erp_audit_log_no_del before delete on public.erp_audit_log
  for each row execute function public.erp_audit_log_immutable();

-- Closed-period snapshots are immutable (9H-B/C)
create or replace function public.erp_period_snapshot_immutable()
returns trigger
language plpgsql
as $$
begin
  perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'period_snapshot_immutable');
  return null;
end;
$$;

drop trigger if exists erp_period_snapshots_no_upd on public.erp_period_snapshots;
drop trigger if exists erp_period_snapshots_no_del on public.erp_period_snapshots;
create trigger erp_period_snapshots_no_upd before update on public.erp_period_snapshots
  for each row execute function public.erp_period_snapshot_immutable();
create trigger erp_period_snapshots_no_del before delete on public.erp_period_snapshots
  for each row execute function public.erp_period_snapshot_immutable();

create or replace function public.erp_period_snapshots_list(p_period_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.report_version desc, s.report_kind), '[]'::jsonb)
  from public.erp_period_snapshots s
  where s.period_id = p_period_id;
$$;

-- load_state parts
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

  -- 9G keys (keep prior surface)
  if want is null or 'expenseDocuments' = any(want) then
    out := out || jsonb_build_object('expenseDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_documents where deleted_at is null order by transaction_date desc limit 3000) r));
  end if;
  if want is null or 'expensePayments' = any(want) then
    out := out || jsonb_build_object('expensePayments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.payment_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_payments where status <> 'cancelled' order by payment_date desc limit 2000) r));
  end if;
  if want is null or 'payrollAccruals' = any(want) then
    out := out || jsonb_build_object('payrollAccruals',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_payroll_accruals order by period_end desc limit 2000) r));
  end if;
  if want is null or 'fixedAssets' = any(want) then
    out := out || jsonb_build_object('fixedAssets',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.acquisition_date desc), '[]'::jsonb)
       from (select * from public.erp_fixed_assets where status <> 'cancelled' order by acquisition_date desc limit 2000) r));
  end if;
  if want is null or 'apArItems' = any(want) then
    out := out || jsonb_build_object('apArItems',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.due_date nulls last), '[]'::jsonb)
       from (select * from public.erp_ap_ar_items where status in ('open','partial') order by due_date nulls last limit 5000) r));
  end if;
  if want is null or 'salesPendingCogs' = any(want) then
    out := out || jsonb_build_object('salesPendingCogs',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_pending_cogs where status = 'open' order by created_at desc limit 2000) r));
  end if;
  if want is null or 'vatSettlements' = any(want) then
    out := out || jsonb_build_object('vatSettlements',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_vat_settlements order by period_end desc limit 500) r));
  end if;

  -- 9H keys
  if want is null or 'financialPeriods' = any(want) then
    out := out || jsonb_build_object('financialPeriods',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_financial_periods order by period_end desc limit 500) r));
  end if;
  if want is null or 'periodClosings' = any(want) then
    out := out || jsonb_build_object('periodClosings',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.closed_at desc), '[]'::jsonb)
       from (select * from public.erp_period_closings order by closed_at desc limit 500) r));
  end if;
  if want is null or 'periodCloseChecks' = any(want) then
    out := out || jsonb_build_object('periodCloseChecks',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_period_close_checks order by created_at desc limit 5000) r));
  end if;
  if want is null or 'periodSnapshots' = any(want) then
    out := out || jsonb_build_object('periodSnapshots',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.report_version desc, r.report_kind), '[]'::jsonb)
       from (select id, period_id, closing_id, report_kind, report_version, calculation_at,
                    applied_rules, data_completeness, closed_by, created_at,
                    case when pg_column_size(payload) > 200000 then '{"truncated":true}'::jsonb else payload end as payload
             from public.erp_period_snapshots order by report_version desc limit 2000) r));
  end if;
  if want is null or 'periodReopenRequests' = any(want) then
    out := out || jsonb_build_object('periodReopenRequests',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb)
       from (select * from public.erp_period_reopen_requests order by requested_at desc limit 500) r));
  end if;
  if want is null or 'financialCorrections' = any(want) then
    out := out || jsonb_build_object('financialCorrections',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_financial_corrections order by created_at desc limit 1000) r));
  end if;
  if want is null or 'auditLog' = any(want) then
    out := out || jsonb_build_object('auditLog',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc), '[]'::jsonb)
       from (select * from public.erp_audit_log order by at desc limit 2000) r));
  end if;

  return out;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_audit', 'erp_audit_ext', 'erp_period_for_date', 'erp_assert_period_writable',
             'erp_financial_period_save', 'erp_financial_period_set_status',
             'erp_period_close_checklist', 'erp_period_close', 'erp_period_reopen',
             'erp_financial_correction_save', 'erp_financial_correction_post',
             'erp_period_snapshots_list', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
