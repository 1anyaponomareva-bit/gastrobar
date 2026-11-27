-- Phase 9H: Financial periods, closing, snapshots, reopen, audit extensions.
-- Independent of VAT Settlement tax periods. NOT applied to production until owner OK.

-- Extend existing audit log (do not create parallel journal)
alter table public.erp_audit_log
  add column if not exists financial_period_id uuid,
  add column if not exists user_role text,
  add column if not exists previous_values jsonb,
  add column if not exists new_values jsonb,
  add column if not exists request_id text,
  add column if not exists source_system text;

comment on table public.erp_audit_log is
  'Central ERP audit. Phase 9H extends columns; passwords/tokens must never be stored.';

-- Finance permission flags on settings (lightweight; uses existing auth actor model)
alter table public.erp_settings
  add column if not exists finance_close_actors text[] not null default '{}',
  add column if not exists finance_reopen_actors text[] not null default '{}',
  add column if not exists allow_close_with_warnings boolean not null default false;

-- ---------------------------------------------------------------------------
-- Financial periods (management monthly — not VAT tax periods)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_financial_periods (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.erp_legal_entities (id),
  period_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'closed', 'reopened')),
  opened_at timestamptz not null default now(),
  opened_by text,
  closed_at timestamptz,
  closed_by text,
  reopened_at timestamptz,
  reopened_by text,
  reopening_reason text,
  closing_version integer not null default 0,
  data_completeness text,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  check (period_end >= period_start)
);

-- No overlapping open/closed periods for same entity
create unique index if not exists erp_fin_periods_name_uidx
  on public.erp_financial_periods (
    coalesce(legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start, period_end
  );

create index if not exists erp_fin_periods_status_idx
  on public.erp_financial_periods (status, period_end desc);

alter table public.erp_audit_log
  drop constraint if exists erp_audit_log_financial_period_id_fkey;
alter table public.erp_audit_log
  add constraint erp_audit_log_financial_period_id_fkey
  foreign key (financial_period_id) references public.erp_financial_periods (id);

create table if not exists public.erp_period_closings (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.erp_financial_periods (id) on delete cascade,
  closing_version integer not null,
  status text not null default 'completed'
    check (status in ('completed', 'superseded')),
  closed_at timestamptz not null default now(),
  closed_by text not null,
  warnings_acknowledged boolean not null default false,
  warnings_ack_reason text,
  notes text,
  unique (period_id, closing_version)
);

create table if not exists public.erp_period_close_checks (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.erp_financial_periods (id) on delete cascade,
  closing_id uuid references public.erp_period_closings (id) on delete cascade,
  check_code text not null,
  check_group text not null,
  severity text not null
    check (severity in ('blocking_error', 'warning', 'information', 'passed')),
  message text not null,
  entity_type text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists erp_period_close_checks_period_idx
  on public.erp_period_close_checks (period_id, severity);

create table if not exists public.erp_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.erp_financial_periods (id) on delete cascade,
  closing_id uuid not null references public.erp_period_closings (id) on delete cascade,
  report_kind text not null
    check (report_kind in (
      'accrual_pnl', 'cash_flow', 'channel_profitability', 'location_profitability',
      'product_profitability', 'actual_cogs', 'accounts_payable', 'accounts_receivable',
      'vat_summary', 'fixed_assets_summary', 'payroll_summary'
    )),
  report_version integer not null,
  payload jsonb not null,
  calculation_at timestamptz not null default now(),
  applied_rules jsonb,
  data_completeness text,
  closed_by text,
  created_at timestamptz not null default now(),
  unique (closing_id, report_kind)
);

create table if not exists public.erp_period_reopen_requests (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.erp_financial_periods (id) on delete cascade,
  reason text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  notes text
);

-- Correction documents (do not rewrite originals)
create table if not exists public.erp_financial_corrections (
  id uuid primary key default gen_random_uuid(),
  correction_kind text not null
    check (correction_kind in (
      'sales', 'refund', 'vat', 'cogs', 'expense', 'payroll', 'platform', 'depreciation', 'other'
    )),
  original_document_type text,
  original_document_id uuid,
  original_period_id uuid references public.erp_financial_periods (id),
  recognition_period_id uuid references public.erp_financial_periods (id),
  original_amount numeric(18,4),
  adjustment_amount numeric(18,4) not null,
  adjustment_reason text not null,
  supporting_document_ref text,
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
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
    'erp_financial_periods', 'erp_period_closings', 'erp_period_close_checks',
    'erp_period_snapshots', 'erp_period_reopen_requests', 'erp_financial_corrections'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  -- Harden audit: revoke write from anon/authenticated (service_role only)
  revoke all on table public.erp_audit_log from public, anon, authenticated;
  grant select, insert on table public.erp_audit_log to service_role;
  -- No update/delete grant to anon/authenticated (already revoked)
end $$;
