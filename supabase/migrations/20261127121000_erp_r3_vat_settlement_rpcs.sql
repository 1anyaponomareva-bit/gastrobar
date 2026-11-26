-- Phase 9E RPCs: VAT settlement compute, approve (snapshot lock), carryforward, payments.

-- Pure formula (test cases A–C). Pending / non-deductible are inputs for reporting only — not subtracted.
create or replace function public.erp_vat_settlement_compute(
  p_output_vat numeric,
  p_deductible_input_vat numeric,
  p_pending_input_vat numeric default 0,
  p_non_deductible_input_vat numeric default 0,
  p_vat_adjustments numeric default 0,
  p_eligible_carryforward numeric default 0
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out numeric := coalesce(p_output_vat, 0);
  v_ded numeric := coalesce(p_deductible_input_vat, 0);
  v_adj numeric := coalesce(p_vat_adjustments, 0);
  v_cf numeric := greatest(coalesce(p_eligible_carryforward, 0), 0);
  v_raw numeric;
  v_payable numeric;
  v_cf_out numeric;
  v_applied numeric;
begin
  -- Output − Deductible ± Adjustments − Carryforward
  v_raw := v_out - v_ded + v_adj - v_cf;
  if v_raw >= 0 then
    v_payable := round(v_raw, 4);
    v_cf_out := 0;
    v_applied := v_cf;
  else
    v_payable := 0;
    v_cf_out := round(abs(v_raw), 4);
    -- When result negative, carryforward applied is only up to what was needed to zero payable
    v_applied := least(v_cf, v_out - v_ded + v_adj);
    if v_applied < 0 then v_applied := 0; end if;
    -- Simpler: if negative after full CF, all CF was applied
    v_applied := v_cf;
  end if;

  return jsonb_build_object(
    'output_vat', round(v_out, 4),
    'deductible_input_vat', round(v_ded, 4),
    'pending_input_vat', round(coalesce(p_pending_input_vat, 0), 4),
    'non_deductible_input_vat', round(coalesce(p_non_deductible_input_vat, 0), 4),
    'total_input_vat', round(v_ded + coalesce(p_pending_input_vat, 0) + coalesce(p_non_deductible_input_vat, 0), 4),
    'vat_adjustments', round(v_adj, 4),
    'opening_carryforward', round(v_cf, 4),
    'applied_carryforward', round(v_applied, 4),
    'vat_payable', v_payable,
    'potential_carryforward', v_cf_out,
    'rule_ref', 'erp_vat_settlement_compute@9e',
    'note', 'Pending and Non-Deductible excluded from deductible base'
  );
end;
$$;

-- Aggregate registers for a period (tax recognition ≈ business/invoice dates — mode from settings)
create or replace function public.erp_vat_settlement_collect(
  p_from date,
  p_to date,
  p_legal_entity uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_out numeric := 0;
  v_in jsonb;
  v_ded numeric := 0;
  v_pend numeric := 0;
  v_nonded numeric := 0;
  v_total_in numeric := 0;
  v_adj numeric := 0;
  v_cf numeric := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_unmatched int;
  v_grab_unverified int;
  v_pending_inv int;
  v_mode text;
begin
  select coalesce(input_vat_tax_period_mode, 'accountant_tbd') into v_mode from public.erp_settings where id = 1;

  select coalesce(sum(coalesce(output_vat_amount, 0)), 0) into v_out
  from public.erp_sales_documents
  where deleted_at is null
    and order_status in ('posted', 'partially_refunded', 'refunded')
    and business_date between p_from and p_to;

  v_in := public.erp_input_vat_register(p_from, p_to, p_legal_entity, null, null, null, null, null, null);
  v_ded := coalesce((v_in->'totals'->>'deductible_vat')::numeric, 0);
  v_pend := coalesce((v_in->'totals'->>'pending_vat')::numeric, 0);
  v_nonded := coalesce((v_in->'totals'->>'non_deductible_vat')::numeric, 0);
  v_total_in := coalesce((v_in->'totals'->>'input_vat_total')::numeric, 0);

  -- Adjustments already reflected in line statuses → do NOT add vat_deduction_difference again (avoid double count).
  -- Surface as informational warning count only; applicable adj for period corrections table separately.
  select coalesce(sum(abs(coalesce(vat_deduction_difference, 0))), 0) into v_adj
  from public.erp_vat_cost_adjustments
  where status = 'posted'
    and coalesce(vat_invoice_date, posted_at::date) between p_from and p_to;
  -- Force applicable adjustments to 0 for register-based calc (already in deductible/pending)
  v_adj := 0;

  select coalesce(sum(remaining_amount), 0) into v_cf
  from public.erp_vat_carryforwards
  where approval_status = 'approved'
    and remaining_amount > 0
    and legal_entity_id is not distinct from p_legal_entity;

  if v_pend > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'pending_input_vat', 'amount', v_pend));
  end if;

  select count(*) into v_pending_inv
  from public.erp_documents
  where doc_type = 'receipt' and status = 'posted'
    and vat_verification_status in ('missing', 'pending')
    and doc_date between p_from and p_to;
  if v_pending_inv > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'unconfirmed_tax_invoices', 'count', v_pending_inv));
  end if;

  select count(*) into v_grab_unverified
  from public.erp_expense_documents
  where status = 'posted' and deleted_at is null
    and platform_source = 'grab'
    and vat_deduction_status = 'pending'
    and transaction_date between p_from and p_to;
  if v_grab_unverified > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'grab_vat_unverified', 'count', v_grab_unverified));
  end if;

  select count(*) into v_unmatched
  from public.erp_platform_settlement_lines
  where match_status in ('unmatched', 'conflict')
    and coalesce(settlement_date, created_at::date) between p_from and p_to;
  if v_unmatched > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'unreconciled_platform_sales', 'count', v_unmatched));
  end if;

  if v_mode = 'accountant_tbd' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'tax_period_rules_unconfirmed'));
  end if;

  return public.erp_vat_settlement_compute(v_out, v_ded, v_pend, v_nonded, v_adj, v_cf)
    || jsonb_build_object(
      'warnings', v_warnings,
      'is_final', jsonb_array_length(v_warnings) = 0,
      'tax_recognition_basis', v_mode,
      'period_from', p_from,
      'period_to', p_to,
      'total_input_vat_register', v_total_in,
      'stock_adj_posted_abs_info_only', (
        select coalesce(sum(abs(coalesce(vat_deduction_difference, 0))), 0)
        from public.erp_vat_cost_adjustments
        where status = 'posted'
          and coalesce(vat_invoice_date, posted_at::date) between p_from and p_to
      )
    );
end;
$$;

create or replace function public.erp_vat_settlement_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_from date := (p->>'period_start')::date;
  v_to date := (p->>'period_end')::date;
  v_kind text := coalesce(nullif(p->>'period_kind', ''), 'monthly');
  v_calc jsonb;
  v_entity uuid := nullif(p->>'legal_entity_id', '')::uuid;
begin
  if v_from is null or v_to is null or v_to < v_from then
    perform public.erp_raise('ERP_INVALID', 'period');
  end if;
  if v_kind not in ('monthly', 'quarterly', 'custom') then
    perform public.erp_raise('ERP_INVALID', 'period_kind');
  end if;

  if coalesce((p->>'use_manual_amounts')::boolean, false) then
    v_calc := public.erp_vat_settlement_compute(
      coalesce((p->>'output_vat')::numeric, 0),
      coalesce((p->>'deductible_input_vat')::numeric, 0),
      coalesce((p->>'pending_input_vat')::numeric, 0),
      coalesce((p->>'non_deductible_input_vat')::numeric, 0),
      coalesce((p->>'vat_adjustments')::numeric, 0),
      coalesce((p->>'opening_carryforward')::numeric, 0)
    ) || jsonb_build_object(
      'warnings', coalesce(p->'warnings', '[]'::jsonb),
      'is_final', coalesce((p->>'is_final')::boolean, false),
      'tax_recognition_basis', coalesce(p->>'tax_recognition_basis', 'accountant_tbd')
    );
  else
    v_calc := public.erp_vat_settlement_collect(v_from, v_to, v_entity);
  end if;

  if v_id is not null then
    if exists (
      select 1 from public.erp_vat_settlements
      where id = v_id and settlement_status in ('approved', 'filed')
    ) then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'approved_settlement');
    end if;
    update public.erp_vat_settlements set
      period_kind = v_kind,
      period_start = v_from,
      period_end = v_to,
      tax_recognition_basis = coalesce(v_calc->>'tax_recognition_basis', tax_recognition_basis),
      settlement_status = 'calculated',
      is_final = coalesce((v_calc->>'is_final')::boolean, false),
      output_vat = (v_calc->>'output_vat')::numeric,
      total_input_vat = (v_calc->>'total_input_vat')::numeric,
      deductible_input_vat = (v_calc->>'deductible_input_vat')::numeric,
      pending_input_vat = (v_calc->>'pending_input_vat')::numeric,
      non_deductible_input_vat = (v_calc->>'non_deductible_input_vat')::numeric,
      vat_adjustments = (v_calc->>'vat_adjustments')::numeric,
      opening_carryforward = (v_calc->>'opening_carryforward')::numeric,
      applied_carryforward = (v_calc->>'applied_carryforward')::numeric,
      vat_payable = (v_calc->>'vat_payable')::numeric,
      potential_carryforward = (v_calc->>'potential_carryforward')::numeric,
      outstanding_liability = (v_calc->>'vat_payable')::numeric - vat_paid,
      warnings = coalesce(v_calc->'warnings', '[]'::jsonb),
      snapshot = v_calc,
      calculated_at = now(),
      calculated_by = v_actor,
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id;
  else
    insert into public.erp_vat_settlements (
      legal_entity_id, period_kind, period_start, period_end, tax_recognition_basis,
      settlement_status, is_final,
      output_vat, total_input_vat, deductible_input_vat, pending_input_vat, non_deductible_input_vat,
      vat_adjustments, opening_carryforward, applied_carryforward,
      vat_payable, potential_carryforward, vat_paid, outstanding_liability,
      warnings, snapshot, calculated_at, calculated_by, notes, created_by, updated_by
    ) values (
      v_entity, v_kind, v_from, v_to, coalesce(v_calc->>'tax_recognition_basis', 'accountant_tbd'),
      'calculated', coalesce((v_calc->>'is_final')::boolean, false),
      (v_calc->>'output_vat')::numeric,
      (v_calc->>'total_input_vat')::numeric,
      (v_calc->>'deductible_input_vat')::numeric,
      (v_calc->>'pending_input_vat')::numeric,
      (v_calc->>'non_deductible_input_vat')::numeric,
      (v_calc->>'vat_adjustments')::numeric,
      (v_calc->>'opening_carryforward')::numeric,
      (v_calc->>'applied_carryforward')::numeric,
      (v_calc->>'vat_payable')::numeric,
      (v_calc->>'potential_carryforward')::numeric,
      0,
      (v_calc->>'vat_payable')::numeric,
      coalesce(v_calc->'warnings', '[]'::jsonb),
      v_calc, now(), v_actor, nullif(p->>'notes', ''), v_actor, v_actor
    ) returning id into v_id;
  end if;

  delete from public.erp_vat_settlement_lines where settlement_id = v_id;
  insert into public.erp_vat_settlement_lines (settlement_id, line_kind, source_system, description, amount)
  values
    (v_id, 'output', 'sales', 'Output VAT', (v_calc->>'output_vat')::numeric),
    (v_id, 'input_deductible', 'input_register', 'Deductible Input VAT', (v_calc->>'deductible_input_vat')::numeric),
    (v_id, 'input_pending', 'input_register', 'Pending Input VAT (excluded)', (v_calc->>'pending_input_vat')::numeric),
    (v_id, 'input_non_deductible', 'input_register', 'Non-Deductible Input VAT (excluded)', (v_calc->>'non_deductible_input_vat')::numeric),
    (v_id, 'carryforward_open', 'carryforward', 'Opening carryforward', (v_calc->>'opening_carryforward')::numeric),
    (v_id, 'carryforward_applied', 'carryforward', 'Applied carryforward', (v_calc->>'applied_carryforward')::numeric);

  return v_id;
end;
$$;

create or replace function public.erp_vat_settlement_approve(p_id uuid, p_actor text, p_force boolean default false)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_vat_settlements%rowtype;
  v_cf_id uuid;
  v_need numeric;
  v_take numeric;
  r record;
begin
  select * into v_row from public.erp_vat_settlements where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.settlement_status in ('approved', 'filed') then return p_id; end if;
  if v_row.settlement_status not in ('calculated', 'under_review', 'draft') then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.settlement_status);
  end if;
  if not v_row.is_final and not coalesce(p_force, false) then
    perform public.erp_raise('ERP_INVALID', 'incomplete_data_use_force_or_fix');
  end if;

  -- Apply carryforward consumption (no double use)
  v_need := coalesce(v_row.applied_carryforward, 0);
  if v_need > 0 then
    for r in
      select * from public.erp_vat_carryforwards
      where approval_status = 'approved' and remaining_amount > 0
        and legal_entity_id is not distinct from v_row.legal_entity_id
      order by source_period_end nulls first, created_at
      for update
    loop
      exit when v_need <= 0;
      v_take := least(r.remaining_amount, v_need);
      update public.erp_vat_carryforwards set
        applied_amount = applied_amount + v_take,
        remaining_amount = remaining_amount - v_take,
        destination_settlement_id = p_id,
        approval_status = case when remaining_amount - v_take = 0 then 'exhausted' else approval_status end,
        updated_at = now(),
        updated_by = v_actor
      where id = r.id;
      v_need := v_need - v_take;
    end loop;
    if v_need > 0.0001 then
      perform public.erp_raise('ERP_INVALID', 'insufficient_carryforward');
    end if;
  end if;

  -- Create outgoing carryforward if potential > 0
  if coalesce(v_row.potential_carryforward, 0) > 0 then
    insert into public.erp_vat_carryforwards (
      legal_entity_id, source_settlement_id, source_period_start, source_period_end,
      opening_amount, applied_amount, remaining_amount, approval_status,
      is_opening_balance, created_by, updated_by, approved_at, approved_by
    ) values (
      v_row.legal_entity_id, p_id, v_row.period_start, v_row.period_end,
      v_row.potential_carryforward, 0, v_row.potential_carryforward, 'approved',
      false, v_actor, v_actor, now(), v_actor
    ) returning id into v_cf_id;
  end if;

  update public.erp_vat_settlements set
    settlement_status = 'approved',
    snapshot = coalesce(snapshot, '{}'::jsonb) || jsonb_build_object(
      'approved_at', now(),
      'approved_by', v_actor,
      'frozen_output_vat', output_vat,
      'frozen_deductible_input_vat', deductible_input_vat,
      'frozen_vat_payable', vat_payable,
      'rule_ref', rule_ref
    ),
    approved_at = now(),
    approved_by = v_actor,
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;

  return p_id;
end;
$$;

-- Opening carryforward (pre-ERP) — explicit only
create or replace function public.erp_vat_carryforward_opening(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_amt numeric := coalesce((p->>'opening_amount')::numeric, 0);
  v_id uuid;
begin
  if v_amt <= 0 then perform public.erp_raise('ERP_INVALID', 'opening_amount'); end if;
  if coalesce((p->>'confirmed')::boolean, false) is not true then
    perform public.erp_raise('ERP_INVALID', 'opening_carryforward_requires_confirmed');
  end if;
  insert into public.erp_vat_carryforwards (
    legal_entity_id, opening_amount, applied_amount, remaining_amount,
    approval_status, is_opening_balance, notes, created_by, updated_by, approved_at, approved_by,
    source_period_start, source_period_end
  ) values (
    nullif(p->>'legal_entity_id', '')::uuid,
    v_amt, 0, v_amt,
    'approved', true, coalesce(nullif(p->>'notes', ''), 'Pre-ERP opening VAT carryforward'),
    v_actor, v_actor, now(), v_actor,
    nullif(p->>'source_period_start', '')::date,
    nullif(p->>'source_period_end', '')::date
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.erp_vat_payment_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_key text := coalesce(nullif(p->>'payment_key', ''), 'vatpay:' || coalesce(p->>'payment_reference', gen_random_uuid()::text));
  v_alloc jsonb;
  v_sum numeric := 0;
  v_fin uuid := nullif(p->>'finance_transaction_id', '')::uuid;
begin
  if v_fin is not null and exists (
    select 1 from public.erp_vat_payments
    where finance_transaction_id = v_fin and status <> 'cancelled'
      and (v_id is null or id <> v_id)
  ) then
    perform public.erp_raise('ERP_DUPLICATE', 'vat_payment_cash_tx');
  end if;

  if v_id is null then
    select id into v_id from public.erp_vat_payments where payment_key = v_key and status <> 'cancelled';
    -- Idempotent: existing payment_key returns same id without rewrite (incl. posted)
    if v_id is not null and nullif(p->>'id', '') is null then
      return v_id;
    end if;
  end if;

  if v_id is null then
    insert into public.erp_vat_payments (
      legal_entity_id, payment_key, payment_date, amount, currency,
      bank_account_id, finance_transaction_id, payment_reference, status, notes, created_by, updated_by
    ) values (
      nullif(p->>'legal_entity_id', '')::uuid,
      v_key,
      (p->>'payment_date')::date,
      (p->>'amount')::numeric,
      coalesce(nullif(p->>'currency', ''), 'VND'),
      nullif(p->>'bank_account_id', '')::uuid,
      v_fin,
      nullif(p->>'payment_reference', ''),
      'draft',
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    if exists (select 1 from public.erp_vat_payments where id = v_id and status = 'posted') then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'posted_payment');
    end if;
    update public.erp_vat_payments set
      payment_date = coalesce(nullif(p->>'payment_date', '')::date, payment_date),
      amount = coalesce(nullif(p->>'amount', '')::numeric, amount),
      bank_account_id = coalesce(nullif(p->>'bank_account_id', '')::uuid, bank_account_id),
      finance_transaction_id = coalesce(v_fin, finance_transaction_id),
      payment_reference = coalesce(nullif(p->>'payment_reference', ''), payment_reference),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id;
    delete from public.erp_vat_payment_allocations where payment_id = v_id;
  end if;

  for v_alloc in select * from jsonb_array_elements(coalesce(p->'allocations', '[]'::jsonb))
  loop
    insert into public.erp_vat_payment_allocations (payment_id, settlement_id, allocated_amount, created_by)
    values (v_id, (v_alloc->>'settlement_id')::uuid, (v_alloc->>'allocated_amount')::numeric, v_actor);
    v_sum := v_sum + coalesce((v_alloc->>'allocated_amount')::numeric, 0);
  end loop;

  if v_sum > 0 and v_sum > (select amount from public.erp_vat_payments where id = v_id) + 0.0001 then
    perform public.erp_raise('ERP_INVALID', 'allocation_exceeds_payment');
  end if;

  return v_id;
end;
$$;

create or replace function public.erp_vat_payment_post(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_pay public.erp_vat_payments%rowtype;
  r record;
  v_paid numeric;
  v_liab numeric;
begin
  select * into v_pay from public.erp_vat_payments where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_pay.status = 'posted' then return p_id; end if;

  update public.erp_vat_payments set
    status = 'posted', posted_at = now(), posted_by = v_actor, updated_at = now(), updated_by = v_actor
  where id = p_id;

  for r in
    select a.settlement_id, a.allocated_amount
    from public.erp_vat_payment_allocations a
    where a.payment_id = p_id
  loop
    if exists (
      select 1 from public.erp_vat_settlements
      where id = r.settlement_id and settlement_status not in ('approved', 'filed', 'amended')
    ) then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'settlement_not_approved');
    end if;

    update public.erp_vat_settlements s set
      vat_paid = vat_paid + r.allocated_amount,
      outstanding_liability = greatest(vat_payable - (vat_paid + r.allocated_amount), 0),
      payment_status = case
        when vat_paid + r.allocated_amount <= 0 then 'unpaid'
        when vat_paid + r.allocated_amount + 0.0001 >= vat_payable and vat_payable > 0 then 'paid'
        when vat_paid + r.allocated_amount > vat_payable then 'overpaid'
        else 'partially_paid'
      end,
      updated_at = now(),
      updated_by = v_actor
    where id = r.settlement_id;

    insert into public.erp_vat_settlement_lines (settlement_id, line_kind, source_system, source_document_id, description, amount)
    values (r.settlement_id, 'payment', 'vat_payment', p_id, 'VAT payment allocation', r.allocated_amount);
  end loop;

  return p_id;
end;
$$;

create or replace function public.erp_vat_period_correction_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid;
begin
  insert into public.erp_vat_period_corrections (
    legal_entity_id, original_period_start, original_period_end,
    recognition_period_start, recognition_period_end,
    original_settlement_id, original_document_ref,
    adjustment_amount, adjustment_reason, approval_status, notes, created_by
  ) values (
    nullif(p->>'legal_entity_id', '')::uuid,
    nullif(p->>'original_period_start', '')::date,
    nullif(p->>'original_period_end', '')::date,
    (p->>'recognition_period_start')::date,
    (p->>'recognition_period_end')::date,
    nullif(p->>'original_settlement_id', '')::uuid,
    nullif(p->>'original_document_ref', ''),
    (p->>'adjustment_amount')::numeric,
    coalesce(nullif(p->>'adjustment_reason', ''), 'correction'),
    'draft',
    nullif(p->>'notes', ''),
    v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Export payload (CSV built on client)
create or replace function public.erp_vat_settlement_export(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_row public.erp_vat_settlements%rowtype;
  v_lines jsonb;
begin
  select * into v_row from public.erp_vat_settlements where id = p_id;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), '[]'::jsonb) into v_lines
  from public.erp_vat_settlement_lines l where l.settlement_id = p_id;
  return jsonb_build_object(
    'settlement', to_jsonb(v_row),
    'lines', v_lines,
    'disclaimer', 'Internal ERP tax calculation — not an official Vietnam tax declaration'
  );
end;
$$;

-- Extend load_state with 9E parts (preserve prior)
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

  -- Phase 9E
  if want is null or 'vatSettlements' = any(want) then
    out := out || jsonb_build_object('vatSettlements',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_vat_settlements order by period_end desc limit 500) r));
  end if;
  if want is null or 'vatCarryforwards' = any(want) then
    out := out || jsonb_build_object('vatCarryforwards',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_vat_carryforwards order by created_at desc limit 500) r));
  end if;
  if want is null or 'vatPayments' = any(want) then
    out := out || jsonb_build_object('vatPayments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.payment_date desc), '[]'::jsonb)
       from (select * from public.erp_vat_payments where status <> 'cancelled' order by payment_date desc limit 500) r));
  end if;
  if want is null or 'vatPeriodCorrections' = any(want) then
    out := out || jsonb_build_object('vatPeriodCorrections',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_vat_period_corrections order by created_at desc limit 500) r));
  end if;

  return out;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_vat_settlement_compute', 'erp_vat_settlement_collect', 'erp_vat_settlement_save',
             'erp_vat_settlement_approve', 'erp_vat_carryforward_opening',
             'erp_vat_payment_save', 'erp_vat_payment_post',
             'erp_vat_period_correction_save', 'erp_vat_settlement_export', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
