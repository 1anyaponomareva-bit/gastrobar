-- OPTIONAL / NOT APPLIED — awaiting Nikita's separate approval.
-- Release 1 follow-up: stop treating erp_dishes.vat_rate as a live Output VAT override.
-- App resolution already ignores dish.vat_rate (exceptions → category → channel → global).
--
-- This migration only clears values that match the current global default (typical auto-seed),
-- so the legacy column reads as Inherited. It does NOT:
--   - touch erp_documents / posted snapshots
--   - change erp_vat_exceptions
--   - alter FIFO, lots, P&L, or channel finance
--
-- Explicit individual rates must live in erp_vat_exceptions (direction=output, scope_kind=dish).

comment on column public.erp_dishes.vat_rate is
  'LEGACY display field. Ignored by Release 1 Output VAT resolution. Use erp_vat_exceptions (output/dish) for individual overrides.';

update public.erp_dishes d
set vat_rate = null
where d.vat_rate is not null
  and d.vat_rate is not distinct from (
    select s.default_output_vat_rate from public.erp_settings s limit 1
  )
  and not exists (
    select 1
    from public.erp_vat_exceptions e
    where e.dish_id = d.id
      and coalesce(e.direction, e.vat_direction, 'input') = 'output'
      and coalesce(e.scope_kind, e.scope, 'product') = 'dish'
  );
