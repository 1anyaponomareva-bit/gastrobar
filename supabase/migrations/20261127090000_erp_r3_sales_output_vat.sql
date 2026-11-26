-- Phase 9B: Sales documents, source links, Output VAT snapshots, COGS allocation tables.
-- Additive only. Does NOT rewrite R1/R2. Does NOT enable mass stock consume on post.
-- NOT applied to production until separate owner OK.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Legal entity (single row now; multi-entity ready)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_legal_entities (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  currency text not null default 'VND',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  -- Operational day ends at this local clock (restaurants after midnight).
  business_day_cutoff time not null default time '05:00',
  tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists erp_legal_entities_code_uidx
  on public.erp_legal_entities (lower(code));

insert into public.erp_legal_entities (code, name, currency, timezone, business_day_cutoff)
select 'GASTROFOOD', 'GASTROFOOD', 'VND', 'Asia/Ho_Chi_Minh', time '05:00'
where not exists (select 1 from public.erp_legal_entities where lower(code) = 'gastrofood');

alter table public.erp_settings
  add column if not exists default_legal_entity_id uuid references public.erp_legal_entities (id),
  add column if not exists sales_auto_consume_stock boolean not null default false;

update public.erp_settings s
set default_legal_entity_id = e.id
from public.erp_legal_entities e
where s.id = 1 and s.default_legal_entity_id is null and lower(e.code) = 'gastrofood';

comment on column public.erp_settings.sales_auto_consume_stock is
  'Phase 9B: when true, posting COGS may call erp_consume. Default false — never mass-auto on production without OK.';

-- ---------------------------------------------------------------------------
-- Sales documents
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_documents (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  legal_entity_id uuid not null references public.erp_legal_entities (id),
  business_location_id uuid references public.erp_locations (id),
  sales_channel_id uuid references public.erp_sales_channels (id),
  warehouse_id uuid references public.erp_warehouses (id),
  -- Internal + external identity
  internal_order_id text not null default replace(gen_random_uuid()::text, '-', ''),
  canonical_order_key text not null,
  external_order_id text,
  source_system text not null default 'manual'
    check (source_system in ('manual', 'poster', 'grab', 'import')),
  currency text not null default 'VND',
  order_at timestamptz not null default now(),
  business_date date not null,
  -- Status
  order_status text not null default 'draft'
    check (order_status in ('draft', 'posted', 'cancelled', 'partially_refunded', 'refunded')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid', 'refunded', 'charged_back', 'unknown')),
  reconciliation_status text not null default 'unmatched'
    check (reconciliation_status in ('exact_match', 'manual_match', 'unmatched', 'conflict')),
  -- Money (document totals; lines are source of truth when present)
  gross_sales numeric(18,4) not null default 0 check (gross_sales >= 0),
  merchant_funded_discount numeric(18,4) not null default 0 check (merchant_funded_discount >= 0),
  platform_funded_discount numeric(18,4) not null default 0 check (platform_funded_discount >= 0),
  taxable_amount numeric(18,4),
  output_vat_rate numeric(8,4),
  output_vat_amount numeric(18,4),
  net_revenue numeric(18,4),
  -- Output VAT snapshot (frozen on post)
  output_vat_rate_source text,
  output_vat_exception_ids uuid[],
  output_vat_rule_ref text,
  output_vat_snapshot jsonb,
  -- COGS
  actual_cogs numeric(18,4),
  cogs_status text not null default 'none'
    check (cogs_status in ('none', 'pending', 'posted', 'partial', 'reversed', 'skipped')),
  cogs_pending_reason text,
  stock_consume_enabled boolean not null default false,
  stock_document_id uuid references public.erp_documents (id),
  -- Provenance / raw payloads (never overwrite one source with another)
  poster_payload jsonb,
  grab_payload jsonb,
  source_gross_sales numeric(18,4),
  source_gross_sales_system text,
  notes text,
  posted_at timestamptz,
  posted_by text,
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create unique index if not exists erp_sales_docs_canonical_uidx
  on public.erp_sales_documents (canonical_order_key)
  where deleted_at is null and order_status <> 'cancelled';

create unique index if not exists erp_sales_docs_internal_uidx
  on public.erp_sales_documents (internal_order_id)
  where deleted_at is null;

create index if not exists erp_sales_docs_business_date_idx
  on public.erp_sales_documents (business_date desc)
  where deleted_at is null;

create index if not exists erp_sales_docs_channel_idx
  on public.erp_sales_documents (sales_channel_id, business_date desc)
  where deleted_at is null;

create index if not exists erp_sales_docs_status_idx
  on public.erp_sales_documents (order_status)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Sales lines
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.erp_sales_documents (id) on delete cascade,
  line_no integer not null default 0,
  product_id uuid references public.erp_products (id),
  dish_id uuid references public.erp_dishes (id),
  description text,
  quantity numeric(18,6) not null check (quantity > 0),
  unit_price numeric(18,4),
  gross_sales numeric(18,4) not null default 0 check (gross_sales >= 0),
  merchant_funded_discount numeric(18,4) not null default 0,
  platform_funded_discount numeric(18,4) not null default 0,
  taxable_amount numeric(18,4),
  output_vat_rate numeric(8,4),
  output_vat_amount numeric(18,4),
  net_revenue numeric(18,4),
  output_vat_rate_source text,
  output_vat_exception_id uuid,
  output_vat_snapshot jsonb,
  -- Modifiers / prep choices (Poster composition)
  modifiers jsonb not null default '[]'::jsonb,
  prep_product_ids uuid[] not null default '{}',
  actual_cogs numeric(18,4),
  cogs_status text not null default 'none'
    check (cogs_status in ('none', 'pending', 'posted', 'partial', 'reversed', 'skipped')),
  cogs_pending_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, line_no)
);

create index if not exists erp_sales_lines_doc_idx on public.erp_sales_lines (document_id);
create index if not exists erp_sales_lines_dish_idx on public.erp_sales_lines (dish_id) where dish_id is not null;
create index if not exists erp_sales_lines_product_idx on public.erp_sales_lines (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- Source links (dedupe / reconciliation)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_source_links (
  id uuid primary key default gen_random_uuid(),
  sales_document_id uuid not null references public.erp_sales_documents (id) on delete cascade,
  source_system text not null check (source_system in ('poster', 'grab', 'manual', 'import')),
  external_id text not null,
  account_or_location_key text not null default '',
  match_kind text not null default 'exact'
    check (match_kind in ('exact', 'manual', 'unmatched', 'conflict')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  unique (source_system, account_or_location_key, external_id)
);

create index if not exists erp_sales_source_links_doc_idx
  on public.erp_sales_source_links (sales_document_id);

-- ---------------------------------------------------------------------------
-- COGS allocations (link sale line → FIFO lots / movements)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_cogs_allocations (
  id uuid primary key default gen_random_uuid(),
  sales_document_id uuid not null references public.erp_sales_documents (id) on delete cascade,
  sales_line_id uuid not null references public.erp_sales_lines (id) on delete cascade,
  product_id uuid not null references public.erp_products (id),
  warehouse_id uuid not null references public.erp_warehouses (id),
  lot_id uuid references public.erp_lots (id),
  movement_id bigint references public.erp_movements (id),
  qty numeric(18,6) not null check (qty <> 0),
  unit_cost numeric(18,6),
  amount numeric(18,4),
  is_reversal boolean not null default false,
  reversal_of uuid references public.erp_sales_cogs_allocations (id),
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists erp_sales_cogs_doc_idx on public.erp_sales_cogs_allocations (sales_document_id);
create index if not exists erp_sales_cogs_line_idx on public.erp_sales_cogs_allocations (sales_line_id);
create unique index if not exists erp_sales_cogs_movement_uidx
  on public.erp_sales_cogs_allocations (movement_id)
  where movement_id is not null and is_reversal = false;

-- ---------------------------------------------------------------------------
-- Import batches (stubs / contracts; no auto historical load)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('poster', 'grab', 'import')),
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'applied', 'cancelled')),
  file_name text,
  row_count integer not null default 0,
  applied_count integer not null default 0,
  skipped_count integer not null default 0,
  conflict_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  applied_at timestamptz,
  applied_by text
);

-- ---------------------------------------------------------------------------
-- RLS / grants (service_role only — same pattern as finance)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'erp_legal_entities',
    'erp_sales_documents',
    'erp_sales_lines',
    'erp_sales_source_links',
    'erp_sales_cogs_allocations',
    'erp_sales_import_batches'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
