-- Phase 9E: VAT Settlement (payable / carryforward / payments).
-- Reads 9B Output + 9C Input + 9D platform VAT + R2 adjustments. No parallel tax registers.
-- NOT applied to production until separate owner OK.

alter table public.erp_settings
  add column if not exists vat_settlement_period_kind text
    check (vat_settlement_period_kind is null or vat_settlement_period_kind in ('monthly', 'quarterly', 'accountant_tbd'));

update public.erp_settings
set vat_settlement_period_kind = coalesce(vat_settlement_period_kind, 'accountant_tbd')
where id = 1;

comment on column public.erp_settings.vat_settlement_period_kind is
  'Phase 9E: company VAT filing cadence — default accountant_tbd until accountant confirms.';

-- ---------------------------------------------------------------------------
-- Settlements
-- ---------------------------------------------------------------------------
create table if not exists public.erp_vat_settlements (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  period_kind text not null
    check (period_kind in ('monthly', 'quarterly', 'custom')),
  period_start date not null,
  period_end date not null,
  tax_recognition_basis text not null default 'accountant_tbd'
    check (tax_recognition_basis in (
      'invoice_date', 'recognition_date', 'transaction_date', 'business_date', 'accountant_tbd'
    )),
  declaration_reference text,
  filing_date date,
  payment_due_date date,
  -- Status
  settlement_status text not null default 'draft'
    check (settlement_status in ('draft', 'calculated', 'under_review', 'approved', 'filed', 'amended')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'overpaid')),
  is_final boolean not null default false,  -- false when completeness warnings exist
  -- Snapshot amounts (frozen on approve)
  output_vat numeric(18,4) not null default 0,
  total_input_vat numeric(18,4) not null default 0,
  deductible_input_vat numeric(18,4) not null default 0,
  pending_input_vat numeric(18,4) not null default 0,
  non_deductible_input_vat numeric(18,4) not null default 0,
  vat_adjustments numeric(18,4) not null default 0,  -- applicable only; not double-counted from registers
  opening_carryforward numeric(18,4) not null default 0,
  applied_carryforward numeric(18,4) not null default 0,
  vat_payable numeric(18,4) not null default 0,
  potential_carryforward numeric(18,4) not null default 0,
  vat_paid numeric(18,4) not null default 0,
  outstanding_liability numeric(18,4) not null default 0,
  -- Completeness
  warnings jsonb not null default '[]'::jsonb,
  snapshot jsonb,                 -- full source totals + rule refs at approve
  rule_ref text not null default 'erp_vat_settlement_compute@9e',
  notes text,
  calculated_at timestamptz,
  calculated_by text,
  approved_at timestamptz,
  approved_by text,
  amended_of uuid references public.erp_vat_settlements (id),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists erp_vat_settlements_period_uidx
  on public.erp_vat_settlements (coalesce(legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end, period_kind)
  where settlement_status not in ('amended') and amended_of is null;

create index if not exists erp_vat_settlements_status_idx
  on public.erp_vat_settlements (settlement_status, period_end desc);

create table if not exists public.erp_vat_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.erp_vat_settlements (id) on delete cascade,
  line_kind text not null
    check (line_kind in (
      'output', 'input_deductible', 'input_pending', 'input_non_deductible',
      'adjustment', 'carryforward_open', 'carryforward_applied', 'payment', 'warning', 'other'
    )),
  source_system text,             -- sales | purchase | expense | platform | vat_adj | carryforward | payment
  source_document_type text,
  source_document_id uuid,
  description text,
  tax_rate numeric(8,4),
  amount numeric(18,4) not null default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists erp_vat_settlement_lines_set_idx
  on public.erp_vat_settlement_lines (settlement_id, line_kind);

-- ---------------------------------------------------------------------------
-- Carryforwards
-- ---------------------------------------------------------------------------
create table if not exists public.erp_vat_carryforwards (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  source_settlement_id uuid references public.erp_vat_settlements (id),
  source_period_start date,
  source_period_end date,
  opening_amount numeric(18,4) not null check (opening_amount >= 0),
  applied_amount numeric(18,4) not null default 0 check (applied_amount >= 0),
  remaining_amount numeric(18,4) not null check (remaining_amount >= 0),
  destination_settlement_id uuid references public.erp_vat_settlements (id),
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'approved', 'exhausted', 'cancelled')),
  is_opening_balance boolean not null default false,  -- pre-ERP opening requires explicit doc
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  approved_at timestamptz,
  approved_by text,
  constraint erp_vat_cf_remaining_check check (remaining_amount = opening_amount - applied_amount)
);

create index if not exists erp_vat_cf_open_idx
  on public.erp_vat_carryforwards (legal_entity_id, approval_status)
  where approval_status = 'approved' and remaining_amount > 0;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.erp_vat_payments (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  payment_key text not null,          -- idempotency
  payment_date date not null,
  amount numeric(18,4) not null check (amount > 0),
  currency text not null default 'VND',
  bank_account_id uuid references public.erp_finance_accounts (id),
  finance_transaction_id uuid references public.erp_finance_transactions (id),
  payment_reference text,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  posted_at timestamptz,
  posted_by text
);

create unique index if not exists erp_vat_payments_key_uidx
  on public.erp_vat_payments (payment_key)
  where status <> 'cancelled';

create unique index if not exists erp_vat_payments_cash_uidx
  on public.erp_vat_payments (finance_transaction_id)
  where finance_transaction_id is not null and status <> 'cancelled';

create table if not exists public.erp_vat_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.erp_vat_payments (id) on delete cascade,
  settlement_id uuid not null references public.erp_vat_settlements (id),
  allocated_amount numeric(18,4) not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  created_by text,
  unique (payment_id, settlement_id)
);

-- Period correction documents (tax register corrections — not stock cost adj)
create table if not exists public.erp_vat_period_corrections (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  original_period_start date,
  original_period_end date,
  recognition_period_start date not null,
  recognition_period_end date not null,
  original_settlement_id uuid references public.erp_vat_settlements (id),
  original_document_ref text,
  adjustment_amount numeric(18,4) not null,
  adjustment_reason text not null,
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'approved', 'cancelled')),
  applied_settlement_id uuid references public.erp_vat_settlements (id),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  notes text
);

do $$
declare t text;
begin
  foreach t in array array[
    'erp_vat_settlements',
    'erp_vat_settlement_lines',
    'erp_vat_carryforwards',
    'erp_vat_payments',
    'erp_vat_payment_allocations',
    'erp_vat_period_corrections'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
