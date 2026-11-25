# Phase 8C — Completion Report (Verification)

**Branch:** `erp-inventory`  
**Status:** Verified complete on PGlite (non-prod). SQL **not** applied to production.  
**Migration:** `20261125160000_erp_lots_input_vat_fifo.sql` (plus `20261125150000` save/post base from 8B)

## Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Effective cost on new FIFO lots | Done | Receipt post → `unit_cost` = effective / qty; `tax_status_known=true` |
| Original purchase cost preserved | Done | `original_net_cost`, `original_vat_amount`, `original_gross_cost` on lot |
| Tax status snapshot | Done | `vat_deduction_status`, `vat_rate_snapshot` |
| Deductible / non-deductible VAT | Done | Separate columns; deductible excluded from cost |
| Pending VAT | Done | `pending_vat_amount` exclusive of non-deductible (no double-count) |
| Partial deduction | Done | `deductible_vat_pct` → split |
| Acquisition cost allocation | Done | `erp_document_acquisition_costs` → allocate by Net on post |
| Delivery VAT | Done | Fee inventory amount includes pending/non-ded VAT only |
| UoM | Done | Lots store `base_unit`; packs convert to base qty before post (existing pack path) |
| Transfer origin | Done | `origin_lot_id = coalesce(origin, id)` on consume; no VAT re-charge |
| Atomic receipt post | Done | Single `erp_post_document` transaction |
| Double-post protection | Done | `ERP_ALREADY_POSTED` |
| Concurrent consume | Done | `FOR UPDATE` on lots in `erp_consume` |
| No historical recalculation | Done | Existing lots stay `tax_status_known=false` |

## Control tests (PGlite)

Command: `npx tsx scripts/erp/test-phase8-vat.ts`

| Case | Result |
|------|--------|
| Yellow Mustard Pending → 87 750/kg | Pass |
| Yellow Mustard Deductible → 81 250/kg | Pass |
| Yellow Mustard Partial 50% → 84 500/kg | Pass |
| Delivery fee + pending VAT once | Pass |
| Pickled Cucumbers 24 000 / 25 920 (kg equiv. 96 000 / 103 680) | Pass |
| Pork Hot Dog Sausage 153 000 / 165 240 | Pass |
| FIFO multi-lot write-off 1 260 000 | Pass |
| Opening/legacy `tax_status_known=false` | Pass |
| Double-post blocked | Pass |

## Relation to Phase 8B

8B added document/line fields and first effective-cost post. **8C** completed lot enrichment, acquisition allocation, pending split, and grandfathering. Both migrations are required in order: `…150000` then `…160000`.

## Gaps closed during verification

- PGlite `testDb.ts` previously omitted 8B–8D migrations → synced with `localDb` + finance extras.
- Dedicated SQL/RPC suite added (`test-phase8-vat.ts`); TypeScript unit tests alone are not sufficient.

## Not production-activated

Do not apply to Supabase production until Release 2 migration plan is approved end-to-end with 8D/8E.
