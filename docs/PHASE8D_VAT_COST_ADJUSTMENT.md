# Phase 8D — Input VAT Cost Adjustment

Status: **implemented in repo** (`erp-inventory`). SQL **not** applied to production. **Do not start Phase 8E** without owner OK.

## Goal

Documented correction of Input VAT deduction status and inventory cost **without** rewriting posted receipts, historical FIFO allocations, or movements.

## Document

Separate tables (not a new `erp_documents.doc_type`, to avoid breaking existing stock docs):

| Table | Role |
|-------|------|
| `erp_vat_cost_adjustments` | Header: reason, prev/new status, amounts, qty split, statuses |
| `erp_vat_cost_adjustment_allocations` | Buckets: remaining_raw, transferred, write_offs, unallocated, … |
| `erp_vat_cost_adjustment_lot_effects` | Per-lot unit_cost changes (qty unchanged) |

Statuses: `draft` → `pending_approval` → `posted` → `reversed` (via reverse document).

Reasons: invoice received, deduction confirmed / partial / rejected / reversed, accounting correction, other.

## Formulas

```
VAT Deduction Difference = New Deductible − Previous Deductible
Inventory Cost Adjustment = − VAT Deduction Difference
New Effective = Previous Effective + Inventory Cost Adjustment
```

Previous state = **last posted adjustment** for the line, else original posted receipt snapshot.

## Distribution (8D)

```
remaining_adj = total_adj × (remaining_qty / original_qty)
consumed_adj  = total_adj − remaining_adj
```

- **Remaining** = `qty_left` on purchase lot + lots with `origin_lot_id = purchase_lot` (transfers).
- **Write-offs** = outbound movements of that lot into `writeoff` docs (share of consumed).
- **Unallocated** = other consumed (production / COGS / unknown) + warning → **Phase 8E**.

Lot updates: set `original_unit_cost` once, adjust `unit_cost`, accumulate `cumulative_cost_adjustment`. No qty change, no FIFO reordering, no negative lot value.

## UI

- Posted receipt card → per-line **VAT adjustment**
- Journal: `/erp/stock/vat-adjustments`
- Preview before post; re-preview if hash stale

## RPCs

`erp_vat_adj_current_state`, `erp_vat_adj_lot_scope`, `erp_vat_adj_preview`, `erp_vat_adj_save`, `erp_vat_adj_post`, `erp_vat_adj_reverse`

## Yellow Mustard controls (unit tests)

| Case | Total adj | Remaining 12 kg | Consumed 8 kg |
|------|-----------|-----------------|---------------|
| Pending → Deductible | −130 000 | −78 000 | −52 000 |
| Pending → Partial 50% | −65 000 | −39 000 | −26 000 |
| Partial → Full | −65 000 | −39 000 | −26 000 |
| Deductible → Non-Ded | +130 000 | (full rem.) | — |

## Migration

`supabase/migrations/20261125170000_erp_vat_cost_adjustment.sql`

## Open accounting questions / risks

1. P&L booking of unallocated / write-off adjustments — policy TBD (no auto GL in 8D).
2. Closed-period adjustments — not auto-blocked by a period table yet; policy TBD.
3. Production / semi-finished / COGS chain — **8E** (component snapshots).
4. Screenshots on Preview require SQL apply + env; not run against production here.
5. Concurrent stock moves between preview and post → `ERP_STALE` (reconfirm).

## Phase 8E integration sketch

BFS from consumed movements → production docs → output lots → further consumes; allocate unallocated share by recorded component cost contribution (new snapshot table if missing). Keep adjustment docs as the only mutation path.
