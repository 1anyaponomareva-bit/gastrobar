# Phase 8E — Production Cost Propagation

**Branch:** `erp-inventory` (`pending commit`)  
**Migration:** `20261125180000_erp_production_cost_lineage.sql`  
**Status:** Implemented + PGlite-tested. Not on production. **Do not start 8F** without owner OK.

## Goal

Trace and propagate purchase-lot cost (including Input VAT adjustments) through:

`Purchase → FIFO Lot → Processing → Semi-Finished → … → Sale / Write-Off`

without a parallel production system.

## Production Cost Lineage

Table `erp_production_lot_components` (immutable snapshot on output lot insert):

| Field | Meaning |
|-------|---------|
| production_document_id | Processing/production doc |
| output_lot_id | Semi-finished / finished lot created |
| input_lot_id | FIFO lot consumed |
| purchase_lot_id | Root purchase lot when known (`origin_lot_id` / tax-aware id) |
| qty_consumed / unit_cost / cost_amount | Actual consume valuation |
| cost_share | `cost_amount / Σ inputs` for that production |

Trigger: `erp_lots_snapshot_production_components` after insert on `erp_lots` when source doc is `production`.

No second VAT on internal processing; losses raise unit cost of useful yield via existing post (total input cost / output_qty).

## VAT adjustment propagation

After 8D applies **remaining raw/transfer** lot value changes:

1. Former **unallocated** consumed share is passed to `erp_vat_adj_propagate`.
2. BFS from purchase lot through component edges (`purchase_lot_id` / `input_lot_id` → `output_lot_id`).
3. Cycle guard: visited lot ids; depth cap 50.
4. Open output stock adjusted by `budget × cost_share × (qty_left/qty_in)`.
5. Buckets: `semi_finished` / `finished_goods`; residual stays **`unallocated`** (never auto-COGS/P&L).
6. History: `erp_vat_adj_propagation` + lot effects.

## Chicken control (PGlite)

| Step | Value |
|------|-------|
| Purchase 15 kg @ 48 000 Pending | Gross 777 600; unit 51 840 |
| Produce 13.2 kg (all losses on yield) | Output unit ≈ 58 909.09 |
| Pending → Deductible | Output unit ≈ 54 545.45; adj −57 600 on SF lot |
| Unallocated residual | 0 |

## 8D hardening in same migration

- Backdated `adj_date < erp_business_today()` requires `confirm_backdated` → `backdated_confirmed_by/at`.
- Unallocated allocation note: explicit residual until lineage or manual assignment.
- No automatic P&L posting.

## Algorithm sketch

```
post VAT adj:
  adjust remaining purchase/transfer lots (8D)
  budget := unallocated_adjustment
  queue := [purchase_lot]
  while queue and budget residual:
    pop lot; skip if visited
    for each component edge from lot:
      if output.qty_left > 0:
        apply share to output.unit_cost
        record propagation bucket
        enqueue output
      else enqueue output for downstream
  residual → unallocated (explicit)
```

## Open accounting questions

1. Manual assignment UI for residual unallocated (authorized user + audit) — stub note only.
2. True COGS / sales document link when sales module posts consumption — future.
3. Multi-ingredient share when several purchases fund one SF — only matching purchase_lot_id moves.
4. Period-close calendar — still confirmation-based backdate, not a closed-period table.

## Risks

- Missing lineage on productions posted **before** 8E migration → those consumes stay unallocated (correct per “no approximate allocation”).
- Trigger runs only on new output lots after migration apply.
- Concurrent production during adj → `FOR UPDATE` on output lots; preview hash still guards purchase side.

## Files

- `supabase/migrations/20261125180000_erp_production_cost_lineage.sql`
- `scripts/erp/test-phase8-vat.ts` (8E chicken case)
- `scripts/erp/testDb.ts` (migration list sync)

## 8F plan (not started)

Tech cards / `financialCalculator` already read `est_unit_cost` / FIFO quotes. After new receipts and adj posts, Food Cost updates via existing costing path. 8F: confirm dish quotes, badges for tax-unknown lots, no auto sell-price changes.
