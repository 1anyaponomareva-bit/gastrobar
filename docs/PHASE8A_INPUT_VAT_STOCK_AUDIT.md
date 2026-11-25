# Phase 8A — Audit: Input VAT & Inventory Cost Architecture

**Status:** Audit only — **no code or database changes** in this phase.  
**Prerequisite:** Release 1 published on `main` (`da943fb`).  
**Next:** await approval before Phase 8B.

---

## 1. Current stock / cost architecture

### Core tables

| Table | Role today |
|---|---|
| `erp_documents` | opening / receipt / transfer / writeoff / count / production; `prices_include_vat` on receipt |
| `erp_document_lines` | qty, `unit_price`, `vat_rate`, packed net/vat/gross amounts, posted `unit_cost` |
| `erp_lots` | FIFO lots: `unit_cost`, `qty_in`, `qty_left`, `source_document_id`, `source_line_id`, `origin_lot_id` |
| `erp_movements` | ledger: ±qty, `unit_cost`, `amount` per lot |
| `erp_products` | `est_unit_cost` / `est_cost_source` updated from last receipt |
| `erp_recipes` + lines | prep BOM; losses via methods / net_qty / parts |
| `erp_dishes` + lines | menu tech cards → Food/Packaging cost from product costs |
| `erp_vat_exceptions` | Input/Output exceptions (Phase 4); input used for purchase VAT rates |
| `erp_tax_rates` / `erp_settings` | defaults: `input_vat_enabled`, `default_input_vat_rate` |

### Current receipt → lot formula (posted)

From `erp_post` (v1):

1. Split line into net / vat / gross using `vat_rate` + `prices_include_vat`.
2. **Always:** `unit_cost = net / qty` when input VAT enabled.  
   Comment in SQL: *“Recoverable input VAT is not part of the inventory cost.”*
3. No lot fields for deduction status, deductible/non-deductible VAT, or acquisition cost allocation.
4. Historical lots therefore behave as **implicit Full Deduction**; true tax status of old data is **unknown**.

### FIFO

- `erp_consume`: oldest `received_at` first among `qty_left > 0` (plus same-time line-order rules from later migrations).
- Consumptions copy **lot.unit_cost** into movements.
- Production: consume ingredients FIFO → output lot cost = total consumed / output_qty.
- Transfers: new lot inherits cost via `origin_lot_id` chain; no VAT re-charge.

### Path into Release 1 finance

```
Receipt post → erp_lots.unit_cost / products.est_unit_cost
    → costing.ts (tech card / prep explode)
    → Food Cost + Packaging Cost
    → financialCalculator.ts (Contribution Margin, Recommended Price)
```

**Single calculator rule (Release 2):** keep using `financialCalculator.ts`; only change upstream product/lot costs.

---

## 2. Cost flow diagram (as-is)

```
Supplier invoice (UI)
        │
        ▼
erp_documents (receipt) + erp_document_lines
        │  post: net, vat, gross; unit_cost := net/qty
        ▼
erp_lots (FIFO) ──consume──► erp_movements
        │
        ├─► est_unit_cost (product card / tech-card quotes)
        │
        ├─► production document → output lot (rolled cost)
        │
        └─► dish/prep costing → Food/Packaging → channel finance (R1)
```

---

## 3. Gap vs Phase 8 requirements

| Requirement | Today | Gap |
|---|---|---|
| VAT Included / Gross / Net line fields | Partial (`unit_price`, `vat_rate`, net/vat/gross on post) | Need explicit gross unit, deduction %, statuses |
| Deduction status Pending / Deductible / Partial / Non | Missing | New enums on lines + lots |
| Effective Inventory Cost = Net + NonDeductible VAT + allocated acquisition | Missing (always Net only) | New formula + acquisition cost allocation |
| Lot tax snapshot | Missing | Columns on `erp_lots` |
| VAT adjustment document when Pending → Deductible | Missing | New doc type or adjustment journal |
| Historical lots unknown tax status | Implicit “full deduct” | Flag `tax_status_unknown` / grandfather |
| Supplier tax code, invoice serial, attachment, verification | Partial suppliers/docs | Extend header fields |
| Yellow Mustard / Pickles / Sausage controls | Not modeled for pending/partial | Tests in 8G |

---

## 4. Proposed SQL migration plan (future 8B–8D — **not applied now**)

> For approval in later phases only.

### 8B — Purchase document fields
- Line: `vat_included`, `vat_deduction_status`, `deductible_vat_pct`, `deductible_vat_amount`, `non_deductible_vat_amount`, `effective_inventory_cost`, `gross_unit_price`, `net_unit_price` (or derive).
- Header: `supplier_tax_code`, `vat_invoice_number`, `vat_invoice_date`, `invoice_serial`, `invoice_attachment_url`, `payment_status`, `vat_verification_status`.
- Reuse existing `vat_rate`, `unit_price`, `net_amount`, `vat_amount`, `gross_amount`, `supplier_id` where possible.

### 8C — Lot enrichment (new lots only)
- `original_net_cost`, `original_vat_amount`, `deductible_vat_amount`, `non_deductible_vat_amount`, `effective_unit_cost` (or keep `unit_cost` = effective), `vat_rate_snapshot`, `vat_deduction_status`, `tax_status_known boolean default false` for legacy.
- **Do not backfill** historical lots with guessed VAT; set `tax_status_known = false`.

### 8D — Adjustment document
- New `doc_type = 'vat_adjustment'` (or finance journal linked to lots).
- Lines reference `lot_id`, delta to inventory value, links to consumed/produced chain.
- Audit table `erp_vat_cost_adjustments`.

### 8E–8F
- Production/post already uses lot costs — no parallel FIFO.
- Tech cards read updated `unit_cost` / quotes; `financialCalculator` unchanged.

### Pending policy (open decision)
- Default Pending → temporarily include VAT in cost (per your draft), then adjustment when confirmed.
- Needs separate accounting-policy OK before 8C default is locked.

---

## 5. VAT status → inventory cost rules (target)

| Status | Inventory cost includes |
|---|---|
| Deductible | Net only |
| Non-Deductible | Net + full VAT |
| Partially Deductible | Net + non-deductible VAT share |
| Pending | Per agreed management policy (draft: treat like Non-Deductible until confirmed) |

Acquisition costs (transport, delivery, handling, other): allocate to lines; only **non-deductible** VAT on those fees enters inventory; no double-count of delivery.

---

## 6. Correction propagation architecture (8D design — for approval)

When Pending → Deductible on remaining + consumed chain:

1. **Do not rewrite** original receipt lines or historical movements.
2. Create **VAT cost adjustment** document:
   - Credit inventory value for remaining `qty_left` on open lots (reduce effective cost / write contra).
   - For consumed qty: allocate adjustment to:
     a. Write-off / sale COGS period (P&L adjustment account — Release 2 finance link), and/or  
     b. Open prep lots still holding rolled cost (proportional), and/or  
     c. Explicit “unrecoverable already sold” expense if finished goods sold.
3. Maintain audit log: source lot, qty remaining, qty consumed, qty in open semi-finished, qty sold-estimated, amounts.
4. Production chain walk: `movements` → production docs → output lots → further consumes (BFS with cycle guard).

**Risk:** partial prep mixes multiple ingredient lots; allocation must be proportional to contribution of adjusted lot in BOM cost roll-up at production time (store `erp_production_lot_components` snapshot if missing — audit in 8A notes this may need a new snapshot table in 8E).

---

## 7. FIFO risks

| Risk | Mitigation |
|---|---|
| Changing `unit_cost` on open lots in place | Forbidden; use adjustment movements |
| Mixing old unknown-tax lots with new tax-aware lots | Flag UI; average cost display only informational |
| Same-time FIFO order | Keep existing consume ordering migrations |
| Double VAT on processing | Processing creates no purchase VAT; only rolls lot costs |
| Loss % applied twice (Pickles) | Keep current: cost on purchased base; recipe uses net yield factors once |

---

## 8. Backward compatibility

- Old lots: keep `unit_cost` as-is; `tax_status_known = false`; UI badge “Historical / tax unknown”.
- No mass recalculation of receipts, productions, prep, or dish history.
- `est_unit_cost` continues until replaced by new receipts.
- Release 1 calculator: no API break; lower Food Cost when new deductible receipts post.

---

## 9. Control examples (acceptance targets for 8G)

### Yellow Mustard — 20 kg, Net 1 625 000, VAT 8% = 130 000, Gross 1 755 000

| Case | Inventory | Unit |
|---|---|---|
| Full deduction | 1 625 000 | 81 250 /kg |
| None / Pending* | 1 755 000 | 87 750 /kg |
| Partial 50% | 1 690 000 | 84 500 /kg |

### Pickled Cucumbers — Net 24 000 / jar, 250 g usable, recipe 25 g  
Full deduct: 96 000 /kg → recipe 2 400; No deduct: 103 680 /kg → 2 592. Loss % applied once.

### Pork Hot Dog Sausage — 153 000 /kg net, 50 g/pc  
Full: 7 650 /pc; None: 8 262 /pc.

---

## 10. Test plan outline

- Unit: effective cost helpers (deduction matrix + acquisition allocation).
- PGlite: post receipt under each status → lot fields → consume → production roll-up.
- Adjustment: Pending→Deductible with partial consume + open prep.
- Regression: existing FIFO tests, write-offs, counts, Release 1 `test:finance`.
- Manual: Mustard / Pickles / Sausage; Danish Hot Dog CM after new costs.

---

## 11. Sub-phase sequence (8B–8G)

| Phase | Scope | Code/DB |
|---|---|---|
| **8A** | This audit | None |
| **8B** | Purchase UI + header/line tax fields; draft post preview | Migration + UI |
| **8C** | New lots write effective cost by status; grandfather old lots | Migration + `erp_post` |
| **8D** | VAT adjustment doc + audit + propagation design impl | Migration + RPC |
| **8E** | Processing/production snapshots for component cost shares | As needed |
| **8F** | Quotes / tech cards / confirm `financialCalculator` inputs | TS only if possible |
| **8G** | Controls + full regression + Preview | Tests |

---

## 12. Touched functions (expected later)

- `erp_post` / receipt branch  
- `erp_receive_lot` / `erp_consume`  
- `erp_save_document`  
- Possibly new `erp_post_vat_adjustment`  
- TS: receipt editor, stock balances cost display, `costing.ts` quotes  
- **Not:** second financial calculator; not P&L rewrite in 8B–8C

---

## 13. Open decisions before 8B

1. Pending default policy (include VAT in cost vs provisional deductible).  
2. Whether optional `20261125140000_erp_dish_vat_rate_legacy_clear.sql` (Release 1) is ever applied — **still not applied**.  
3. Acquisition cost allocation key (by net value vs qty vs weight).  
4. P&L account mapping for sold-goods VAT recovery adjustments.

---

**Awaiting approval to start Phase 8B.**
