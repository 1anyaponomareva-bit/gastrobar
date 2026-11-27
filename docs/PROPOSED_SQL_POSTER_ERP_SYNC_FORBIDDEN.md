# Proposed SQL (NOT applied) — Poster ERP sync forbidden

**Status:** awaiting owner approval before any production SQL.  
**Purpose:** DB-level enforcement in addition to the already-shipped API guard.

## Intent

- Reject `erp_save_sales_document` / `erp_sales_link_source` / `erp_sales_import_stub_validate` when `source_system = 'poster'`.
- Do **not** delete historical poster-sourced rows.
- Do **not** block Grab / manual / generic import sources.
- Guest `poster-test` app remains separate (not ERP sync).

## Draft (for review only)

```sql
-- NOT APPLIED. Owner OK required.
create or replace function public.erp_assert_poster_erp_sync_forbidden(p_source text)
returns void
language plpgsql
as $$
begin
  if lower(coalesce(p_source, '')) = 'poster' then
    perform public.erp_raise(
      'ERP_POSTER_SYNC_FORBIDDEN',
      'Poster POS sync is permanently forbidden by owner'
    );
  end if;
end;
$$;
-- Then call from erp_save_sales_document / erp_sales_link_source / erp_sales_import_stub_validate.
```

Until approved, enforcement is via Next.js `/api/erp/action` (server-side).
