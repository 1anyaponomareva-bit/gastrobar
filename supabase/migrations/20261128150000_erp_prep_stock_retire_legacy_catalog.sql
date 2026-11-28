-- Prep Stock catalog comes only from ERP products with staff_listed.
-- Archive every legacy/manual seed row so old slug items disappear.

comment on table public.erp_prep_stock_items is
  'Prep Stock mirror / notes for ERP products (id = product uuid). Active catalog = erp_products.staff_listed.';

update public.erp_prep_stock_items
set
  archived_at = coalesce(archived_at, now()),
  updated_at = now(),
  updated_by = coalesce(updated_by, 'retire-legacy-catalog')
where archived_at is null
  and id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Also archive uuid rows that are not currently flagged in ERP.
update public.erp_prep_stock_items i
set
  archived_at = coalesce(i.archived_at, now()),
  updated_at = now(),
  updated_by = coalesce(i.updated_by, 'retire-legacy-catalog')
where i.archived_at is null
  and not exists (
    select 1
    from public.erp_products p
    where p.id::text = i.id
      and coalesce(p.staff_listed, false) = true
      and p.archived_at is null
  );
