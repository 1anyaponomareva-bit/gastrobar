-- Phase 9F-A/B: Dish BOM snapshots + Actual COGS extensions.
-- Reuses R2 recipes / erp_count_explode stocked-prep rules. No second recipe engine.
-- NOT applied to production until separate owner OK. Auto-consume remains OFF by default.

-- ---------------------------------------------------------------------------
-- Modifier → product maps (Poster external → ERP). Unmapped = Mapping Required.
-- ---------------------------------------------------------------------------
create table if not exists public.erp_modifier_product_maps (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'poster'
    check (source_system in ('poster', 'grab', 'manual', 'import')),
  external_key text not null,
  external_name text,
  product_id uuid references public.erp_products (id),
  dish_id uuid references public.erp_dishes (id),
  default_qty numeric(18,6) not null default 1 check (default_qty > 0),
  op_hint text check (op_hint is null or op_hint in ('add', 'exclude', 'replace', 'choose')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (source_system, external_key)
);

create index if not exists erp_modifier_maps_product_idx
  on public.erp_modifier_product_maps (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- BOM snapshots (frozen composition at sale)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_bom_snapshots (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references public.erp_sales_lines (id) on delete cascade,
  sales_document_id uuid not null references public.erp_sales_documents (id) on delete cascade,
  dish_id uuid references public.erp_dishes (id),
  quantity numeric(18,6) not null check (quantity > 0),
  status text not null default 'complete'
    check (status in ('complete', 'partial', 'mapping_required', 'error')),
  rule_ref text not null default 'erp_sales_bom_explode@9f',
  modifiers_snapshot jsonb not null default '[]'::jsonb,
  prep_product_ids uuid[] not null default '{}',
  warnings jsonb not null default '[]'::jsonb,
  exploded_at timestamptz not null default now(),
  created_by text,
  unique (sales_line_id)
);

create index if not exists erp_sales_bom_snap_doc_idx
  on public.erp_sales_bom_snapshots (sales_document_id);

create table if not exists public.erp_sales_bom_snapshot_lines (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.erp_sales_bom_snapshots (id) on delete cascade,
  line_no integer not null default 0,
  product_id uuid references public.erp_products (id),
  qty numeric(18,6) not null,
  cogs_kind text not null default 'food'
    check (cogs_kind in ('food', 'packaging', 'other')),
  source_kind text,
  source_id uuid,
  recipe_id uuid,
  mapping_status text not null default 'mapped'
    check (mapping_status in ('mapped', 'mapping_required', 'excluded', 'replaced')),
  external_key text,
  external_name text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists erp_sales_bom_snap_lines_idx
  on public.erp_sales_bom_snapshot_lines (snapshot_id, line_no);

-- ---------------------------------------------------------------------------
-- Pending COGS (insufficient stock — never invent lots / negative stock)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_sales_pending_cogs (
  id uuid primary key default gen_random_uuid(),
  sales_document_id uuid not null references public.erp_sales_documents (id) on delete cascade,
  sales_line_id uuid references public.erp_sales_lines (id) on delete cascade,
  product_id uuid references public.erp_products (id),
  warehouse_id uuid references public.erp_warehouses (id),
  missing_qty numeric(18,6) not null check (missing_qty > 0),
  reason text not null default 'insufficient_stock',
  status text not null default 'open'
    check (status in ('open', 'resolved', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists erp_sales_pending_cogs_open_idx
  on public.erp_sales_pending_cogs (sales_document_id, status)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Extend sales lines / documents / allocations
-- ---------------------------------------------------------------------------
alter table public.erp_sales_lines
  add column if not exists bom_snapshot_id uuid references public.erp_sales_bom_snapshots (id),
  add column if not exists estimated_cogs numeric(18,4),
  add column if not exists food_cogs numeric(18,4),
  add column if not exists packaging_cogs numeric(18,4),
  add column if not exists original_actual_cogs numeric(18,4),
  add column if not exists cogs_adjustment_total numeric(18,4) not null default 0,
  add column if not exists adjusted_actual_cogs numeric(18,4);

alter table public.erp_sales_documents
  add column if not exists estimated_cogs numeric(18,4),
  add column if not exists food_cogs numeric(18,4),
  add column if not exists packaging_cogs numeric(18,4),
  add column if not exists original_actual_cogs numeric(18,4),
  add column if not exists cogs_adjustment_total numeric(18,4) not null default 0,
  add column if not exists adjusted_actual_cogs numeric(18,4),
  add column if not exists refund_stock_policy text
    check (refund_stock_policy is null or refund_stock_policy in (
      'none', 'refund_without_stock_return', 'cancel_before_prep',
      'cancel_after_prep_waste', 'physical_stock_return'
    ));

alter table public.erp_sales_cogs_allocations
  add column if not exists cogs_kind text not null default 'food'
    check (cogs_kind in ('food', 'packaging', 'other')),
  add column if not exists bom_snapshot_line_id uuid references public.erp_sales_bom_snapshot_lines (id),
  add column if not exists vat_adjustment_id uuid references public.erp_vat_cost_adjustments (id),
  add column if not exists is_adjustment boolean not null default false;

comment on column public.erp_sales_lines.estimated_cogs is
  'Menu/forecast COGS only — never treated as Actual without explicit Estimated label.';
comment on column public.erp_sales_documents.refund_stock_policy is
  'Money refund ≠ stock return. Default refund_without_stock_return.';

do $$
declare t text;
begin
  foreach t in array array[
    'erp_modifier_product_maps',
    'erp_sales_bom_snapshots',
    'erp_sales_bom_snapshot_lines',
    'erp_sales_pending_cogs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
