# Release 3 — Backlog (Post Production + UI/Poster fix)

**Updated:** UI periods visibility + permanent Poster ban  
**Production:** https://gastrofood.vn · see `docs/RELEASE3_UI_FIX_POSTER_BAN.md`

---

## Forbidden by owner

| Item | Status |
|------|--------|
| **Poster POS ↔ ERP sync / auto-sync / live API** | **FORBIDDEN BY OWNER** (permanent) |
| Poster tokens for ERP sync | Do not request |
| Background Poster sync jobs | Do not create |
| Manual Poster file import into ERP | Only after **separate** explicit owner OK |

GASTROFOOD ERP operates **independently** of Poster POS. Historical poster-sourced rows may remain; no new sync.

---

## Classification

### Production Blocker
| Item | Notes |
|------|-------|
| Owner final acceptance of Release 3 | Pending (periods menu fixed; re-check) |

### Deferred Integration
| Item | Notes |
|------|-------|
| Live GrabMerchant raw CSV/XLSX | Needs real export sample |
| Staff Management → payroll live import | Manual accrual only |
| Campaign ad allocation to dishes | Methodology deferred |

### Disabled Feature
| Item | Notes |
|------|-------|
| Auto-consume | **OFF** |
| Expense auto-allocation | **OFF** |
| Grab raw merchant importer | Unsupported without sample |

### Accountant Approval Required
| Item | Notes |
|------|-------|
| CIT / Net Profit | `accountant_tbd` |
| Input VAT edge recognition | Pending allowed |
| Depreciation useful-life policy | `accountant_tbd` |
| Proposed SQL Poster forbid in RPCs | `docs/PROPOSED_SQL_POSTER_ERP_SYNC_FORBIDDEN.md` |

### Future Improvement
| Item | Notes |
|------|-------|
| Full General Ledger | Out of R3 |
| Auto-consume go-live | `docs/RELEASE3_AUTO_CONSUME_PLAN.md` |
| Release 4 | **Not started** |

### Removed from plan
| Item | Notes |
|------|-------|
| Live Poster Integration / Auto-Sync | **FORBIDDEN BY OWNER** — removed from mandatory backlog |
