# Release 3 — Backlog (Post Production Deploy)

**Updated:** Phase 10H/10I deploy · production git **`0767f22`**  
**Report:** `docs/RELEASE3_PRODUCTION_DEPLOY_REPORT.md`

---

## Production status

| Item | Status |
|------|--------|
| R3 SQL (15 migrations) | **Applied on production** |
| `main` / FE production | **`0767f22`** · Vercel **Ready** · https://gastrofood.vn |
| Owner final user acceptance | **Pending** |
| Release 4 | **Not started** |

---

## Classification

### Production Blocker
| Item | Notes |
|------|-------|
| Owner final acceptance of Release 3 UI | Login verified; authenticated walkthrough pending owner |

### Deferred Integration
| Item | Notes |
|------|-------|
| Live GrabMerchant raw CSV/XLSX | Needs real export sample |
| Live Poster order auto-sync | OFF |
| Staff Management → payroll live import | Manual accrual only |
| Campaign ad allocation to dishes | Methodology deferred |

### Disabled Feature
| Item | Notes |
|------|-------|
| Auto-consume | **OFF** on production |
| Expense auto-allocation | **OFF** |
| Grab raw merchant importer | Unsupported without sample |

### Accountant Approval Required
| Item | Notes |
|------|-------|
| CIT / Net Profit | `accountant_tbd` |
| Input VAT edge recognition | Pending allowed |
| Depreciation useful-life policy | `accountant_tbd` |
| Official tax declaration packaging | Not claimed |

### Future Improvement
| Item | Notes |
|------|-------|
| Full General Ledger | Out of R3 |
| Authenticated screenshot pack (owner session) | Optional completeness |
| Auto-consume go-live plan | `docs/RELEASE3_AUTO_CONSUME_PLAN.md` |
