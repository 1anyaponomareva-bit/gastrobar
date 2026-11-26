# Release 3 — Backlog (from Phase 9B CONDITIONAL)

**Frozen at Phase 9B acceptance:** commit `b5b6f83`  
**Rule:** items below are **not** fully implemented until completed and tested. Do not mark done prematurely.

## From Phase 9B (must close before Release 3 final acceptance)

| Item | Notes | Deadline gate |
|------|-------|---------------|
| Live Poster Import | Beyond validate-only stub | R3 final |
| Live GrabMerchant Import | Beyond validate-only stub | R3 final |
| Dish BOM Explosion | Sale dish → FIFO without product/prep mapping | **Before Phase 9F complete** |
| Actual COGS Integration | End-to-end posted Actual COGS | **Before Phase 9F complete** |
| Auto-Consume Activation | `sales_auto_consume_stock` — owner OK required | R3 final |
| Production UI Acceptance | Published FE + live screenshots | R3 final |
| Full R1/R2 Regression Tests | Beyond presence smoke | R3 final |

## Phase sequencing notes

- **9C** Input VAT Register (this phase)  
- **9D** Grab settlements / platform VAT docs (no live Grab import in 9C)  
- **9E** VAT payable settlement  
- **9F** Actual P&L / COGS rollup — blocked on BOM + Actual COGS backlog  
- **9G** Operating expenses module (9C only contracts)

Updated as phases complete.
