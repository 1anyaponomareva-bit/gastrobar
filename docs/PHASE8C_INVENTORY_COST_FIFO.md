# Phase 8C — Inventory Cost & FIFO Integration

Status: **verified complete** — see `PHASE8C_COMPLETION_REPORT.md`. SQL **not** applied to production until separate OK.

## Goal

Integrate Input VAT + acquisition fees into existing FIFO lots. No parallel stock engine.

## Formula

```
Effective Inventory Cost =
  Net Purchase Cost
  + Non-Deductible VAT
  + Pending VAT
  + Allocated Acquisition Costs
```

**No double-count:** Pending VAT is stored in `pending_vat_amount` and is **never** also in `non_deductible_vat_amount`.

Deductible Input VAT (goods or acquisition fees) does **not** enter lot cost.

| Status | Inventory effect |
|--------|------------------|
| Deductible | Net only |
| Non-Deductible | Net + VAT |
| Partially Deductible | Net + non-deductible share |
| Pending | Net + VAT (temporary; adjust in 8D) |
| Legacy / Unknown | Historical `unit_cost` unchanged; `tax_status_known = false` |

## Lot fields (new posts)

Source doc/line, product, warehouse, qty_in / qty_left, base_unit, original net/vat/gross, VAT rate + deduction status snapshots, deductible / non-deductible / pending VAT, allocated acquisition, effective inventory cost, `tax_status_known`.

`unit_cost` (FIFO) = effective inventory cost / qty for tax-aware receipt lots.

Transfers / production: still inherit rolled `unit_cost`; tax snapshots only on purchase lots (`tax_status_known = true`).

## Acquisition costs

Table `erp_document_acquisition_costs` (transport / delivery / handling / other).  
Allocated to lines by Net weight on **post**. UI on Склад → Поставки.

## Delivered

| Item | Path |
|------|------|
| Migration | `supabase/migrations/20261125160000_erp_lots_input_vat_fifo.sql` |
| Helpers | `src/lib/erp/purchaseVat.ts` (`splitPurchaseVat`, `allocateAcquisitionCosts`, …) |
| UI | DocumentEditor acquisition panel + effective cost preview |
| Load | `stateLoader.loadDocument` loads acquisition rows when table exists |

## Out of scope (later phases)

- **8D** VAT adjustment document (Pending → Deductible) and chain propagation
- **8E–G** production snapshots, controls, full regression on Preview

## Verify

```bash
npm run test:finance
```
