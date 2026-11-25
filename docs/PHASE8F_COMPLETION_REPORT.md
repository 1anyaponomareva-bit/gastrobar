# Phase 8F — Completion report

**Branch:** `erp-inventory`  
**Date:** 2026-11-25  
**Owner gate:** stop before Phase 8G; no merge to main; no production SQL.

## Changed files (summary)

### Core
- `src/lib/erp/recipeCosting.ts` — policy, UoM, usable pack, deps, history, margin scan, controls
- `src/lib/erp/recipeCosting.test.ts` — §14–19 control tests
- `src/lib/erp/menu.ts` — settings-aware `menuCostContext`
- `src/lib/erp/types.ts` — `recipe_cost_source`, dish cost snapshot types/actions
- `src/lib/erp/localDb.ts` — migration list
- `scripts/erp/testDb.ts` — synced via `sync-testdb-migrations.mjs`
- `scripts/erp/test-phase8-vat.ts` — 8F SQL/RPC case
- `package.json` — `test:finance` includes recipe + composition tests

### SQL
- `supabase/migrations/20261125190000_erp_recipe_costing.sql`

### UI
- `src/components/erp/ServicePages.tsx` — cost source setting
- `src/components/erp/MenuPage.tsx` — Recipe Cost / warnings / Cost History
- `src/components/erp/ProductsPage.tsx` — ingredient cost readout
- `app/api/erp/action/route.ts` — snapshot record/load

### Docs
- `docs/PHASE8F_RECIPE_COSTING.md`
- `docs/PHASE8F_COMPLETION_REPORT.md`
- `docs/RELEASE2_MIGRATION_PLAN.md` (updated)
- `docs/RELEASE2_ACCEPTANCE_PLAN.md`

## Database changes

- `erp_settings.recipe_cost_source` (default `manual_estimated`)
- `erp_dish_cost_snapshots` + RPCs
- `erp_save_settings` accepts `recipe_cost_source`

## Test results

| Suite | Result |
|-------|--------|
| `npm run test:finance` | 74 pass |
| `npx tsx scripts/erp/test-phase8-vat.ts` | 13 pass (incl. 8F) |
| `npm run typecheck` | pass |
| `npm run build` | pass |

## Control calculations

| Example | Full | Pending |
|---------|------|---------|
| Pickles 25 g usable | 2 400 | 2 592 |
| Mustard 15 g | 1 218.75 | 1 316.25 (partial 50% → 1 267.50) |
| Hot dog sausage 1 pc | 7 650 | 8 262 |
| Danish Hot Dog legacy total | 27 902.06 (food 24 750 + pack 3 152) | finance scenarios via calculator |

## Danish Hot Dog note

Phase 8F does **not** force live dish cost to 27 902.06. If Input VAT / lot / card prices differ, document component deltas at acceptance. Channel finance for a given food+pack pair must still match `financialCalculator.ts`.

## Risks

- Forecast snapshots ≠ posted sale COGS  
- Settings policy must not be mistaken for FIFO method change  
- Cost history requires post-save snapshot (empty until first save after 8F)

## Next

Await owner confirmation before Phase 8G / production migration / merge.
