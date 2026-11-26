-- Phase 9C RPCs: Input VAT register (unified), tax invoices, expense contract.
-- Reuses R2 split rules. Does NOT apply forecast Grab amounts.

create or replace function public.erp_input_vat_split(
  p_vat numeric,
  p_status text,
  p_deductible_pct numeric default null
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_vat numeric := coalesce(p_vat, 0);
  v_status text := coalesce(nullif(p_status, ''), 'pending');
  v_pct numeric;
  v_ded numeric;
begin
  if v_vat <= 0 then
    return jsonb_build_object('deductible', 0, 'non_deductible', 0, 'pending', 0);
  end if;
  if v_status = 'deductible' then
    return jsonb_build_object('deductible', round(v_vat, 4), 'non_deductible', 0, 'pending', 0);
  end if;
  if v_status = 'non_deductible' then
    return jsonb_build_object('deductible', 0, 'non_deductible', round(v_vat, 4), 'pending', 0);
  end if;
  if v_status = 'pending' then
    return jsonb_build_object('deductible', 0, 'non_deductible', 0, 'pending', round(v_vat, 4));
  end if;
  if v_status = 'partial' then
    v_pct := greatest(0, least(100, coalesce(p_deductible_pct, 0)));
    v_ded := round(v_vat * v_pct / 100.0, 4);
    return jsonb_build_object(
      'deductible', v_ded,
      'non_deductible', round(v_vat - v_ded, 4),
      'pending', 0
    );
  end if;
  return jsonb_build_object('deductible', 0, 'non_deductible', 0, 'pending', round(v_vat, 4));
end;
$$;

-- Map product type → expense category for purchase lines
create or replace function public.erp_input_vat_category_for_product(p_product_id uuid)
returns text
language sql
stable
as $$
  select case p.type
    when 'ingredient' then 'ingredients'
    when 'packaging' then 'packaging'
    when 'semi_finished' then 'ingredients'
    when 'finished' then 'ingredients'
    when 'consumable' then 'other_expenses'
    else 'other_expenses'
  end
  from public.erp_products p
  where p.id = p_product_id;
$$;

-- Unified register query. One row per source line. Adjustments do not double-count VAT liability:
-- amounts reflect CURRENT line/lot/expense status (post-adjustment). Adjustment docs appear as
-- audit/reference totals separately.
create or replace function public.erp_input_vat_register(
  p_from date default null,
  p_to date default null,
  p_legal_entity uuid default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_category text default null,
  p_rate numeric default null,
  p_status text default null,
  p_source_type text default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_pending numeric := 0;
  v_ded numeric := 0;
  v_nonded numeric := 0;
  v_vat_total numeric := 0;
  v_adj numeric := 0;
  r record;
  v_split jsonb;
  v_period_mode text;
  v_tx date;
  v_inv date;
  v_recog date;
  v_period date;
  v_sup_name text;
begin
  select coalesce(input_vat_tax_period_mode, 'accountant_tbd') into v_period_mode
  from public.erp_settings where id = 1;

  -- 1) Purchase receipt lines (R2 source of truth for goods Input VAT)
  for r in
    select
      d.id as document_id,
      l.id as line_id,
      d.doc_no,
      d.doc_date,
      d.vat_invoice_number,
      d.vat_invoice_serial,
      d.vat_invoice_date,
      d.supplier_id,
      d.supplier_tax_code,
      s.name as supplier_name,
      d.warehouse_id,
      loc.id as business_location_id,
      coalesce(l.vat_deduction_status, 'pending') as deduction_status,
      l.deductible_vat_pct,
      coalesce(l.vat_rate, 0) as tax_rate,
      coalesce(l.net_amount,
        case
          when coalesce(l.vat_included, false) and coalesce(l.vat_rate, 0) > 0
            then round(coalesce(l.qty, 0) * coalesce(l.unit_price, 0) / (1 + l.vat_rate / 100.0), 4)
          else round(coalesce(l.qty, 0) * coalesce(l.unit_price, 0), 4)
        end
      ) as net_amount,
      coalesce(l.vat_amount,
        case
          when coalesce(l.vat_rate, 0) <= 0 then 0
          when coalesce(l.vat_included, false)
            then round(coalesce(l.qty, 0) * coalesce(l.unit_price, 0)
                 - (coalesce(l.qty, 0) * coalesce(l.unit_price, 0) / (1 + l.vat_rate / 100.0)), 4)
          else round(coalesce(l.qty, 0) * coalesce(l.unit_price, 0) * l.vat_rate / 100.0, 4)
        end
      ) as vat_amount,
      coalesce(l.gross_amount,
        round(
          coalesce(l.net_amount, coalesce(l.qty, 0) * coalesce(l.unit_price, 0))
          + coalesce(l.vat_amount, 0)
        , 4)
      ) as gross_amount,
      public.erp_input_vat_category_for_product(l.product_id) as expense_category
    from public.erp_documents d
    join public.erp_document_lines l on l.document_id = d.id
    left join public.erp_suppliers s on s.id = d.supplier_id
    left join lateral (
      select loc0.id
      from public.erp_locations loc0
      where loc0.default_warehouse_id = d.warehouse_id
      order by loc0.name
      limit 1
    ) loc on true
    where d.doc_type = 'receipt'
      and d.status = 'posted'
      and (
        coalesce(l.vat_amount, 0) > 0
        or coalesce(l.vat_rate, 0) > 0
        or l.vat_deduction_status is not null
      )
  loop
    if p_source_type is not null and p_source_type <> 'receipt' then continue; end if;
    if p_supplier is not null and r.supplier_id is distinct from p_supplier then continue; end if;
    if p_location is not null and r.business_location_id is distinct from p_location then continue; end if;
    if p_category is not null and r.expense_category is distinct from p_category then continue; end if;
    if p_rate is not null and round(r.tax_rate, 4) is distinct from round(p_rate, 4) then continue; end if;
    if p_status is not null and r.deduction_status is distinct from p_status then continue; end if;

    v_tx := r.doc_date;
    v_inv := r.vat_invoice_date;
    v_recog := coalesce(r.vat_invoice_date, r.doc_date);
    v_period := case v_period_mode
      when 'invoice_date' then coalesce(v_inv, v_tx)
      when 'recognition_date' then v_recog
      when 'transaction_date' then v_tx
      else coalesce(v_inv, v_tx)
    end;
    if p_from is not null and v_period < p_from then continue; end if;
    if p_to is not null and v_period > p_to then continue; end if;

    v_split := public.erp_input_vat_split(r.vat_amount, r.deduction_status, r.deductible_vat_pct);
    v_pending := v_pending + (v_split->>'pending')::numeric;
    v_ded := v_ded + (v_split->>'deductible')::numeric;
    v_nonded := v_nonded + (v_split->>'non_deductible')::numeric;
    v_vat_total := v_vat_total + coalesce(r.vat_amount, 0);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'legal_entity_id', null,
      'business_location_id', r.business_location_id,
      'supplier_id', r.supplier_id,
      'supplier_tax_id', r.supplier_tax_code,
      'supplier_name', r.supplier_name,
      'source_document_type', 'receipt',
      'source_document_id', r.document_id,
      'source_document_line_id', r.line_id,
      'source_document_no', r.doc_no,
      'invoice_number', r.vat_invoice_number,
      'invoice_series', r.vat_invoice_serial,
      'invoice_date', r.vat_invoice_date,
      'transaction_date', r.doc_date,
      'tax_recognition_date', v_recog,
      'financial_period', to_char(v_period, 'YYYY-MM'),
      'tax_period', to_char(v_period, 'YYYY-MM'),
      'expense_category', r.expense_category,
      'tax_rate', r.tax_rate,
      'net_amount', r.net_amount,
      'vat_amount', r.vat_amount,
      'gross_amount', coalesce(r.gross_amount, round(coalesce(r.net_amount,0)+coalesce(r.vat_amount,0), 4)),
      'deductible_vat', (v_split->>'deductible')::numeric,
      'non_deductible_vat', (v_split->>'non_deductible')::numeric,
      'pending_vat', (v_split->>'pending')::numeric,
      'deduction_percentage', r.deductible_vat_pct,
      'deduction_status', r.deduction_status,
      'currency', 'VND',
      'href', '/erp/documents/' || r.document_id::text
    ));
  end loop;

  -- 2) Posted expense docs (services / Grab actuals contract — never forecast)
  for r in
    select e.*
    from public.erp_expense_documents e
    where e.status = 'posted' and e.deleted_at is null
  loop
    if p_source_type is not null and p_source_type <> 'expense' then continue; end if;
    if p_legal_entity is not null and r.legal_entity_id is distinct from p_legal_entity then continue; end if;
    if p_location is not null and r.business_location_id is distinct from p_location then continue; end if;
    if p_supplier is not null and r.supplier_id is distinct from p_supplier then continue; end if;
    if p_category is not null and r.expense_category is distinct from p_category then continue; end if;
    if p_rate is not null and round(r.tax_rate, 4) is distinct from round(p_rate, 4) then continue; end if;
    if p_status is not null and r.vat_deduction_status is distinct from p_status then continue; end if;

    v_period := case v_period_mode
      when 'invoice_date' then coalesce(r.invoice_date, r.transaction_date)
      when 'recognition_date' then coalesce(r.tax_recognition_date, r.invoice_date, r.transaction_date)
      when 'transaction_date' then r.transaction_date
      else coalesce(r.tax_recognition_date, r.invoice_date, r.transaction_date)
    end;
    if p_from is not null and v_period < p_from then continue; end if;
    if p_to is not null and v_period > p_to then continue; end if;
    select name into v_sup_name from public.erp_suppliers where id = r.supplier_id;
    v_split := public.erp_input_vat_split(r.vat_amount, r.vat_deduction_status, r.deductible_vat_pct);
    v_pending := v_pending + (v_split->>'pending')::numeric;
    v_ded := v_ded + (v_split->>'deductible')::numeric;
    v_nonded := v_nonded + (v_split->>'non_deductible')::numeric;
    v_vat_total := v_vat_total + coalesce(r.vat_amount, 0);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'legal_entity_id', r.legal_entity_id,
      'business_location_id', r.business_location_id,
      'supplier_id', r.supplier_id,
      'supplier_tax_id', r.supplier_tax_id,
      'supplier_name', v_sup_name,
      'source_document_type', 'expense',
      'source_document_id', r.id,
      'source_document_line_id', null,
      'source_document_no', null,
      'invoice_number', null,
      'invoice_series', null,
      'invoice_date', r.invoice_date,
      'invoice_reference', r.tax_invoice_id,
      'transaction_date', r.transaction_date,
      'tax_recognition_date', coalesce(r.tax_recognition_date, r.invoice_date, r.transaction_date),
      'financial_period', to_char(v_period, 'YYYY-MM'),
      'tax_period', to_char(v_period, 'YYYY-MM'),
      'expense_category', r.expense_category,
      'tax_rate', r.tax_rate,
      'net_amount', r.net_amount,
      'vat_amount', r.vat_amount,
      'gross_amount', r.gross_amount,
      'deductible_vat', (v_split->>'deductible')::numeric,
      'non_deductible_vat', (v_split->>'non_deductible')::numeric,
      'pending_vat', (v_split->>'pending')::numeric,
      'deduction_percentage', r.deductible_vat_pct,
      'deduction_status', r.vat_deduction_status,
      'currency', r.currency,
      'platform_source', r.platform_source,
      'platform_fee_kind', r.platform_fee_kind,
      'href', '/erp/finance/vat/input?expense=' || r.id::text
    ));
  end loop;

  -- 3) Service tax-invoice lines with NO stock allocation (pure service invoice)
  for r in
    select i.*, il.id as line_id, il.line_no, il.expense_category, il.tax_rate,
           il.net_amount as line_net, il.vat_amount as line_vat, il.gross_amount as line_gross,
           il.vat_deduction_status, il.deductible_vat_pct
    from public.erp_tax_invoices i
    join public.erp_tax_invoice_lines il on il.invoice_id = i.id
    where i.status = 'registered' and i.deleted_at is null
      and i.invoice_type = 'service'
      and not exists (
        select 1 from public.erp_tax_invoice_allocations a
        where a.invoice_line_id = il.id or (a.invoice_id = i.id and a.source_document_type = 'receipt')
      )
  loop
    if p_source_type is not null and p_source_type <> 'tax_invoice' then continue; end if;
    if p_supplier is not null and r.supplier_id is distinct from p_supplier then continue; end if;
    if p_location is not null and r.business_location_id is distinct from p_location then continue; end if;
    if p_category is not null and r.expense_category is distinct from p_category then continue; end if;
    if p_rate is not null and round(r.tax_rate, 4) is distinct from round(p_rate, 4) then continue; end if;
    if p_status is not null and r.vat_deduction_status is distinct from p_status then continue; end if;
    if p_from is not null and r.invoice_date < p_from then continue; end if;
    if p_to is not null and r.invoice_date > p_to then continue; end if;

    v_split := public.erp_input_vat_split(r.line_vat, r.vat_deduction_status, r.deductible_vat_pct);
    v_pending := v_pending + (v_split->>'pending')::numeric;
    v_ded := v_ded + (v_split->>'deductible')::numeric;
    v_nonded := v_nonded + (v_split->>'non_deductible')::numeric;
    v_vat_total := v_vat_total + coalesce(r.line_vat, 0);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'legal_entity_id', r.legal_entity_id,
      'business_location_id', r.business_location_id,
      'supplier_id', r.supplier_id,
      'supplier_tax_id', r.supplier_tax_id,
      'supplier_name', r.supplier_name,
      'source_document_type', 'tax_invoice',
      'source_document_id', r.id,
      'source_document_line_id', r.line_id,
      'invoice_number', r.invoice_number,
      'invoice_series', r.invoice_series,
      'invoice_date', r.invoice_date,
      'transaction_date', coalesce(r.transaction_date, r.invoice_date),
      'tax_recognition_date', coalesce(r.tax_recognition_date, r.invoice_date),
      'financial_period', to_char(r.invoice_date, 'YYYY-MM'),
      'tax_period', to_char(coalesce(r.tax_recognition_date, r.invoice_date), 'YYYY-MM'),
      'expense_category', r.expense_category,
      'tax_rate', r.tax_rate,
      'net_amount', r.line_net,
      'vat_amount', r.line_vat,
      'gross_amount', r.line_gross,
      'deductible_vat', (v_split->>'deductible')::numeric,
      'non_deductible_vat', (v_split->>'non_deductible')::numeric,
      'pending_vat', (v_split->>'pending')::numeric,
      'deduction_percentage', r.deductible_vat_pct,
      'deduction_status', r.vat_deduction_status,
      'currency', r.currency,
      'href', '/erp/finance/vat/input?invoice=' || r.id::text
    ));
  end loop;

  -- Adjustment totals (absolute deduction difference) — NOT added again into vat_total liability
  select coalesce(sum(abs(coalesce(vat_deduction_difference, 0))), 0) into v_adj
  from public.erp_vat_cost_adjustments
  where status = 'posted'
    and (p_from is null or coalesce(vat_invoice_date, posted_at::date) >= p_from)
    and (p_to is null or coalesce(vat_invoice_date, posted_at::date) <= p_to);

  return jsonb_build_object(
    'rows', v_rows,
    'totals', jsonb_build_object(
      'input_vat_total', round(v_vat_total, 4),
      'deductible_vat', round(v_ded, 4),
      'pending_vat', round(v_pending, 4),
      'non_deductible_vat', round(v_nonded, 4),
      'vat_adjustments', round(v_adj, 4)
    ),
    'tax_period_mode', v_period_mode,
    'notes', jsonb_build_array(
      'Pending VAT excluded from deductible total',
      'R1 Grab forecast never included',
      'Posted VAT adjustments update source line status; not double-counted as second liability'
    )
  );
end;
$$;

-- Register tax invoice (dedupe by supplier tax + series + number + type)
create or replace function public.erp_save_tax_invoice(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_number text := btrim(coalesce(p->>'invoice_number', ''));
  v_series text := nullif(btrim(coalesce(p->>'invoice_series', '')), '');
  v_tax text := nullif(btrim(coalesce(p->>'supplier_tax_id', '')), '');
  v_type text := coalesce(nullif(p->>'invoice_type', ''), 'standard');
  v_line jsonb;
  v_i int := 0;
  v_alloc jsonb;
  v_sum_vat numeric := 0;
  v_alloc_vat numeric := 0;
begin
  if v_number = '' then perform public.erp_raise('ERP_INVALID', 'invoice_number'); end if;
  if v_type not in ('standard', 'credit', 'replacement', 'service') then
    perform public.erp_raise('ERP_INVALID', 'invoice_type');
  end if;

  if v_id is null then
    select id into v_id from public.erp_tax_invoices
    where deleted_at is null and status <> 'cancelled'
      and lower(coalesce(nullif(btrim(supplier_tax_id), ''), coalesce(supplier_id::text, '_')))
          = lower(coalesce(v_tax, coalesce(nullif(p->>'supplier_id', ''), '_')))
      and lower(coalesce(invoice_series, '')) = lower(coalesce(v_series, ''))
      and lower(btrim(invoice_number)) = lower(v_number)
      and invoice_type = v_type;
    if v_id is not null and coalesce((p->>'allow_update')::boolean, false) is not true then
      perform public.erp_raise('ERP_DUPLICATE', 'tax_invoice_already_registered');
    end if;
  end if;

  if v_id is null then
    insert into public.erp_tax_invoices (
      legal_entity_id, business_location_id, supplier_id, supplier_tax_id, supplier_name,
      invoice_number, invoice_series, invoice_symbol, invoice_type,
      invoice_date, transaction_date, tax_recognition_date, currency,
      net_amount, vat_amount, gross_amount, supporting_document_url, notes,
      status, replaces_invoice_id, created_by, updated_by
    ) values (
      nullif(p->>'legal_entity_id', '')::uuid,
      nullif(p->>'business_location_id', '')::uuid,
      nullif(p->>'supplier_id', '')::uuid,
      v_tax,
      nullif(p->>'supplier_name', ''),
      v_number, v_series, nullif(p->>'invoice_symbol', ''), v_type,
      (p->>'invoice_date')::date,
      nullif(p->>'transaction_date', '')::date,
      nullif(p->>'tax_recognition_date', '')::date,
      coalesce(nullif(p->>'currency', ''), 'VND'),
      coalesce((p->>'net_amount')::numeric, 0),
      coalesce((p->>'vat_amount')::numeric, 0),
      coalesce((p->>'gross_amount')::numeric, 0),
      nullif(p->>'supporting_document_url', ''),
      nullif(p->>'notes', ''),
      coalesce(nullif(p->>'status', ''), 'registered'),
      nullif(p->>'replaces_invoice_id', '')::uuid,
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_tax_invoices set
      supplier_id = coalesce(nullif(p->>'supplier_id', '')::uuid, supplier_id),
      supplier_tax_id = coalesce(v_tax, supplier_tax_id),
      supplier_name = coalesce(nullif(p->>'supplier_name', ''), supplier_name),
      invoice_date = coalesce(nullif(p->>'invoice_date', '')::date, invoice_date),
      transaction_date = coalesce(nullif(p->>'transaction_date', '')::date, transaction_date),
      tax_recognition_date = coalesce(nullif(p->>'tax_recognition_date', '')::date, tax_recognition_date),
      net_amount = coalesce((p->>'net_amount')::numeric, net_amount),
      vat_amount = coalesce((p->>'vat_amount')::numeric, vat_amount),
      gross_amount = coalesce((p->>'gross_amount')::numeric, gross_amount),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      status = coalesce(nullif(p->>'status', ''), status),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id and status = 'draft';
    if not found and coalesce((p->>'allow_update')::boolean, false) is not true then
      -- registered: only notes
      update public.erp_tax_invoices set notes = coalesce(nullif(p->>'notes', ''), notes), updated_at = now(), updated_by = v_actor
      where id = v_id;
    end if;
    delete from public.erp_tax_invoice_lines where invoice_id = v_id;
    delete from public.erp_tax_invoice_allocations where invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    insert into public.erp_tax_invoice_lines (
      invoice_id, line_no, expense_category, description, tax_rate,
      net_amount, vat_amount, gross_amount, vat_deduction_status, deductible_vat_pct
    ) values (
      v_id, coalesce((v_line->>'line_no')::int, v_i),
      nullif(v_line->>'expense_category', ''),
      nullif(v_line->>'description', ''),
      coalesce((v_line->>'tax_rate')::numeric, 0),
      coalesce((v_line->>'net_amount')::numeric, 0),
      coalesce((v_line->>'vat_amount')::numeric, 0),
      coalesce((v_line->>'gross_amount')::numeric, 0),
      coalesce(nullif(v_line->>'vat_deduction_status', ''), 'pending'),
      nullif(v_line->>'deductible_vat_pct', '')::numeric
    );
  end loop;

  select coalesce(sum(vat_amount), 0) into v_sum_vat from public.erp_tax_invoice_lines where invoice_id = v_id;

  for v_alloc in select * from jsonb_array_elements(coalesce(p->'allocations', '[]'::jsonb))
  loop
    insert into public.erp_tax_invoice_allocations (
      invoice_id, invoice_line_id, source_document_type, source_document_id, source_line_id,
      allocated_net, allocated_vat, allocated_gross, created_by
    ) values (
      v_id,
      nullif(v_alloc->>'invoice_line_id', '')::uuid,
      coalesce(nullif(v_alloc->>'source_document_type', ''), 'receipt'),
      (v_alloc->>'source_document_id')::uuid,
      nullif(v_alloc->>'source_line_id', '')::uuid,
      coalesce((v_alloc->>'allocated_net')::numeric, 0),
      coalesce((v_alloc->>'allocated_vat')::numeric, 0),
      coalesce((v_alloc->>'allocated_gross')::numeric, 0),
      v_actor
    );
  end loop;

  select coalesce(sum(allocated_vat), 0) into v_alloc_vat
  from public.erp_tax_invoice_allocations where invoice_id = v_id;
  if v_alloc_vat > coalesce((select vat_amount from public.erp_tax_invoices where id = v_id), v_sum_vat) + 0.0001 then
    perform public.erp_raise('ERP_INVALID', 'allocation_vat_exceeds_invoice');
  end if;

  return v_id;
end;
$$;

create or replace function public.erp_save_expense_document(p jsonb, p_actor text)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_cat text := nullif(p->>'expense_category', '');
begin
  if v_cat is null or not exists (select 1 from public.erp_input_vat_categories where code = v_cat) then
    perform public.erp_raise('ERP_INVALID', 'expense_category');
  end if;
  -- Block forecast-looking Grab without explicit actual marker
  if coalesce(p->>'from_forecast', 'false') = 'true' then
    perform public.erp_raise('ERP_INVALID', 'forecast_not_allowed_in_input_vat_register');
  end if;

  if v_id is null then
    insert into public.erp_expense_documents (
      legal_entity_id, business_location_id, supplier_id, supplier_tax_id, expense_category, description,
      currency, transaction_date, invoice_date, tax_recognition_date, tax_invoice_id,
      net_amount, tax_rate, vat_amount, gross_amount, vat_deduction_status, deductible_vat_pct,
      status, platform_source, platform_fee_kind, notes, created_by, updated_by
    ) values (
      nullif(p->>'legal_entity_id', '')::uuid,
      nullif(p->>'business_location_id', '')::uuid,
      nullif(p->>'supplier_id', '')::uuid,
      nullif(p->>'supplier_tax_id', ''),
      v_cat,
      nullif(p->>'description', ''),
      coalesce(nullif(p->>'currency', ''), 'VND'),
      (p->>'transaction_date')::date,
      nullif(p->>'invoice_date', '')::date,
      nullif(p->>'tax_recognition_date', '')::date,
      nullif(p->>'tax_invoice_id', '')::uuid,
      coalesce((p->>'net_amount')::numeric, 0),
      coalesce((p->>'tax_rate')::numeric, 0),
      coalesce((p->>'vat_amount')::numeric, 0),
      coalesce((p->>'gross_amount')::numeric, 0),
      coalesce(nullif(p->>'vat_deduction_status', ''), 'pending'),
      nullif(p->>'deductible_vat_pct', '')::numeric,
      'draft',
      nullif(p->>'platform_source', ''),
      nullif(p->>'platform_fee_kind', ''),
      nullif(p->>'notes', ''),
      v_actor, v_actor
    ) returning id into v_id;
  else
    update public.erp_expense_documents set
      expense_category = v_cat,
      description = coalesce(nullif(p->>'description', ''), description),
      transaction_date = coalesce(nullif(p->>'transaction_date', '')::date, transaction_date),
      invoice_date = coalesce(nullif(p->>'invoice_date', '')::date, invoice_date),
      tax_recognition_date = coalesce(nullif(p->>'tax_recognition_date', '')::date, tax_recognition_date),
      net_amount = coalesce((p->>'net_amount')::numeric, net_amount),
      tax_rate = coalesce((p->>'tax_rate')::numeric, tax_rate),
      vat_amount = coalesce((p->>'vat_amount')::numeric, vat_amount),
      gross_amount = coalesce((p->>'gross_amount')::numeric, gross_amount),
      vat_deduction_status = coalesce(nullif(p->>'vat_deduction_status', ''), vat_deduction_status),
      deductible_vat_pct = coalesce(nullif(p->>'deductible_vat_pct', '')::numeric, deductible_vat_pct),
      platform_source = coalesce(nullif(p->>'platform_source', ''), platform_source),
      platform_fee_kind = coalesce(nullif(p->>'platform_fee_kind', ''), platform_fee_kind),
      notes = coalesce(nullif(p->>'notes', ''), notes),
      updated_at = now(),
      updated_by = v_actor
    where id = v_id and status = 'draft' and deleted_at is null;
    if not found then perform public.erp_raise('ERP_DOCUMENT_LOCKED'); end if;
  end if;
  return v_id;
end;
$$;

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
    status = 'posted', posted_at = now(), posted_by = v_actor, updated_at = now(), updated_by = v_actor
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
  return p_id;
end;
$$;

-- Record status history when expense deduction status changes (without rewriting purchase history)
create or replace function public.erp_set_expense_vat_status(
  p_id uuid,
  p_status text,
  p_pct numeric,
  p_reason text,
  p_actor text,
  p_recognition_date date default null
)
returns uuid
language plpgsql
as $$
declare
  v_actor text := public.erp_finance_need_actor(p_actor);
  v_row public.erp_expense_documents%rowtype;
  v_split jsonb;
begin
  if p_status not in ('pending', 'deductible', 'partial', 'non_deductible') then
    perform public.erp_raise('ERP_INVALID', 'vat_deduction_status');
  end if;
  select * into v_row from public.erp_expense_documents where id = p_id and deleted_at is null for update;
  if not found then perform public.erp_raise('ERP_NOT_FOUND'); end if;
  if v_row.status <> 'posted' then perform public.erp_raise('ERP_DOCUMENT_LOCKED', v_row.status); end if;

  v_split := public.erp_input_vat_split(v_row.vat_amount, p_status, p_pct);
  insert into public.erp_input_vat_status_history (
    source_document_type, source_document_id, old_status, new_status, reason, actor,
    deductible_vat, non_deductible_vat, pending_vat, tax_recognition_date
  ) values (
    'expense', p_id, v_row.vat_deduction_status, p_status, coalesce(p_reason, 'status_change'), v_actor,
    (v_split->>'deductible')::numeric, (v_split->>'non_deductible')::numeric, (v_split->>'pending')::numeric,
    coalesce(p_recognition_date, v_row.tax_recognition_date, v_row.invoice_date, v_row.transaction_date)
  );
  update public.erp_expense_documents set
    vat_deduction_status = p_status,
    deductible_vat_pct = case when p_status = 'partial' then p_pct else deductible_vat_pct end,
    tax_recognition_date = coalesce(p_recognition_date, tax_recognition_date),
    updated_at = now(),
    updated_by = v_actor
  where id = p_id;
  return p_id;
end;
$$;

-- Hook: after vat adj post, write input VAT status history (best-effort wrapper note in comment).
-- Call from tests / optional trigger — do not rewrite adj RPCs in place beyond additive trigger.

create or replace function public.erp_input_vat_on_adj_posted()
returns trigger
language plpgsql
as $$
declare
  v_split jsonb;
  v_line public.erp_document_lines%rowtype;
begin
  if new.status is distinct from 'posted' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'posted' then return new; end if;
  if new.source_line_id is null then return new; end if;
  select * into v_line from public.erp_document_lines where id = new.source_line_id;
  if not found then return new; end if;
  v_split := public.erp_input_vat_split(
    coalesce(v_line.vat_amount, 0),
    coalesce(new.new_vat_deduction_status, v_line.vat_deduction_status),
    v_line.deductible_vat_pct
  );
  insert into public.erp_input_vat_status_history (
    source_document_type, source_document_id, source_line_id,
    old_status, new_status, reason, actor,
    deductible_vat, non_deductible_vat, pending_vat,
    tax_recognition_date, adjustment_id
  ) values (
    'receipt', new.source_document_id, new.source_line_id,
    new.previous_vat_deduction_status, new.new_vat_deduction_status,
    coalesce(new.reason, 'vat_cost_adjustment'), new.posted_by,
    (v_split->>'deductible')::numeric, (v_split->>'non_deductible')::numeric, (v_split->>'pending')::numeric,
    coalesce(new.vat_invoice_date, current_date), new.id
  );
  return new;
end;
$$;

drop trigger if exists erp_vat_adj_input_vat_hist on public.erp_vat_cost_adjustments;
create trigger erp_vat_adj_input_vat_hist
  after update of status on public.erp_vat_cost_adjustments
  for each row
  when (new.status = 'posted')
  execute function public.erp_input_vat_on_adj_posted();

-- Extend load_state with 9C parts while preserving 9B sales parts
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
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc), '[]'::jsonb)
       from (select * from public.erp_finance_transactions order by occurred_at desc limit 10000) r)
    );
  end if;
  if want is null or 'financeShifts' = any(want) then
    out := out || jsonb_build_object(
      'financeShifts',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.opened_at desc), '[]'::jsonb)
       from (select * from public.erp_finance_shifts order by opened_at desc limit 2000) r)
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
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc), '[]'::jsonb)
       from (select * from public.erp_finance_payroll order by period_end desc limit 2000) r)
    );
  end if;
  if want is null or 'legalEntities' = any(want) then
    out := out || jsonb_build_object(
      'legalEntities',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.code), '[]'::jsonb)
       from public.erp_legal_entities r where r.is_active)
    );
  end if;
  if want is null or 'salesDocuments' = any(want) then
    out := out || jsonb_build_object(
      'salesDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.business_date desc, r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_documents where deleted_at is null
             order by business_date desc, created_at desc limit 3000) r)
    );
  end if;
  if want is null or 'salesLines' = any(want) then
    out := out || jsonb_build_object(
      'salesLines',
      (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       from (select l.* from public.erp_sales_lines l
             join public.erp_sales_documents d on d.id = l.document_id
             where d.deleted_at is null order by l.document_id, l.line_no limit 20000) r)
    );
  end if;
  if want is null or 'salesSourceLinks' = any(want) then
    out := out || jsonb_build_object(
      'salesSourceLinks',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
       from (select * from public.erp_sales_source_links order by created_at desc limit 10000) r)
    );
  end if;

  -- Phase 9C
  if want is null or 'inputVatCategories' = any(want) then
    out := out || jsonb_build_object(
      'inputVatCategories',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort, r.code), '[]'::jsonb)
       from public.erp_input_vat_categories r where r.is_active)
    );
  end if;
  if want is null or 'taxInvoices' = any(want) then
    out := out || jsonb_build_object(
      'taxInvoices',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.invoice_date desc), '[]'::jsonb)
       from (select * from public.erp_tax_invoices where deleted_at is null
             order by invoice_date desc limit 3000) r)
    );
  end if;
  if want is null or 'expenseDocuments' = any(want) then
    out := out || jsonb_build_object(
      'expenseDocuments',
      (select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_date desc), '[]'::jsonb)
       from (select * from public.erp_expense_documents where deleted_at is null
             order by transaction_date desc limit 3000) r)
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
             'erp_input_vat_split', 'erp_input_vat_category_for_product', 'erp_input_vat_register',
             'erp_save_tax_invoice', 'erp_save_expense_document', 'erp_post_expense_document',
             'erp_set_expense_vat_status', 'erp_load_state'
           )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
