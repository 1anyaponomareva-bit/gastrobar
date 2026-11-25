# Release 2 — SQL migration apply plan (not executed)

**Do not apply to production until owner OK after 8E review.**  
Target order on a **non-prod** clone first, then production in one window.

## Sequence (Phase 8)

1. `20261125150000_erp_purchase_input_vat.sql` — 8B purchase fields + save/post effective cost  
2. `20261125160000_erp_lots_input_vat_fifo.sql` — 8C lot snapshots + acquisition  
3. `20261125170000_erp_vat_cost_adjustment.sql` — 8D adjustment docs  
4. `20261125180000_erp_production_cost_lineage.sql` — 8E lineage + backdate guard + propagate  

Prerequisite already on prod from Release 1 era: tax rates / VAT exceptions / channels (`…251100`–`…251300`) as applicable.

## Verification before prod

```bash
npx tsx scripts/erp/test-phase8-vat.ts   # PGlite SQL/RPC
npm run test:finance
npm run typecheck
npm run build   # optional CI
```

On staging Supabase: apply 1→4, smoke post receipt (Pending), produce, VAT adjust, check lot costs.

## Activation policy

- Do **not** enable partial stacks (e.g. 8B UI without 8C/8D/8E SQL).
- Historical lots remain `tax_status_known=false`.
- Unallocated adjustments must not auto-post to P&L.
