# Release 3 — Backlog (Phase 10)

**Branch:** `release-3-final`  
**Base:** Phase 9H `f318635` + Vercel typecheck fix `5a56a2b` (cherry-pick of `8541c16`)  
**Updated:** Phase 10A–10G acceptance prep  

**Rule:** disabled / untested / accountant-pending items are **not** fully complete.

---

## Classification

### Production Blocker
| Item | Notes |
|------|-------|
| Owner OK for production SQL (9B–9H migrations) | Not applied on prod |
| Owner OK for merge → `main` | Not done |
| Owner OK for production FE deploy | Not done |
| Fresh production backup immediately before publish | Required at 10H |

### Deferred Integration
| Item | Notes |
|------|-------|
| Live GrabMerchant raw CSV/XLSX | Partial — needs real export sample |
| Live Poster order sync (write path) | Read/contract only; auto-sync OFF |
| Staff Management → payroll live import | Manual accrual OK; live import deferred |
| Campaign ad allocation to dishes | Methodology deferred |

### Disabled Feature
| Item | Notes |
|------|-------|
| Auto-consume stock on sales post | **OFF** (`sales_auto_consume_stock=false`) |
| Expense auto-allocation | **OFF** |
| Grab raw merchant file importer | Unsupported format → UI message; normalized path OK |

### Accountant Approval Required
| Item | Notes |
|------|-------|
| CIT rate / Net Profit | `accountant_tbd` → Pending Tax Calculation |
| Input VAT recognition policy edge cases | Pending marked, not auto-declared |
| Depreciation useful-life policy | `depreciation_policy_status=accountant_tbd` |
| Tax period kind (monthly/quarterly) | Configurable; not filed as official declaration |

### Future Improvement
| Item | Notes |
|------|-------|
| Full General Ledger | Out of R3 scope |
| Phase 10H/10I production publish | Separate owner confirmation |
| Release 4 | Not started |
| Richer UI live screenshots on staging FE+DB | Preview Ready; prod DB not used for test ops |

---

## Status board (R3 modules)

| Module | Status | Gate |
|--------|--------|------|
| 9A Architecture | Done (design) | — |
| 9B Sales & Output VAT | CONDITIONAL / local PASS | Prod SQL |
| 9C Input VAT Register | CONDITIONAL / local PASS | Prod SQL |
| 9D Platform Settlements | CONDITIONAL / Partial Grab raw | Sample + Prod SQL |
| 9E VAT Settlement | CONDITIONAL / local PASS | Accountant + Prod SQL |
| 9F Actual COGS & Profitability | CONDITIONAL / local PASS | Auto-consume OFF |
| 9G Opex / Payroll / Assets / P&L / CF | CONDITIONAL / local PASS | Payroll live deferred |
| 9H Periods / Audit | CONDITIONAL / local PASS | Prod SQL |
| 10A–10G Acceptance prep | This phase | Owner publish OK |

---

## SQL migrations Release 3 (apply order)

See `docs/RELEASE3_FINAL_ACCEPTANCE.md` § Migrations. Do **not** rewrite previously tested files without necessity.
