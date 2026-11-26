# Release 3 — Backlog

**Updated:** Phase 9G (`release-3-phase9g`)  
**Rule:** items are **not** fully implemented until completed and tested on real formats / production acceptance.

## Status board

| Item | Status | Notes | Deadline gate |
|------|--------|-------|---------------|
| Dish BOM Explosion | **Done (9F-A)** | Snapshots + modifiers + prep stop | — |
| Actual COGS Integration | **Done (9F-B)** | FIFO Actual; pending COGS; auto-consume still OFF | — |
| Live GrabMerchant Import | **Partial (9D)** | Normalized OK; raw Grab blocked until sample | R3 final |
| Live Poster Import | Open | Beyond validate-only stub | R3 final |
| Auto-Consume Activation | **Open / OFF** | Not production-activated | Owner OK |
| Production UI Acceptance | Open | Published FE + live screenshots | R3 final |
| Full Regression Tests | Open | Beyond presence smoke | R3 final |
| Tax Policy Approval | Open | Period/CIT/Input VAT recognition | Accountant |
| Campaign ad allocation to dishes | Open | Methodology deferred | Owner |
| Financial period hard lock | Open | Phase **9H** | Phase 9H |
| Full General Ledger | Open | Not in scope without separate OK | Owner |

## Phase sequencing

- **9E** VAT Settlement — CONDITIONAL  
- **9F** Actual COGS & Profitability — CONDITIONAL  
- **9G** Operating Expenses, Accrual P&L & Cash Flow — this phase  
- **9H** Financial period lock — **not started**

## Owner / accountant actions

1. Real GrabMerchant export sample.  
2. Confirm CIT rate / status (currently `accountant_tbd`).  
3. Confirm depreciation useful-life policy.  
4. Confirm when auto expense allocation methods may be enabled.  
5. Confirm Staff Management → payroll accrual import contract for live data (no real salaries imported in 9G).
