-- Phase 9G: Operating expenses extensions, payroll accrual fields, fixed assets,
-- AP/AR links. Extends 9C expense docs + R1 cashbook — no parallel finance engine.
-- NOT applied to production until separate owner OK.

-- ---------------------------------------------------------------------------
-- Settings (CIT / depreciation policy — accountant TBD)
-- ---------------------------------------------------------------------------
alter table public.erp_settings
  add column if not exists cit_rate numeric(8,4),
  add column if not exists cit_status text
    check (cit_status is null or cit_status in ('accountant_tbd', 'estimated', 'confirmed')),
  add column if not exists depreciation_policy_status text
    check (depreciation_policy_status is null or depreciation_policy_status in ('accountant_tbd', 'confirmed')),
  add column if not exists expense_auto_allocate boolean not null default false;

update public.erp_settings
set cit_status = coalesce(cit_status, 'accountant_tbd'),
    depreciation_policy_status = coalesce(depreciation_policy_status, 'accountant_tbd')
where id = 1;

comment on column public.erp_settings.cit_rate is
  'Phase 9G: Corporate Income Tax rate — NULL until accountant confirms. Never hard-code as final.';
comment on column public.erp_settings.expense_auto_allocate is
  'Phase 9G: automatic allocation methods OFF until owner OK.';

-- Seed opex-oriented input VAT / expense categories if missing (codes only)
insert into public.erp_input_vat_categories (code, name_en, name_ru, name_vn, sort)
select v.code, v.en, v.ru, v.vn, v.sort
from (values
  ('payroll', 'Payroll', 'Зарплата', 'Lương', 50),
  ('employer_social_insurance', 'Employer Social Insurance', 'Взносы работодателя', 'BHXH DN', 51),
  ('staff_meals', 'Staff Meals', 'Питание персонала', 'Suất ăn NV', 52),
  ('rent', 'Rent', 'Аренда', 'Thuê mặt bằng', 53),
  ('utilities', 'Utilities', 'Коммунальные', 'Điện nước', 54),
  ('operations', 'Operations', 'Операционные', 'Vận hành', 55),
  ('administration', 'Administration', 'Администрация', 'Hành chính', 56),
  ('marketing_other', 'Other Marketing', 'Прочий маркетинг', 'Marketing khác', 57),
  ('depreciation', 'Depreciation', 'Амортизация', 'Khấu hao', 58),
  ('other_opex', 'Other Operating Expenses', 'Прочие опер. расходы', 'Chi phí khác', 59)
) as v(code, en, ru, vn, sort)
where not exists (select 1 from public.erp_input_vat_categories c where c.code = v.code);

insert into public.erp_finance_categories (
  code, name, allow_income, allow_expense, show_on_pos, show_in_pnl, pnl_block, is_system, sort
)
select v.code, v.name, false, true, false, true, 'opex', false, v.sort
from (values
  ('payroll_gross', 'Payroll (accrual)', 61),
  ('employer_si', 'Employer social insurance', 62),
  ('staff_meals', 'Staff meals', 63),
  ('utilities', 'Utilities', 64),
  ('opex_other', 'Other operating expenses', 65),
  ('depreciation', 'Depreciation (non-cash)', 66),
  ('marketing', 'Marketing (non-platform)', 67)
) as v(code, name, sort)
where not exists (select 1 from public.erp_finance_categories c where c.code = v.code and c.deleted_at is null);

-- ---------------------------------------------------------------------------
-- Extend expense documents (9G-A)
-- ---------------------------------------------------------------------------
alter table public.erp_expense_documents
  add column if not exists recognition_date date,
  add column if not exists payment_due_date date,
  add column if not exists payment_date date,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'overpaid')),
  add column if not exists amount_paid numeric(18,4) not null default 0,
  add column if not exists cost_center_id uuid references public.erp_locations (id),
  add column if not exists finance_category_id uuid references public.erp_finance_categories (id),
  add column if not exists is_capitalizable boolean not null default false,
  add column if not exists supporting_document_ref text,
  add column if not exists allocation_method text
    check (allocation_method is null or allocation_method in (
      'none', 'fixed_amount', 'percentage', 'revenue_share', 'floor_area', 'staff_hours', 'manual'
    )),
  add column if not exists adjusted_of uuid references public.erp_expense_documents (id);

-- widen status check to include adjusted (drop/readd if needed)
do $$
begin
  alter table public.erp_expense_documents drop constraint if exists erp_expense_documents_status_check;
  alter table public.erp_expense_documents
    add constraint erp_expense_documents_status_check
    check (status in ('draft', 'posted', 'cancelled', 'adjusted'));
exception when others then null;
end $$;

create table if not exists public.erp_expense_lines (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.erp_expense_documents (id) on delete cascade,
  line_no integer not null default 0,
  description text,
  expense_category text references public.erp_input_vat_categories (code),
  net_amount numeric(18,4) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  vat_amount numeric(18,4) not null default 0,
  gross_amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists erp_expense_lines_exp_idx on public.erp_expense_lines (expense_id, line_no);

create table if not exists public.erp_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.erp_expense_documents (id) on delete cascade,
  location_id uuid references public.erp_locations (id),
  cost_center_id uuid references public.erp_locations (id),
  method text not null default 'manual'
    check (method in ('fixed_amount', 'percentage', 'revenue_share', 'floor_area', 'staff_hours', 'manual')),
  share_pct numeric(8,4),
  amount numeric(18,4) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists erp_expense_alloc_exp_idx on public.erp_expense_allocations (expense_id);

create table if not exists public.erp_expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.erp_expense_documents (id) on delete cascade,
  payment_key text not null,
  payment_date date not null,
  amount numeric(18,4) not null check (amount > 0),
  finance_transaction_id uuid references public.erp_finance_transactions (id),
  bank_account_id uuid references public.erp_finance_accounts (id),
  payment_reference text,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by text,
  posted_at timestamptz,
  posted_by text
);

create unique index if not exists erp_expense_payments_key_uidx
  on public.erp_expense_payments (payment_key) where status <> 'cancelled';
create unique index if not exists erp_expense_payments_cash_uidx
  on public.erp_expense_payments (finance_transaction_id)
  where finance_transaction_id is not null and status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Payroll accrual extension (9G-B) — keep erp_finance_payroll as payment bridge
-- ---------------------------------------------------------------------------
create table if not exists public.erp_payroll_accruals (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  location_id uuid references public.erp_locations (id),
  period_start date not null,
  period_end date not null,
  accrual_key text not null,
  gross_payroll numeric(18,4) not null default 0,
  employee_social_insurance numeric(18,4) not null default 0,
  employer_social_insurance numeric(18,4) not null default 0,
  personal_income_tax_withholding numeric(18,4) not null default 0,
  net_payroll numeric(18,4) not null default 0,
  overtime numeric(18,4) not null default 0,
  bonuses numeric(18,4) not null default 0,
  staff_meals numeric(18,4) not null default 0,
  other_benefits numeric(18,4) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  paid_amount numeric(18,4) not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'overpaid')),
  source_system text not null default 'manual'
    check (source_system in ('manual', 'staff_management', 'import')),
  notes text,
  posted_at timestamptz,
  posted_by text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists erp_payroll_accruals_key_uidx
  on public.erp_payroll_accruals (accrual_key) where status <> 'cancelled';

create table if not exists public.erp_payroll_payments (
  id uuid primary key default gen_random_uuid(),
  accrual_id uuid not null references public.erp_payroll_accruals (id) on delete cascade,
  payment_key text not null,
  payment_date date not null,
  amount numeric(18,4) not null check (amount > 0),
  finance_transaction_id uuid references public.erp_finance_transactions (id),
  finance_payroll_id uuid references public.erp_finance_payroll (id),
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by text,
  posted_at timestamptz,
  posted_by text
);

create unique index if not exists erp_payroll_payments_key_uidx
  on public.erp_payroll_payments (payment_key) where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Fixed assets (9G-C)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_fixed_assets (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  location_id uuid references public.erp_locations (id),
  name text not null,
  category text not null
    check (category in (
      'kitchen_equipment', 'refrigeration', 'ventilation', 'electrical',
      'furniture', 'pos_equipment', 'vehicles', 'it_equipment', 'leasehold_improvements', 'other'
    )),
  acquisition_date date not null,
  acquisition_cost numeric(18,4) not null check (acquisition_cost >= 0),
  vat_amount numeric(18,4) not null default 0,
  vat_deduction_status text not null default 'pending'
    check (vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  useful_life_months integer,
  depreciation_method text not null default 'straight_line'
    check (depreciation_method in ('straight_line', 'accountant_tbd')),
  depreciation_start_date date,
  residual_value numeric(18,4) not null default 0,
  accumulated_depreciation numeric(18,4) not null default 0,
  net_book_value numeric(18,4),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'disposed', 'cancelled')),
  expense_document_id uuid references public.erp_expense_documents (id),
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.erp_depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.erp_fixed_assets (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(18,4) not null check (amount >= 0),
  entry_key text not null,
  status text not null default 'posted'
    check (status in ('posted', 'reversed')),
  created_at timestamptz not null default now(),
  created_by text,
  unique (entry_key)
);

-- ---------------------------------------------------------------------------
-- AP/AR document links (management — not full GL)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_ap_ar_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payable', 'receivable')),
  counterparty_type text not null
    check (counterparty_type in ('supplier', 'platform', 'employee', 'tax', 'landlord', 'other')),
  counterparty_name text,
  supplier_id uuid references public.erp_suppliers (id),
  source_type text not null
    check (source_type in ('expense', 'payroll', 'vat_settlement', 'platform_payout', 'sales', 'other')),
  source_id uuid not null,
  original_amount numeric(18,4) not null,
  paid_amount numeric(18,4) not null default 0,
  outstanding_amount numeric(18,4) not null,
  due_date date,
  currency text not null default 'VND',
  status text not null default 'open'
    check (status in ('open', 'partial', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_ap_ar_kind_idx on public.erp_ap_ar_items (kind, status, due_date);

do $$
declare t text;
begin
  foreach t in array array[
    'erp_expense_lines', 'erp_expense_allocations', 'erp_expense_payments',
    'erp_payroll_accruals', 'erp_payroll_payments',
    'erp_fixed_assets', 'erp_depreciation_entries', 'erp_ap_ar_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
