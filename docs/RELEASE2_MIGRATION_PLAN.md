# Release 2 — SQL migration apply plan (not executed)

**Do not apply to production until owner OK after 8F review.**  
Target order on a **non-prod** clone first, then production in one window.

## Sequence (Phase 8)

1. `20261125150000_erp_purchase_input_vat.sql` — 8B purchase fields + save/post effective cost  
2. `20261125160000_erp_lots_input_vat_fifo.sql` — 8C lot snapshots + acquisition  
3. `20261125170000_erp_vat_cost_adjustment.sql` — 8D adjustment docs  
4. `20261125180000_erp_production_cost_lineage.sql` — 8E lineage + backdate guard + propagate  
5. `20261125190000_erp_recipe_costing.sql` — 8F recipe cost policy + dish cost snapshots  
6. `20261125200000_erp_r2_preprod_hardening.sql` — catalog tax validation + backdated adj default OFF  

Prerequisite already on prod from Release 1 era: tax rates / VAT exceptions / channels (`…251100`–`…251300`) as applicable.

## Verification before prod

```bash
npx tsx scripts/erp/test-phase8-vat.ts   # PGlite SQL/RPC
npm run test:finance
npm run typecheck
npm run build   # optional CI
```

On staging Supabase: apply 1→6 (8B→hardening), smoke post receipt (Pending), produce, VAT adjust, dish Recipe Cost / Cost History. Gate: `npm run erp:r2-nonprod-gate`.

See also `docs/RELEASE2_ACCEPTANCE_PLAN.md` and `docs/PHASE8F_RECIPE_COSTING.md`.

## Activation policy

- Do **not** enable partial stacks (e.g. 8B UI without 8C/8D/8E/8F SQL).
- Historical lots remain `tax_status_known=false`.
- Unallocated adjustments must not auto-post to P&L.
- Forecast dish snapshots never rewrite posted sale COGS.
