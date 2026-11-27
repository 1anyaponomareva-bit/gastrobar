# Proposed SQL (NOT applied) — Poster ERP sync forbidden

**Status:** awaiting **separate** owner approval.  
**Do not apply to production until explicit OK.**  
**Purpose:** DB-level enforcement in addition to the already-shipped API guard (`1c23863`).

## Intent

- Reject `erp_save_sales_document` / `erp_sales_link_source` / `erp_sales_import_stub_validate` when `source_system = 'poster'`.
- Do **not** delete historical poster-sourced rows.
- Do **not** block Grab / manual / generic `import` sources.
- Guest `poster-test` app remains separate (not ERP sync).

## Full draft for review (NOT APPLIED)

```sql
-- =============================================================================
-- PROPOSED ONLY — NOT APPLIED. Owner OK required before production.
-- Pin context: Release 3 stable 1c23863 (API ban already live).
-- =============================================================================

create or replace function public.erp_assert_poster_erp_sync_forbidden(p_source text)
returns void
language plpgsql
as $$
begin
  if lower(btrim(coalesce(p_source, ''))) = 'poster' then
    perform public.erp_raise(
      'ERP_POSTER_SYNC_FORBIDDEN',
      'Poster POS sync is permanently forbidden by owner. GASTROFOOD ERP runs independently of Poster.'
    );
  end if;
end;
$$;

comment on function public.erp_assert_poster_erp_sync_forbidden(text) is
  'Owner permanent ban: block Poster→ERP sync/import paths. Historical rows untouched.';

-- Wire into existing RPCs (illustrative call sites — exact patches on apply):
--   erp_save_sales_document:        perform erp_assert_poster_erp_sync_forbidden(v_source);
--   erp_sales_link_source:          perform erp_assert_poster_erp_sync_forbidden(p_source);
--   erp_sales_import_stub_validate: perform erp_assert_poster_erp_sync_forbidden(p_source);
--
-- Optional settings flag (documentation only; API already hard-forbidden):
--   alter table public.erp_settings
--     add column if not exists poster_erp_sync_forbidden boolean not null default true;
--
-- Grants (match other finance RPCs):
--   revoke all on function public.erp_assert_poster_erp_sync_forbidden(text)
--     from public, anon, authenticated;
--   grant execute on function public.erp_assert_poster_erp_sync_forbidden(text)
--     to service_role;
```

## Current enforcement (already on production at `1c23863`)

| Layer | Status |
|-------|--------|
| Next.js `/api/erp/action` | **Active** — 403 `ERP_POSTER_SYNC_FORBIDDEN` |
| `posterErpSyncForbidden.ts` | **Active** |
| This SQL | **Not applied** |

Until this SQL is approved and applied, treat the API guard as the production control plane.
