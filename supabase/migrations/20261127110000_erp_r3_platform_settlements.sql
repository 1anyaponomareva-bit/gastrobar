-- Phase 9D: Platform accounts, settlements, payouts, reconciliation (Grab + future aggregators).
-- Additive. Does NOT invent GrabMerchant raw column names — mapping table awaits owner sample.
-- NOT applied to production until separate owner OK.

-- ---------------------------------------------------------------------------
-- Platform accounts (Grab / Shopee / …)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_accounts (
  id uuid primary key default gen_random_uuid(),
  platform_code text not null
    check (platform_code in ('grab', 'shopee', 'other')),
  merchant_id text not null,
  store_id text,
  display_name text not null,
  legal_entity_id uuid references public.erp_legal_entities (id),
  business_location_id uuid references public.erp_locations (id),
  sales_channel_id uuid references public.erp_sales_channels (id),
  currency text not null default 'VND',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists erp_platform_accounts_uidx
  on public.erp_platform_accounts (platform_code, lower(merchant_id), coalesce(lower(store_id), ''));

-- Column maps for raw vendor reports (empty until owner provides sample + mapping)
create table if not exists public.erp_platform_column_maps (
  id uuid primary key default gen_random_uuid(),
  platform_code text not null,
  format_key text not null,           -- e.g. grab_merchant_csv_v1 — only after real sample
  version text not null default '1',
  header_fingerprint text,            -- hash of sorted header names from real file
  mapping jsonb not null default '{}'::jsonb,  -- { "normalized_field": "Raw Column Name" }
  notes text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  unique (platform_code, format_key, version)
);

comment on table public.erp_platform_column_maps is
  'Phase 9D: raw Grab/Shopee column maps. Do NOT invent Grab headers — activate only after owner sample.';

-- ---------------------------------------------------------------------------
-- Import batches (upload → … → apply)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_import_batches (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid references public.erp_platform_accounts (id),
  platform_code text not null default 'grab',
  source_format text not null
    check (source_format in (
      'normalized_json_v1',
      'normalized_csv_v1',
      'grab_merchant_csv',   -- requires active column map
      'grab_merchant_xlsx',  -- architecture; parser gated on map + library
      'other'
    )),
  status text not null default 'uploaded'
    check (status in (
      'uploaded', 'parsed', 'validated', 'preview', 'reconciled',
      'confirmed', 'applied', 'rejected', 'failed'
    )),
  file_name text,
  file_sha256 text,
  file_storage_ref text,          -- protected path / URL placeholder (not auto-upload to prod)
  row_count integer not null default 0,
  error_count integer not null default 0,
  preview jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  confirmed_at timestamptz,
  confirmed_by text,
  applied_at timestamptz,
  applied_by text
);

create unique index if not exists erp_platform_import_sha_uidx
  on public.erp_platform_import_batches (platform_code, file_sha256)
  where file_sha256 is not null and status not in ('rejected', 'failed');

create index if not exists erp_platform_import_status_idx
  on public.erp_platform_import_batches (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Settlements (header per period / payout cycle)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_settlements (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null references public.erp_platform_accounts (id),
  import_batch_id uuid references public.erp_platform_import_batches (id),
  legal_entity_id uuid references public.erp_legal_entities (id),
  business_location_id uuid references public.erp_locations (id),
  sales_channel_id uuid references public.erp_sales_channels (id),
  settlement_key text not null,           -- idempotent key: platform:merchant:period_or_ref
  period_from date,
  period_to date,
  settlement_date date,
  currency text not null default 'VND',
  -- Aggregates (nullable = unknown, never auto-zero)
  gross_sales numeric(18,4),
  merchant_funded_discounts numeric(18,4),
  platform_funded_discounts numeric(18,4),
  net_sales numeric(18,4),
  platform_commission numeric(18,4),
  commission_vat numeric(18,4),
  commission_vat_status text
    check (commission_vat_status is null or commission_vat_status in (
      'unverified', 'pending', 'deductible', 'partial', 'non_deductible'
    )),
  advertising_expenses numeric(18,4),
  advertising_vat numeric(18,4),
  advertising_vat_status text
    check (advertising_vat_status is null or advertising_vat_status in (
      'unverified', 'pending', 'deductible', 'partial', 'non_deductible'
    )),
  service_fees numeric(18,4),
  refunds numeric(18,4),
  chargebacks numeric(18,4),
  financial_adjustments numeric(18,4),
  net_earnings numeric(18,4),
  net_earnings_after_marketing numeric(18,4),
  expected_payout numeric(18,4),
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  is_estimated boolean not null default false,  -- true only if explicitly marked Estimated
  source_payload jsonb,
  notes text,
  posted_at timestamptz,
  posted_by text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists erp_platform_settlements_key_uidx
  on public.erp_platform_settlements (settlement_key)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Settlement lines (order / fee level)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.erp_platform_settlements (id) on delete cascade,
  import_batch_id uuid references public.erp_platform_import_batches (id),
  line_kind text not null default 'order'
    check (line_kind in ('order', 'commission', 'advertising', 'refund', 'chargeback', 'adjustment', 'fee', 'other')),
  external_order_id text,
  operation_key text not null,          -- idempotent: settlement_key + kind + external ids
  order_at timestamptz,
  settlement_date date,
  -- Raw source values (json) vs normalized
  raw_values jsonb,
  gross_sales numeric(18,4),
  merchant_funded_discount numeric(18,4),
  platform_funded_discount numeric(18,4),
  net_sales numeric(18,4),
  platform_commission numeric(18,4),
  commission_vat numeric(18,4),
  advertising_expense numeric(18,4),
  advertising_vat numeric(18,4),
  service_fee numeric(18,4),
  refund_amount numeric(18,4),
  chargeback_amount numeric(18,4),
  financial_adjustment numeric(18,4),
  net_earnings numeric(18,4),
  currency text not null default 'VND',
  -- Links to Phase 9B sales
  sales_document_id uuid references public.erp_sales_documents (id),
  canonical_order_key text,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'partially_matched', 'unmatched', 'conflict', 'manually_matched')),
  match_diff numeric(18,4),
  match_reason text,
  -- Advertising attribution
  advertising_campaign text,
  advertising_period_from date,
  advertising_period_to date,
  advertising_source text
    check (advertising_source is null or advertising_source in ('settlement', 'ads_report', 'manual')),
  -- Tax
  tax_invoice_id uuid references public.erp_tax_invoices (id),
  expense_document_id uuid references public.erp_expense_documents (id),
  vat_deduction_status text
    check (vat_deduction_status is null or vat_deduction_status in (
      'unverified', 'pending', 'deductible', 'partial', 'non_deductible'
    )),
  is_duplicate boolean not null default false,
  is_adjustment_of uuid references public.erp_platform_settlement_lines (id),
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists erp_platform_settlement_lines_op_uidx
  on public.erp_platform_settlement_lines (operation_key)
  where not is_duplicate;

create index if not exists erp_platform_settlement_lines_ext_idx
  on public.erp_platform_settlement_lines (external_order_id)
  where external_order_id is not null;

create index if not exists erp_platform_settlement_lines_match_idx
  on public.erp_platform_settlement_lines (match_status);

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_payouts (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null references public.erp_platform_accounts (id),
  payout_key text not null,
  payout_reference text,
  payout_date date not null,
  currency text not null default 'VND',
  expected_amount numeric(18,4),
  actual_amount numeric(18,4),
  outstanding_amount numeric(18,4),
  bank_account_id uuid references public.erp_finance_accounts (id),
  finance_transaction_id uuid references public.erp_finance_transactions (id),
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled', 'partial')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  posted_at timestamptz,
  posted_by text
);

create unique index if not exists erp_platform_payouts_key_uidx
  on public.erp_platform_payouts (payout_key)
  where status <> 'cancelled';

create table if not exists public.erp_platform_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.erp_platform_payouts (id) on delete cascade,
  settlement_id uuid not null references public.erp_platform_settlements (id),
  allocated_amount numeric(18,4) not null check (allocated_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  unique (payout_id, settlement_id)
);

-- ---------------------------------------------------------------------------
-- Reconciliation (payout vs bank vs settlement; poster vs grab)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_platform_reconciliation (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid references public.erp_platform_accounts (id),
  kind text not null
    check (kind in ('order_match', 'payout_bank', 'advertising_source', 'period_balance')),
  status text not null default 'open'
    check (status in ('open', 'matched', 'partially_matched', 'unmatched', 'conflict', 'manually_matched', 'closed')),
  settlement_id uuid references public.erp_platform_settlements (id),
  settlement_line_id uuid references public.erp_platform_settlement_lines (id),
  sales_document_id uuid references public.erp_sales_documents (id),
  payout_id uuid references public.erp_platform_payouts (id),
  finance_transaction_id uuid references public.erp_finance_transactions (id),
  poster_amount numeric(18,4),
  grab_amount numeric(18,4),
  difference numeric(18,4),
  reason text,
  period_from date,
  period_to date,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  -- Prevent re-linking same bank tx as new cash
  unique_bank_link text generated always as (
    case when finance_transaction_id is not null and kind = 'payout_bank'
      then finance_transaction_id::text else null end
  ) stored
);

create unique index if not exists erp_platform_recon_bank_uidx
  on public.erp_platform_reconciliation (unique_bank_link)
  where unique_bank_link is not null;

-- Seed default Grab account shell (no amounts)
insert into public.erp_platform_accounts (platform_code, merchant_id, store_id, display_name, currency)
select 'grab', 'PENDING_OWNER', null, 'GrabFood (configure merchant id)', 'VND'
where not exists (
  select 1 from public.erp_platform_accounts where platform_code = 'grab' and merchant_id = 'PENDING_OWNER'
);

-- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'erp_platform_accounts',
    'erp_platform_column_maps',
    'erp_platform_import_batches',
    'erp_platform_settlements',
    'erp_platform_settlement_lines',
    'erp_platform_payouts',
    'erp_platform_payout_allocations',
    'erp_platform_reconciliation'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
