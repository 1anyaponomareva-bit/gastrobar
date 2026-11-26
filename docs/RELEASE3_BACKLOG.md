# Release 3 — Backlog

**Updated:** Phase 9F (`release-3-phase9f`)  
**Rule:** items are **not** fully implemented until completed and tested on real formats / production acceptance.

## From Phase 9B / 9D / 9E / 9F

| Item | Status | Notes | Deadline gate |
|------|--------|-------|---------------|
| Dish BOM Explosion | **Done (9F-A)** | `erp_sales_bom_explode` + immutable snapshots; modifiers; mapping_required; prep stop via stocked rules | — |
| Actual COGS Integration | **Done (9F-B)** | Sales → BOM snapshot → FIFO `erp_consume`; food/pack; pending COGS; VAT adj layer; refund≠stock | — |
| Live GrabMerchant Import | **Partial (9D)** | Normalized pipeline works. Raw Grab CSV/XLSX blocked until real sample. | R3 final |
| Live Poster Import | Open | Beyond validate-only stub | R3 final |
| Auto-Consume Activation | **Open / OFF** | `sales_auto_consume_stock=false` on production path. Local tests may flip temporarily then restore. **Not completed.** | Owner OK |
| Production UI Acceptance | Open | Published FE + live screenshots | R3 final |
| Full R1/R2 Regression Tests | Open | Beyond presence smoke | R3 final |
| Financial period hard lock | Open | Phase **9H** | Phase 9H |
| Official VN VAT declaration format | Open | Accountant confirmation | R3 final |
| Campaign ad allocation to dishes | Open | Rules deferred — show unallocated separately | Owner methodology |

## Phase sequencing

- **9C** Input VAT — CONDITIONAL  
- **9D** Platforms — CONDITIONAL  
- **9E** VAT Settlement — CONDITIONAL  
- **9F** Actual COGS & Profitability — this phase (A→B→C)  
- **9G** Full operating expenses — **not started**  
- **9H** Financial period lock  

## Owner action required for Grab live format

Provide one real GrabMerchant export file (CSV and/or XLSX). Until then do **not** invent Grab column headers.
