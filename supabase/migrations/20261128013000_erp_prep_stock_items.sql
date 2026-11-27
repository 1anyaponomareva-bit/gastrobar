-- Prep Stock catalog (Orders admin): RU/EN/VN names + free-text note.
-- Balances stay in erp_prep_stock_movements by item_id.

create table if not exists public.erp_prep_stock_items (
  id text primary key
    check (length(btrim(id)) > 0 and length(id) <= 80),
  name_en text not null default '',
  name_ru text not null default '',
  name_vn text not null default '',
  note text not null default '',
  no_warehouse boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists erp_prep_stock_items_active_sort_idx
  on public.erp_prep_stock_items (sort_order, id)
  where archived_at is null;

alter table public.erp_prep_stock_items enable row level security;

comment on table public.erp_prep_stock_items is
  'Prep Stock ingredient catalog for Orders. Names are entered manually in RU/EN/VN; note is free text shown beside the name.';
comment on column public.erp_prep_stock_items.note is
  'Optional info shown to the right of the ingredient name (not a translation).';
