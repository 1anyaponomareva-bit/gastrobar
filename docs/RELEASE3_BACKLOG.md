# Release 3 — Backlog

**Updated:** Phase 9E (`release-3-phase9e`)  
**Rule:** items are **not** fully implemented until completed and tested on real formats / production acceptance.

## From Phase 9B / 9D / 9E

| Item | Status | Notes | Deadline gate |
|------|--------|-------|---------------|
| Live GrabMerchant Import | **Partial (9D)** | Normalized JSON/CSV pipeline + stages Upload→Apply work. **Raw Grab CSV/XLSX blocked** until owner provides a real GrabMerchant sample + column map. Does **not** block 9E. | R3 final |
| Live Poster Import | Open | Beyond validate-only stub | R3 final |
| Dish BOM Explosion | Open | Sale dish → FIFO without product/prep mapping | **Before Phase 9F complete** |
| Actual COGS Integration | Open | End-to-end posted Actual COGS | **Before Phase 9F complete** |
| Auto-Consume Activation | Open | `sales_auto_consume_stock` — owner OK required | R3 final |
| Production UI Acceptance | Open | Published FE + live screenshots | R3 final |
| Full R1/R2 Regression Tests | Open | Beyond presence smoke | R3 final |
| Financial period hard lock | Open | Phase **9H** — approved VAT settlements protected on backend in 9E; full period lock later | Phase 9H |
| Official VN VAT declaration format | Open | Accountant confirmation required | R3 final |

## Phase sequencing

- **9C** Input VAT Register — accepted CONDITIONAL  
- **9D** Platforms / Grab settlements — accepted CONDITIONAL  
- **9E** VAT payable settlement — this phase  
- **9F** Actual P&L / COGS — blocked on BOM + Actual COGS (**not started**)  
- **9G** Full operating expenses module  
- **9H** Financial period lock / close  

## Owner action required for Grab live format

Provide one real GrabMerchant export file (CSV and/or XLSX) used in production reporting.  
Until then: do **not** invent Grab column headers; use `normalized_json_v1` / `normalized_csv_v1` or Oct 2026 arithmetic fixture only.
