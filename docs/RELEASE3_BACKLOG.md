# Release 3 — Backlog

**Updated:** Phase 9H (`release-3-phase9h`)  
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
| Financial period hard lock | **Done (9H local)** | Close/protect/reopen/audit; prod SQL pending | Owner OK |
| Full General Ledger | Open | Not in scope without separate OK | Owner |

## Phase sequencing

- **9E** VAT Settlement — CONDITIONAL  
- **9F** Actual COGS & Profitability — CONDITIONAL  
- **9G** Operating Expenses, Accrual P&L & Cash Flow — CONDITIONAL  
- **9H** Financial Periods, Closing & Audit — CONDITIONAL (this phase)  
- **Phase 10** — **not started**

## Owner / accountant actions

1. Real GrabMerchant export sample.  
2. Confirm CIT rate / status (currently `accountant_tbd`).  
3. Confirm depreciation useful-life policy.  
4. Confirm when auto expense allocation methods may be enabled.  
5. Confirm Staff Management → payroll accrual import contract for live data.  
6. Accept Phase 9H + authorize production SQL for 9B–9H when ready.  
7. Confirm finance close/reopen actor lists for production settings.

## Remaining before Release 3 publish

1. Owner accept 9H report.  
2. Production migrations (owner-gated).  
3. Publish frontend + live acceptance.  
4. Live Grab / Poster imports.  
5. Auto-consume decision (default OFF).  
6. Accountant tax/CIT/depreciation sign-off.  
7. Full regression.  
8. Do **not** start Phase 10 until R3 publish gate cleared.
