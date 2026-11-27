# Poster POS ERP sync ban — SQL applied

**Status:** APPLIED (owner OK 2026-11-27)  
**Poster POS:** FORBIDDEN BY OWNER (permanent)  
**Migration:** `supabase/migrations/20261127160000_erp_r3_poster_erp_sync_forbidden.sql`  
**Prod apply:** OK (counts preserved; auto-consume OFF)

## Pre-checks (completed)

1. Assert wired into `erp_save_sales_document`, `erp_sales_link_source`, `erp_sales_import_stub_validate`
2. Table triggers block direct INSERT/UPDATE bypass on sales docs / source links / import batches
3. Aliases covered (`poster`, `poster_pos`, `poster-api`, `joinposter`, `poster.*`, `poster[_-]%`, …)
4. Historical Poster rows remain SELECT/update (non-sync fields)
5. Manual sales save OK
6. Grab import stub OK
7. RPC execute: service_role only (anon/authenticated revoked)
8. Fresh prod dump: `~/GASTROBAR-backups/prod-ulxmubivimwxevgxxxyu-2026-11-27T10-40-34-777Z.dump`
9. Local PG (`gastrofood_r2_copy`): 18/18 acceptance checks passed

## Code

- API guard aliases widened: `src/lib/erp/posterErpSyncForbidden.ts`
- Local test: `scripts/erp/test-poster-sync-forbidden.mjs`
- Prod apply helper: `scripts/erp/apply-poster-ban-prod.mjs`
- Results: `docs/screenshots/poster-ban/prod-apply-results.json`

## Constraints unchanged

- Auto-consume OFF  
- Supabase Free Plan  
- Release 4 not started  
