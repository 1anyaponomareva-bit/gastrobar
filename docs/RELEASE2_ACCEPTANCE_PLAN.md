# Release 2 — Final acceptance plan (draft for owner)

**Do not start Phase 8G or merge to main without explicit OK.**

## Scope delivered (8B–8F)

| Phase | Topic | Migration |
|-------|--------|-----------|
| 8B | Purchase Input VAT | `…25150000_erp_purchase_input_vat.sql` |
| 8C | FIFO lot tax snapshots | `…25160000_erp_lots_input_vat_fifo.sql` |
| 8D | VAT cost adjustment docs | `…25170000_erp_vat_cost_adjustment.sql` |
| 8E | Production cost lineage | `…25180000_erp_production_cost_lineage.sql` |
| 8F | Recipe costing + finance bridge | `…25190000_erp_recipe_costing.sql` |

## Pre-production checklist

1. Apply 8B→8F **in order** on a **non-prod** Supabase clone.  
2. `npx tsx scripts/erp/test-phase8-vat.ts`  
3. `npm run test:finance`  
4. `npm run typecheck` && `npm run build`  
5. Smoke UI: receipt (Pending VAT) → produce SF → VAT adjust → dish Recipe Cost / Channel Finance / Cost History  
6. Confirm Danish Hot Dog live cost vs legacy 27 902.06 — explain deltas, do not force-fit  
7. Confirm sale prices / historical docs / P&L unchanged  

## Owner sign-off gates

- [ ] Phase 8C FIFO verification accepted  
- [ ] Phase 8D VAT adjustment accepted  
- [ ] Phase 8E production lineage accepted  
- [ ] Phase 8F recipe costing accepted  
- [ ] Non-prod SQL OK  
- [ ] Explicit OK for production SQL window  
- [ ] Explicit OK before merge `erp-inventory` → `main`  
- [ ] Explicit OK before Phase 8G  

## Risks

- Historical lots with `tax_status_known=false` need careful VAT adjust  
- Unallocated adjustment amounts must not auto-post to P&L  
- Forecast recipe cost ≠ posted sale COGS  
- Partial migration activation on production is forbidden  
