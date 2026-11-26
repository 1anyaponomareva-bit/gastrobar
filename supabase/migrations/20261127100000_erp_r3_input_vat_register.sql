-- Phase 9C: Unified Input VAT register (reads R2 purchase/lots/adjustments).
-- Additive. Does NOT rewrite historical purchase docs. Does NOT invent a second VAT engine.
-- NOT applied to production until separate owner OK.

-- ---------------------------------------------------------------------------
-- Expense / Input VAT category catalog (contracts for future sources)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_input_vat_categories (
  code text primary key,
  name_en text not null,
  name_ru text,
  name_vn text,
  sort integer not null default 100,
  is_active boolean not null default true
);

insert into public.erp_input_vat_categories (code, name_en, name_ru, name_vn, sort) values
  ('ingredients', 'Ingredients', 'Ингредиенты', 'Nguyên liệu', 10),
  ('packaging', 'Packaging', 'Упаковка', 'Bao bì', 20),
  ('equipment', 'Equipment', 'Оборудование', 'Thiết bị', 30),
  ('fixed_assets', 'Fixed Assets', 'Основные средства', 'TSCĐ', 40),
  ('platform_commission', 'Platform Commission', 'Комиссия платформы', 'Hoa hồng sàn', 50),
  ('platform_advertising', 'Platform Advertising', 'Реклама платформы', 'Quảng cáo sàn', 60),
  ('rent', 'Rent', 'Аренда', 'Thuê', 70),
  ('electricity', 'Electricity', 'Электричество', 'Điện', 80),
  ('water', 'Water', 'Вода', 'Nước', 90),
  ('gas', 'Gas', 'Газ', 'Gas', 100),
  ('internet', 'Internet', 'Интернет', 'Internet', 110),
  ('transportation', 'Transportation', 'Транспорт', 'Vận chuyển', 120),
  ('maintenance', 'Maintenance', 'Ремонт / ТО', 'Bảo trì', 130),
  ('professional_services', 'Professional Services', 'Проф. услуги', 'Dịch vụ chuyên môn', 140),
  ('software_subscriptions', 'Software Subscriptions', 'ПО / подписки', 'Phần mềm', 150),
  ('other_expenses', 'Other Expenses', 'Прочие расходы', 'Chi khác', 900)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Supplier tax invoices (supports 1:N / N:1 with receipts; multi-rate; services)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  business_location_id uuid references public.erp_locations (id),
  supplier_id uuid references public.erp_suppliers (id),
  supplier_tax_id text,
  supplier_name text,
  invoice_number text not null,
  invoice_series text,
  invoice_symbol text,
  invoice_type text not null default 'standard'
    check (invoice_type in ('standard', 'credit', 'replacement', 'service')),
  invoice_date date not null,
  transaction_date date,
  tax_recognition_date date,
  currency text not null default 'VND',
  net_amount numeric(18,4) not null default 0 check (net_amount >= 0),
  vat_amount numeric(18,4) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(18,4) not null default 0 check (gross_amount >= 0),
  supporting_document_url text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'registered', 'cancelled')),
  replaces_invoice_id uuid references public.erp_tax_invoices (id),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

-- Number alone is NOT globally unique — supplier tax id + series + number + type
create unique index if not exists erp_tax_invoices_identity_uidx
  on public.erp_tax_invoices (
    lower(coalesce(nullif(btrim(supplier_tax_id), ''), coalesce(supplier_id::text, '_'))),
    lower(coalesce(nullif(btrim(invoice_series), ''), '')),
    lower(btrim(invoice_number)),
    invoice_type
  )
  where deleted_at is null and status <> 'cancelled';

create index if not exists erp_tax_invoices_date_idx
  on public.erp_tax_invoices (invoice_date desc)
  where deleted_at is null;

create table if not exists public.erp_tax_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.erp_tax_invoices (id) on delete cascade,
  line_no integer not null default 1,
  expense_category text references public.erp_input_vat_categories (code),
  description text,
  tax_rate numeric(8,4) not null default 0,
  net_amount numeric(18,4) not null default 0 check (net_amount >= 0),
  vat_amount numeric(18,4) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(18,4) not null default 0 check (gross_amount >= 0),
  vat_deduction_status text not null default 'pending'
    check (vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  deductible_vat_pct numeric(5,2)
    check (deductible_vat_pct is null or (deductible_vat_pct >= 0 and deductible_vat_pct <= 100)),
  unique (invoice_id, line_no)
);

create table if not exists public.erp_tax_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.erp_tax_invoices (id) on delete cascade,
  invoice_line_id uuid references public.erp_tax_invoice_lines (id) on delete cascade,
  source_document_type text not null
    check (source_document_type in ('receipt', 'expense', 'other')),
  source_document_id uuid not null,
  source_line_id uuid,
  allocated_net numeric(18,4) not null default 0 check (allocated_net >= 0),
  allocated_vat numeric(18,4) not null default 0 check (allocated_vat >= 0),
  allocated_gross numeric(18,4) not null default 0 check (allocated_gross >= 0),
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists erp_tax_inv_alloc_doc_idx
  on public.erp_tax_invoice_allocations (source_document_type, source_document_id);

-- ---------------------------------------------------------------------------
-- Expense documents — contract for Phase 9G (services without stock receipt)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_expense_documents (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  business_location_id uuid references public.erp_locations (id),
  supplier_id uuid references public.erp_suppliers (id),
  supplier_tax_id text,
  expense_category text not null references public.erp_input_vat_categories (code),
  description text,
  currency text not null default 'VND',
  transaction_date date not null,
  invoice_date date,
  tax_recognition_date date,
  tax_invoice_id uuid references public.erp_tax_invoices (id),
  net_amount numeric(18,4) not null default 0 check (net_amount >= 0),
  tax_rate numeric(8,4) not null default 0,
  vat_amount numeric(18,4) not null default 0 check (vat_amount >= 0),
  gross_amount numeric(18,4) not null default 0 check (gross_amount >= 0),
  vat_deduction_status text not null default 'pending'
    check (vat_deduction_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  deductible_vat_pct numeric(5,2),
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  -- Platform contract markers (Grab etc.) — filled only from actual docs, never R1 forecast
  platform_source text
    check (platform_source is null or platform_source in ('grab', 'other_platform')),
  platform_fee_kind text
    check (platform_fee_kind is null or platform_fee_kind in ('commission', 'advertising', 'service_fee')),
  notes text,
  posted_at timestamptz,
  posted_by text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create index if not exists erp_expense_docs_date_idx
  on public.erp_expense_documents (transaction_date desc)
  where deleted_at is null;

comment on table public.erp_expense_documents is
  'Phase 9C contract for service/expense Input VAT without stock receipt. Full opex module = Phase 9G.';
comment on column public.erp_expense_documents.platform_source is
  'Grab/platform actual docs only. R1 forecast commission/ads must NEVER populate this table.';

-- ---------------------------------------------------------------------------
-- Deduction status history (date, reason, actor)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_input_vat_status_history (
  id uuid primary key default gen_random_uuid(),
  source_document_type text not null,
  source_document_id uuid not null,
  source_line_id uuid,
  old_status text,
  new_status text not null
    check (new_status in ('pending', 'deductible', 'partial', 'non_deductible')),
  reason text,
  deductible_vat numeric(18,4),
  non_deductible_vat numeric(18,4),
  pending_vat numeric(18,4),
  tax_recognition_date date,
  actor text,
  created_at timestamptz not null default now(),
  adjustment_id uuid references public.erp_vat_cost_adjustments (id)
);

create index if not exists erp_input_vat_hist_src_idx
  on public.erp_input_vat_status_history (source_document_type, source_document_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Settings: open tax-policy questions (no hard-coded final law)
-- ---------------------------------------------------------------------------
alter table public.erp_settings
  add column if not exists input_vat_tax_period_mode text
    check (input_vat_tax_period_mode is null or input_vat_tax_period_mode in (
      'invoice_date', 'recognition_date', 'transaction_date', 'accountant_tbd'
    ));

update public.erp_settings
set input_vat_tax_period_mode = coalesce(input_vat_tax_period_mode, 'accountant_tbd')
where id = 1;

comment on column public.erp_settings.input_vat_tax_period_mode is
  'Phase 9C: tax period basis for Input VAT — default accountant_tbd until accountant confirms (Phase 9E).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'erp_input_vat_categories',
    'erp_tax_invoices',
    'erp_tax_invoice_lines',
    'erp_tax_invoice_allocations',
    'erp_expense_documents',
    'erp_input_vat_status_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
