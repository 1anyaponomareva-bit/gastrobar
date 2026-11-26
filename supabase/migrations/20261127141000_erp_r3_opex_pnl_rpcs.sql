-- Phase 9G RPCs: expense pay/allocate, payroll accrual, assets/depr, accrual P&L, CF, dashboard.

-- ---------------------------------------------------------------------------
-- Expense payment (cash) — does NOT re-post P&L expense
-- ---------------------------------------------------------------------------
create or replace function public.erp_expense_payment_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_key text := coalesce(nullif(p->>'payment_key', ''), 'exppay:' || coalesce(p->>'payment_reference', gen_random_uuid()::text));
  v_exp uuid := (p->>'expense_id')::uuid;
  v_fin uuid := nullif(p->>'finance_transaction_id', '')::uuid;
begin
  if v_exp is null then perform public.erp_raise('ERP_INVALID', 'expense_id'); end if;
  if exists (select 1 from public.erp_expense_documents where id = v_exp and status not in ('posted', 'adjusted')) then
    perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'expense_not_posted');
  end if;
  if v_fin is not null and exists (
    select 1 from public.erp_expense_payments
    where finance_transaction_id = v_fin and status <> 'cancelled' and (v_id is null or id <> v_id)
  ) then
    perform public.erp_raise('ERP_DUPLICATE', 'expense_payment_cash_tx');
  end if;

  if v_id is null then
    select id into v_id from public.erp_expense_payments where payment_key = v_key and status <> 'cancelled';
    if v_id is not null then return v_id; end if;
  end if;

  if v_id is null then
    insert into public.erp_expense_payments (
      expense_id, payment_key, payment_date, amount, finance_transaction_id, bank_account_id,
      payment_reference, status, created_by
    ) values (
      v_exp, v_key, (p->>'payment_date')::date, (p->>'amount')::numeric, v_fin,
      nullif(p->>'bank_account_id', '')::uuid, nullif(p->>'payment_reference', ''), 'draft', v_actor
    ) returning id into v_id;
  else
    if exists (select 1 from public.erp_expense_payments where id = v_id and status = 'posted') then
      perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'posted_payment');
    end if;
    update public.erp_expense_payments set
      payment_date = coalesce(nullif(p->>'payment_date', '')::date, payment_date),
      amount = coalesce(nullif(p->>'amount', '')::numeric, amount),
      finance_transaction_id = coalesce(v_fin, finance_transaction_id),
      payment_reference = coalesce(nullif(p->>'payment_reference', ''), payment_reference)
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.erp_expense_payment_post(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_pay public.erp_expense_payments%rowtype;
  v_paid numeric;
  v_gross numeric;
begin
  select * into v_pay from public.erp_expense_payments where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_pay.status = 'posted' then return p_id; end if;

  update public.erp_expense_payments set status = 'posted', posted_at = now(), posted_by = v_actor where id = p_id;

  update public.erp_expense_documents e set
    amount_paid = amount_paid + v_pay.amount,
    payment_date = coalesce(payment_date, v_pay.payment_date),
    payment_status = case
      when amount_paid + v_pay.amount <= 0 then 'unpaid'
      when amount_paid + v_pay.amount + 0.0001 >= gross_amount then 'paid'
      when amount_paid + v_pay.amount > gross_amount then 'overpaid'
      else 'partially_paid'
    end,
    updated_at = now(), updated_by = v_actor
  where id = v_pay.expense_id;

  select amount_paid, gross_amount into v_paid, v_gross from public.erp_expense_documents where id = v_pay.expense_id;

  update public.erp_ap_ar_items set
    paid_amount = v_paid,
    outstanding_amount = greatest(v_gross - v_paid, 0),
    status = case when v_paid + 0.0001 >= v_gross then 'closed' when v_paid > 0 then 'partial' else 'open' end,
    updated_at = now()
  where source_type = 'expense' and source_id = v_pay.expense_id and kind = 'payable';

  if not found then
    insert into public.erp_ap_ar_items (
      kind, counterparty_type, source_type, source_id, original_amount, paid_amount, outstanding_amount, due_date, status
    )
    select 'payable', 'supplier', 'expense', e.id, e.gross_amount, e.amount_paid,
           greatest(e.gross_amount - e.amount_paid, 0), e.payment_due_date,
           case when e.amount_paid + 0.0001 >= e.gross_amount then 'closed'
                when e.amount_paid > 0 then 'partial' else 'open' end
    from public.erp_expense_documents e where e.id = v_pay.expense_id;
  end if;

  return p_id;
end;
$$;

-- Manual allocations only unless owner enables auto (default off)
create or replace function public.erp_expense_allocation_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_exp uuid := (p->>'expense_id')::uuid;
  v_sum numeric := 0;
  v_net numeric;
  v_row jsonb;
  v_id uuid;
  v_auto boolean;
begin
  select coalesce(expense_auto_allocate, false) into v_auto from public.erp_settings where id = 1;
  if coalesce((p->>'auto')::boolean, false) and not v_auto then
    perform public.erp_raise('ERP_INVALID', 'auto_allocate_disabled');
  end if;
  select net_amount into v_net from public.erp_expense_documents where id = v_exp and status in ('posted', 'adjusted');
  if v_net is null then perform public.erp_raise('ERP_NOT_FOUND'); end if;

  delete from public.erp_expense_allocations where expense_id = v_exp;
  for v_row in select * from jsonb_array_elements(coalesce(p->'allocations', '[]'::jsonb))
  loop
    insert into public.erp_expense_allocations (
      expense_id, location_id, cost_center_id, method, share_pct, amount, notes, created_by
    ) values (
      v_exp,
      nullif(v_row->>'location_id', '')::uuid,
      nullif(v_row->>'cost_center_id', '')::uuid,
      coalesce(nullif(v_row->>'method', ''), 'manual'),
      nullif(v_row->>'share_pct', '')::numeric,
      (v_row->>'amount')::numeric,
      nullif(v_row->>'notes', ''),
      v_actor
    ) returning id into v_id;
    v_sum := v_sum + coalesce((v_row->>'amount')::numeric, 0);
  end loop;
  if abs(v_sum - v_net) > 0.01 and jsonb_array_length(coalesce(p->'allocations', '[]'::jsonb)) > 0 then
    perform public.erp_raise('ERP_INVALID', 'allocation_sum_mismatch');
  end if;
  update public.erp_expense_documents set
    allocation_method = coalesce(nullif(p->>'allocation_method', ''), allocation_method, 'manual'),
    updated_at = now(), updated_by = v_actor
  where id = v_exp;
  return v_exp;
end;
$$;

-- Sync AP on expense post (extend existing post)
create or replace function public.erp_post_expense_document(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_expense_documents%rowtype;
  v_split jsonb;
begin
  select * into v_row from public.erp_expense_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status = 'posted' then return p_id; end if;
  if v_row.status <> 'draft' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.status); end if;

  update public.erp_expense_documents set
    status = 'posted',
    recognition_date = coalesce(recognition_date, tax_recognition_date, invoice_date, transaction_date),
    posted_at = now(), posted_by = v_actor, updated_at = now(), updated_by = v_actor
  where id = p_id;

  v_split := public.erp_input_vat_split(v_row.vat_amount, v_row.vat_deduction_status, v_row.deductible_vat_pct);
  insert into public.erp_input_vat_status_history (
    source_document_type, source_document_id, old_status, new_status, reason, actor,
    deductible_vat, non_deductible_vat, pending_vat, tax_recognition_date
  ) values (
    'expense', p_id, 'draft', v_row.vat_deduction_status, 'expense_posted', v_actor,
    (v_split->>'deductible')::numeric, (v_split->>'non_deductible')::numeric, (v_split->>'pending')::numeric,
    coalesce(v_row.tax_recognition_date, v_row.invoice_date, v_row.transaction_date)
  );

  if not coalesce(v_row.is_capitalizable, false) then
    insert into public.erp_ap_ar_items (
      kind, counterparty_type, supplier_id, source_type, source_id,
      original_amount, paid_amount, outstanding_amount, due_date, status
    ) values (
      'payable', 'supplier', v_row.supplier_id, 'expense', p_id,
      v_row.gross_amount, 0, v_row.gross_amount, v_row.payment_due_date, 'open'
    );
  end if;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payroll accrual (9G-B) — P&L on accrual; payment separately in CF
-- ---------------------------------------------------------------------------
create or replace function public.erp_payroll_accrual_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_key text := coalesce(nullif(p->>'accrual_key', ''), 'payacc:' || coalesce(p->>'period_end', '') || ':' || gen_random_uuid()::text);
  v_id uuid;
  v_gross numeric := coalesce((p->>'gross_payroll')::numeric, 0);
  v_emp_si numeric := coalesce((p->>'employee_social_insurance')::numeric, 0);
  v_er_si numeric := coalesce((p->>'employer_social_insurance')::numeric, 0);
  v_pit numeric := coalesce((p->>'personal_income_tax_withholding')::numeric, 0);
  v_net numeric;
begin
  -- Net = gross - employee SI - PIT (employer SI is employer cost, not deduction from net)
  v_net := coalesce(nullif(p->>'net_payroll', '')::numeric, v_gross - v_emp_si - v_pit);

  select id into v_id from public.erp_payroll_accruals where accrual_key = v_key and status <> 'cancelled';
  if v_id is not null then
    if exists (select 1 from public.erp_payroll_accruals where id = v_id and status = 'posted') then
      return v_id; -- idempotent
    end if;
  end if;

  if v_id is null then
    insert into public.erp_payroll_accruals (
      legal_entity_id, location_id, period_start, period_end, accrual_key,
      gross_payroll, employee_social_insurance, employer_social_insurance,
      personal_income_tax_withholding, net_payroll, overtime, bonuses, staff_meals, other_benefits,
      status, source_system, notes, created_by, updated_by
    ) values (
      nullif(p->>'legal_entity_id', '')::uuid,
      nullif(p->>'location_id', '')::uuid,
      (p->>'period_start')::date,
      (p->>'period_end')::date,
      v_key,
      v_gross, v_emp_si, v_er_si, v_pit, v_net,
      coalesce((p->>'overtime')::numeric, 0),
      coalesce((p->>'bonuses')::numeric, 0),
      coalesce((p->>'staff_meals')::numeric, 0),
      coalesce((p->>'other_benefits')::numeric, 0),
      'draft',
      coalesce(nullif(p->>'source_system', ''), 'manual'),
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_payroll_accruals set
      gross_payroll = v_gross,
      employee_social_insurance = v_emp_si,
      employer_social_insurance = v_er_si,
      personal_income_tax_withholding = v_pit,
      net_payroll = v_net,
      overtime = coalesce((p->>'overtime')::numeric, overtime),
      bonuses = coalesce((p->>'bonuses')::numeric, bonuses),
      staff_meals = coalesce((p->>'staff_meals')::numeric, staff_meals),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(), updated_by = v_actor
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.erp_payroll_accrual_post(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_payroll_accruals%rowtype;
begin
  select * into v_row from public.erp_payroll_accruals where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status = 'posted' then return p_id; end if;

  update public.erp_payroll_accruals set
    status = 'posted', posted_at = now(), posted_by = v_actor, updated_at = now(), updated_by = v_actor
  where id = p_id;

  insert into public.erp_ap_ar_items (
    kind, counterparty_type, counterparty_name, source_type, source_id,
    original_amount, paid_amount, outstanding_amount, due_date, status
  ) values (
    'payable', 'employee', 'Payroll net', 'payroll', p_id,
    v_row.net_payroll, 0, v_row.net_payroll, v_row.period_end, 'open'
  );
  return p_id;
end;
$$;

create or replace function public.erp_payroll_payment_post(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_key text := coalesce(nullif(p->>'payment_key', ''), 'paypay:' || gen_random_uuid()::text);
  v_acc uuid := (p->>'accrual_id')::uuid;
  v_amt numeric := (p->>'amount')::numeric;
  v_id uuid;
  v_row public.erp_payroll_accruals%rowtype;
begin
  select id into v_id from public.erp_payroll_payments where payment_key = v_key and status <> 'cancelled';
  if v_id is not null then return v_id; end if;

  select * into v_row from public.erp_payroll_accruals where id = v_acc for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status <> 'posted' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', 'accrual_not_posted'); end if;

  insert into public.erp_payroll_payments (
    accrual_id, payment_key, payment_date, amount, finance_transaction_id, finance_payroll_id, status, created_by, posted_at, posted_by
  ) values (
    v_acc, v_key, (p->>'payment_date')::date, v_amt,
    nullif(p->>'finance_transaction_id', '')::uuid,
    nullif(p->>'finance_payroll_id', '')::uuid,
    'posted', v_actor, now(), v_actor
  ) returning id into v_id;

  update public.erp_payroll_accruals set
    paid_amount = paid_amount + v_amt,
    payment_status = case
      when paid_amount + v_amt + 0.0001 >= net_payroll then 'paid'
      when paid_amount + v_amt > 0 then 'partially_paid'
      else 'unpaid'
    end,
    updated_at = now(), updated_by = v_actor
  where id = v_acc;

  update public.erp_ap_ar_items set
    paid_amount = (select paid_amount from public.erp_payroll_accruals where id = v_acc),
    outstanding_amount = greatest((select net_payroll - paid_amount from public.erp_payroll_accruals where id = v_acc), 0),
    status = case when (select paid_amount + 0.0001 >= net_payroll from public.erp_payroll_accruals where id = v_acc)
      then 'closed' else 'partial' end,
    updated_at = now()
  where source_type = 'payroll' and source_id = v_acc;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixed assets + straight-line depreciation (9G-C)
-- ---------------------------------------------------------------------------
create or replace function public.erp_fixed_asset_save(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_cost numeric := coalesce((p->>'acquisition_cost')::numeric, 0);
  v_resid numeric := coalesce((p->>'residual_value')::numeric, 0);
begin
  if coalesce((p->>'confirmed')::boolean, false) is not true and v_id is null then
    -- Allow draft without confirmed; activation requires policy or explicit activate
    null;
  end if;
  if v_id is null then
    insert into public.erp_fixed_assets (
      legal_entity_id, location_id, name, category, acquisition_date, acquisition_cost, vat_amount,
      vat_deduction_status, useful_life_months, depreciation_method, depreciation_start_date,
      residual_value, accumulated_depreciation, net_book_value, status, expense_document_id, notes,
      created_by, updated_by
    ) values (
      nullif(p->>'legal_entity_id', '')::uuid,
      nullif(p->>'location_id', '')::uuid,
      btrim(p->>'name'),
      coalesce(nullif(p->>'category', ''), 'other'),
      (p->>'acquisition_date')::date,
      v_cost,
      coalesce((p->>'vat_amount')::numeric, 0),
      coalesce(nullif(p->>'vat_deduction_status', ''), 'pending'),
      nullif(p->>'useful_life_months', '')::integer,
      coalesce(nullif(p->>'depreciation_method', ''), 'straight_line'),
      nullif(p->>'depreciation_start_date', '')::date,
      v_resid, 0, v_cost - v_resid,
      coalesce(nullif(p->>'status', ''), 'draft'),
      nullif(p->>'expense_document_id', '')::uuid,
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_fixed_assets set
      name = coalesce(nullif(p->>'name', ''), name),
      useful_life_months = coalesce(nullif(p->>'useful_life_months', '')::integer, useful_life_months),
      depreciation_start_date = coalesce(nullif(p->>'depreciation_start_date', '')::date, depreciation_start_date),
      residual_value = coalesce(nullif(p->>'residual_value', '')::numeric, residual_value),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(), updated_by = v_actor
    where id = v_id and status in ('draft', 'active');
  end if;
  return v_id;
end;
$$;

create or replace function public.erp_fixed_asset_activate(p_id uuid, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_fixed_assets%rowtype;
  v_pol text;
begin
  select * into v_row from public.erp_fixed_assets where id = p_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  select depreciation_policy_status into v_pol from public.erp_settings where id = 1;
  if v_row.useful_life_months is null or v_row.useful_life_months <= 0 then
    perform public.erp_raise('ERP_INVALID', 'useful_life_months_required');
  end if;
  if v_row.depreciation_start_date is null then
    perform public.erp_raise('ERP_INVALID', 'depreciation_start_date_required');
  end if;
  -- Policy may remain accountant_tbd — activation still allowed for management drafts with explicit life
  update public.erp_fixed_assets set
    status = 'active',
    net_book_value = acquisition_cost - residual_value - accumulated_depreciation,
    updated_at = now(), updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

create or replace function public.erp_depreciation_run(
  p_asset_id uuid,
  p_period_start date,
  p_period_end date,
  p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_fixed_assets%rowtype;
  v_key text;
  v_id uuid;
  v_monthly numeric;
  v_amt numeric;
  v_months int;
begin
  select * into v_row from public.erp_fixed_assets where id = p_asset_id for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status <> 'active' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.status); end if;
  if v_row.depreciation_method <> 'straight_line' then
    perform public.erp_raise('ERP_INVALID', 'only_straight_line_in_9g');
  end if;

  v_key := 'depr:' || p_asset_id::text || ':' || p_period_start::text || ':' || p_period_end::text;
  select id into v_id from public.erp_depreciation_entries where entry_key = v_key;
  if v_id is not null then return v_id; end if;

  v_months := greatest(v_row.useful_life_months, 1);
  v_monthly := round((v_row.acquisition_cost - v_row.residual_value) / v_months, 4);
  v_amt := least(v_monthly, greatest(v_row.net_book_value, 0));
  if v_amt <= 0 then perform public.erp_raise('ERP_INVALID', 'fully_depreciated'); end if;

  insert into public.erp_depreciation_entries (
    asset_id, period_start, period_end, amount, entry_key, status, created_by
  ) values (
    p_asset_id, p_period_start, p_period_end, v_amt, v_key, 'posted', v_actor
  ) returning id into v_id;

  update public.erp_fixed_assets set
    accumulated_depreciation = accumulated_depreciation + v_amt,
    net_book_value = greatest(acquisition_cost - residual_value - (accumulated_depreciation + v_amt), 0),
    updated_at = now(), updated_by = v_actor
  where id = p_asset_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Control P&L math (§18)
-- ---------------------------------------------------------------------------
create or replace function public.erp_accrual_pnl_control_math(
  p_net_revenue numeric default 500000000,
  p_food numeric default 125000000,
  p_pack numeric default 15000000,
  p_commission numeric default 85000000,
  p_ads numeric default 30000000,
  p_payroll numeric default 90000000,
  p_employer_si numeric default 12000000,
  p_staff_meals numeric default 8000000,
  p_rent numeric default 30000000,
  p_utilities numeric default 10000000,
  p_other_opex numeric default 15000000,
  p_depr numeric default 5000000
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_cogs numeric := coalesce(p_food,0)+coalesce(p_pack,0);
  v_gp numeric := coalesce(p_net_revenue,0)-v_cogs;
  v_cm numeric := v_gp-coalesce(p_commission,0)-coalesce(p_ads,0);
  v_ebitda numeric := v_cm-coalesce(p_payroll,0)-coalesce(p_employer_si,0)-coalesce(p_staff_meals,0)
                      -coalesce(p_rent,0)-coalesce(p_utilities,0)-coalesce(p_other_opex,0);
  v_ebit numeric := v_ebitda-coalesce(p_depr,0);
  v_nr numeric := coalesce(p_net_revenue,0);
begin
  return jsonb_build_object(
    'net_revenue', v_nr,
    'total_cogs', v_cogs,
    'gross_profit', v_gp,
    'gross_margin_pct', case when v_nr=0 then null else round(v_gp/v_nr*100,4) end,
    'contribution_margin', v_cm,
    'contribution_margin_pct', case when v_nr=0 then null else round(v_cm/v_nr*100,4) end,
    'ebitda', v_ebitda,
    'ebitda_margin_pct', case when v_nr=0 then null else round(v_ebitda/v_nr*100,4) end,
    'ebit', v_ebit,
    'profit_before_tax', v_ebit,
    'profit_before_tax_margin_pct', case when v_nr=0 then null else round(v_ebit/v_nr*100,4) end,
    'cit', null,
    'cit_status', 'accountant_tbd',
    'net_profit', null,
    'net_profit_status', 'Pending Tax Calculation',
    'rule_ref', 'erp_accrual_pnl_control_math@9g'
  );
end;
$$;

-- Accrual management P&L from documents (9G-D)
create or replace function public.erp_accrual_pnl(
  p_from date,
  p_to date,
  p_location uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_net numeric := 0;
  v_food numeric := 0;
  v_pack numeric := 0;
  v_comm numeric := 0;
  v_ads numeric := 0;
  v_payroll numeric := 0;
  v_er_si numeric := 0;
  v_meals numeric := 0;
  v_rent numeric := 0;
  v_util numeric := 0;
  v_other numeric := 0;
  v_depr numeric := 0;
  v_pending_cogs int := 0;
  v_cit_status text;
  v_cit_rate numeric;
  v_out jsonb;
  v_cogs numeric;
  v_gp numeric;
  v_cm numeric;
  v_ebitda numeric;
  v_ebit numeric;
begin
  select coalesce(cit_status, 'accountant_tbd'), cit_rate into v_cit_status, v_cit_rate
  from public.erp_settings where id = 1;

  select
    coalesce(sum(d.net_revenue),0),
    coalesce(sum(d.food_cogs),0),
    coalesce(sum(d.packaging_cogs),0),
    count(*) filter (where d.cogs_status in ('pending','partial','none'))
  into v_net, v_food, v_pack, v_pending_cogs
  from public.erp_sales_documents d
  where d.deleted_at is null
    and d.order_status in ('posted','partially_refunded','refunded')
    and d.business_date between p_from and p_to
    and (p_location is null or d.business_location_id = p_location);

  select coalesce(sum(coalesce(l.platform_commission,0)),0),
         coalesce(sum(coalesce(l.advertising_expense,0)),0)
  into v_comm, v_ads
  from public.erp_platform_settlement_lines l
  where coalesce(l.settlement_date, l.created_at::date) between p_from and p_to;

  select
    coalesce(sum(gross_payroll),0),
    coalesce(sum(employer_social_insurance),0),
    coalesce(sum(staff_meals),0)
  into v_payroll, v_er_si, v_meals
  from public.erp_payroll_accruals
  where status = 'posted'
    and period_end between p_from and p_to
    and (p_location is null or location_id is not distinct from p_location);

  select coalesce(sum(case when expense_category = 'rent' then net_amount else 0 end),0),
         coalesce(sum(case when expense_category = 'utilities' then net_amount else 0 end),0),
         coalesce(sum(case when expense_category not in ('rent','utilities','payroll','employer_social_insurance','staff_meals','depreciation')
                            and coalesce(platform_source,'') = ''
                            and not is_capitalizable
                       then net_amount else 0 end),0)
  into v_rent, v_util, v_other
  from public.erp_expense_documents
  where status = 'posted' and deleted_at is null
    and coalesce(recognition_date, tax_recognition_date, transaction_date) between p_from and p_to
    and (p_location is null or business_location_id is not distinct from p_location or cost_center_id is not distinct from p_location);

  select coalesce(sum(amount),0) into v_depr
  from public.erp_depreciation_entries
  where status = 'posted' and period_end between p_from and p_to;

  v_cogs := v_food + v_pack;
  v_gp := v_net - v_cogs;
  v_cm := v_gp - v_comm - v_ads;
  v_ebitda := v_cm - v_payroll - v_er_si - v_meals - v_rent - v_util - v_other;
  v_ebit := v_ebitda - v_depr;

  v_out := jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'basis', 'accrual',
    'net_revenue', v_net,
    'food_actual_cogs', v_food,
    'packaging_actual_cogs', v_pack,
    'total_cogs', v_cogs,
    'gross_profit', v_gp,
    'gross_margin_pct', case when v_net=0 then null else round(v_gp/v_net*100,4) end,
    'platform_commission', v_comm,
    'advertising', v_ads,
    'contribution_margin', v_cm,
    'contribution_margin_pct', case when v_net=0 then null else round(v_cm/v_net*100,4) end,
    'payroll', v_payroll,
    'employer_social_insurance', v_er_si,
    'staff_meals', v_meals,
    'rent', v_rent,
    'utilities', v_util,
    'other_operating_expenses', v_other,
    'ebitda', v_ebitda,
    'ebitda_margin_pct', case when v_net=0 then null else round(v_ebitda/v_net*100,4) end,
    'depreciation', v_depr,
    'ebit', v_ebit,
    'operating_profit', v_ebit,
    'profit_before_tax', v_ebit,
    'profit_before_tax_margin_pct', case when v_net=0 then null else round(v_ebit/v_net*100,4) end,
    'cit_rate', v_cit_rate,
    'cit_status', v_cit_status,
    'cit_amount', case when v_cit_status = 'estimated' and v_cit_rate is not null
      then round(v_ebit * v_cit_rate / 100, 4) else null end,
    'net_profit', case when v_cit_status = 'confirmed' and v_cit_rate is not null
      then round(v_ebit - v_ebit * v_cit_rate / 100, 4) else null end,
    'net_profit_status', case when v_cit_status in ('accountant_tbd','estimated') or v_cit_rate is null
      then 'Pending Tax Calculation' else 'available' end,
    'food_cost_pct', case when v_net=0 then null else round(v_food/v_net*100,4) end,
    'packaging_cost_pct', case when v_net=0 then null else round(v_pack/v_net*100,4) end,
    'labor_cost_pct', case when v_net=0 then null else round((v_payroll+v_er_si+v_meals)/v_net*100,4) end,
    'prime_cost_pct', case when v_net=0 then null else round((v_cogs+v_payroll+v_er_si+v_meals)/v_net*100,4) end,
    'platform_commission_pct', case when v_net=0 then null else round(v_comm/v_net*100,4) end,
    'advertising_cost_pct', case when v_net=0 then null else round(v_ads/v_net*100,4) end,
    'rent_cost_pct', case when v_net=0 then null else round(v_rent/v_net*100,4) end,
    'completeness', jsonb_build_object(
      'pending_cogs_orders', v_pending_cogs,
      'status', case when v_pending_cogs > 0 then 'Partial' else 'Actual' end,
      'is_final', v_pending_cogs = 0 and v_cit_status = 'confirmed'
    ),
    'disclaimer', 'Management Accrual P&L. VAT payment ≠ P&L expense. Cash Basis report is separate/Legacy.'
  );
  return v_out;
end;
$$;

-- Management cash flow (9G-E) — uses cashbook + classified links
create or replace function public.erp_management_cashflow(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_open numeric := 0;
  v_close numeric := 0;
  v_op_in numeric := 0;
  v_op_out numeric := 0;
  v_inv numeric := 0;
  v_fin_in numeric := 0;
  v_fin_out numeric := 0;
  v_internal numeric := 0;
begin
  -- Opening: sum account balances before period (opening_balance + txs before from)
  select coalesce(sum(a.opening_balance),0) + coalesce((
    select sum(case when t.type = 'income' then t.amount when t.type = 'expense' then -t.amount else 0 end)
    from public.erp_finance_transactions t
    where t.deleted_at is null and t.occurred_at::date < p_from
  ),0) into v_open
  from public.erp_finance_accounts a where a.deleted_at is null;

  select
    coalesce(sum(case when t.type = 'income' and coalesce(c.pnl_block,'opex') in ('revenue','other_income') then t.amount else 0 end),0),
    coalesce(sum(case when t.type = 'expense' and coalesce(c.code,'') not in ('deposits') then t.amount else 0 end),0),
    coalesce(sum(case when t.type = 'transfer' then t.amount else 0 end),0)
  into v_op_in, v_op_out, v_internal
  from public.erp_finance_transactions t
  left join public.erp_finance_categories c on c.id = t.category_id
  where t.deleted_at is null
    and t.occurred_at::date between p_from and p_to;

  -- Investing: capitalizable expense payments + asset acquisitions (cash)
  select coalesce(sum(p.amount),0) into v_inv
  from public.erp_expense_payments p
  join public.erp_expense_documents e on e.id = p.expense_id
  where p.status = 'posted' and e.is_capitalizable and p.payment_date between p_from and p_to;

  -- Financing markers via category codes if present
  select
    coalesce(sum(case when c.code in ('owner_contribution','loan_in') then t.amount else 0 end),0),
    coalesce(sum(case when c.code in ('owner_withdrawal','loan_repayment') then t.amount else 0 end),0)
  into v_fin_in, v_fin_out
  from public.erp_finance_transactions t
  join public.erp_finance_categories c on c.id = t.category_id
  where t.deleted_at is null and t.occurred_at::date between p_from and p_to;

  v_close := v_open + v_op_in - v_op_out - v_inv + v_fin_in - v_fin_out;

  return jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'opening_cash_balance', v_open,
    'operating_cash_inflows', v_op_in,
    'operating_cash_outflows', v_op_out,
    'investing_cash_flow', -v_inv,
    'financing_cash_inflows', v_fin_in,
    'financing_cash_outflows', v_fin_out,
    'internal_transfers_excluded_from_external', v_internal,
    'net_cash_movement', v_op_in - v_op_out - v_inv + v_fin_in - v_fin_out,
    'closing_cash_balance', v_close,
    'note', 'Internal transfers between own accounts excluded from consolidated external CF. VAT/tax payments are CF not P&L.'
  );
end;
$$;

create or replace function public.erp_ap_ar_summary()
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'payables', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.due_date nulls last)
      from public.erp_ap_ar_items i where i.kind='payable' and i.status in ('open','partial')
    ), '[]'::jsonb),
    'receivables', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.due_date nulls last)
      from public.erp_ap_ar_items i where i.kind='receivable' and i.status in ('open','partial')
    ), '[]'::jsonb),
    'payable_total', coalesce((select sum(outstanding_amount) from public.erp_ap_ar_items where kind='payable' and status in ('open','partial')),0),
    'receivable_total', coalesce((select sum(outstanding_amount) from public.erp_ap_ar_items where kind='receivable' and status in ('open','partial')),0)
  );
end;
$$;

create or replace function public.erp_finance_dashboard(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_pnl jsonb;
  v_cf jsonb;
  v_ap jsonb;
  v_vat numeric := 0;
begin
  v_pnl := public.erp_accrual_pnl(p_from, p_to, null);
  v_cf := public.erp_management_cashflow(p_from, p_to);
  v_ap := public.erp_ap_ar_summary();
  select coalesce(sum(outstanding_liability),0) into v_vat
  from public.erp_vat_settlements
  where settlement_status in ('approved','filed') and payment_status in ('unpaid','partially_paid');

  return jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'gross_sales', (select coalesce(sum(gross_sales),0) from public.erp_sales_documents
      where deleted_at is null and order_status in ('posted','partially_refunded','refunded')
        and business_date between p_from and p_to),
    'net_revenue', v_pnl->'net_revenue',
    'actual_cogs', v_pnl->'total_cogs',
    'gross_profit', v_pnl->'gross_profit',
    'contribution_margin', v_pnl->'contribution_margin',
    'payroll', v_pnl->'payroll',
    'operating_expenses', (coalesce((v_pnl->>'rent')::numeric,0)+coalesce((v_pnl->>'utilities')::numeric,0)+coalesce((v_pnl->>'other_operating_expenses')::numeric,0)),
    'ebitda', v_pnl->'ebitda',
    'operating_profit', v_pnl->'ebit',
    'profit_before_tax', v_pnl->'profit_before_tax',
    'net_profit', v_pnl->'net_profit',
    'net_profit_status', v_pnl->'net_profit_status',
    'cash_balance', v_cf->'closing_cash_balance',
    'accounts_payable', v_ap->'payable_total',
    'accounts_receivable', v_ap->'receivable_total',
    'vat_payable', v_vat,
    'pnl', v_pnl,
    'cashflow', v_cf,
    'ap_ar', v_ap,
    'completeness', v_pnl->'completeness'
  );
end;
$$;

-- load_state extras
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

  if want is null or 'expenseDocuments' = any(want) then
    out := out || jsonb_build_object('expenseDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_documents where deleted_at is null order by transaction_date desc limit 3000) r));
  end if;
  if want is null or 'expensePayments' = any(want) then
    out := out || jsonb_build_object('expensePayments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.payment_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_payments where status<>'cancelled' order by payment_date desc limit 2000) r));
  end if;
  if want is null or 'payrollAccruals' = any(want) then
    out := out || jsonb_build_object('payrollAccruals',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_payroll_accruals order by period_end desc limit 2000) r));
  end if;
  if want is null or 'fixedAssets' = any(want) then
    out := out || jsonb_build_object('fixedAssets',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.acquisition_date desc), '[]'::jsonb)
       from (select * from public.erp_fixed_assets where status<>'cancelled' order by acquisition_date desc limit 2000) r));
  end if;
  if want is null or 'apArItems' = any(want) then
    out := out || jsonb_build_object('apArItems',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.due_date nulls last), '[]'::jsonb)
       from (select * from public.erp_ap_ar_items where status in ('open','partial') order by due_date nulls last limit 5000) r));
  end if;
  if want is null or 'salesPendingCogs' = any(want) then
    out := out || jsonb_build_object('salesPendingCogs',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_pending_cogs where status='open' order by created_at desc limit 2000) r));
  end if;
  if want is null or 'vatSettlements' = any(want) then
    out := out || jsonb_build_object('vatSettlements',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_vat_settlements order by period_end desc limit 500) r));
  end if;

  return out;
end;
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'erp_expense_payment_save', 'erp_expense_payment_post', 'erp_expense_allocation_save',
             'erp_post_expense_document', 'erp_payroll_accrual_save', 'erp_payroll_accrual_post',
             'erp_payroll_payment_post', 'erp_fixed_asset_save', 'erp_fixed_asset_activate',
             'erp_depreciation_run', 'erp_accrual_pnl_control_math', 'erp_accrual_pnl',
             'erp_management_cashflow', 'erp_ap_ar_summary', 'erp_finance_dashboard', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
