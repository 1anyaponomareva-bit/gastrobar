# Release 3 — Phase 9H Report: Financial Periods, Closing & Audit

**Branch:** `release-3-phase9h`  
**Base:** Phase 9G tip `358e006`  
**Date:** 2026-11-27  

## Overall status: **CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · auto-consume OFF · Free Plan / local Free-path only · no real finance documents or stock balances mutated beyond far-future fixtures · Phase 10 not started.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9h` |
| Base | `358e006` (9G CONDITIONAL) |
| Migrations | `20261127150000_*`, `20261127151000_*` |
| Tests | `scripts/erp/test-phase9h-periods.mjs` (27 PASS) |
| Report | `docs/RELEASE3_PHASE9H_REPORT.md` |
| Backlog | `docs/RELEASE3_BACKLOG.md` |

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127150000_erp_r3_financial_periods.sql` | Periods, closings, checks, snapshots, reopen requests, corrections; audit column extensions; close/reopen actor settings |
| `supabase/migrations/20261127151000_erp_r3_financial_periods_rpcs.sql` | Save/status/checklist/close/reopen/corrections; protect triggers; audit+snapshot immutability; `erp_load_state` 9H parts |

Local Free-path DB: `gastrofood_r2_copy`. **Not applied to production.**

---

## 3. Sub-phase results

### 9H-A Financial Periods — **PASS** (local)

- Independent management periods (`open` / `under_review` / `closed` / `reopened`).
- Overlapping date ranges for same legal entity blocked.
- Distinct from Phase 9E VAT tax periods (checklist information check `vat_period_independent`).
- UI: `/erp/finance/periods`.

### 9H-B Period Closing & Validation — **PASS** (local)

- Checklist: draft sales/expenses (blocking), pending COGS / unmatched platform / draft payroll / asset life / pending input VAT (warnings), VAT independence (info).
- Close requires zero blocking errors; warnings require explicit ack + reason (or settings `allow_close_with_warnings`).
- Close creates `erp_period_closings`, persists checks, writes immutable snapshots (Accrual P&L, CF, profitability, AP/AR, VAT summary, assets, payroll, COGS).
- Snapshot UPDATE/DELETE blocked (`period_snapshot_immutable`).

### 9H-C Historical Data Protection — **PASS** (local)

- Triggers on sales/expenses/payroll/stock docs/VAT settlements/depreciation + sales lines/COGS children.
- Closed-period amount/status mutations → `ERP_PERIOD_CLOSED`.
- Exception: expense **payment fields** (`payment_status` / `amount_paid` / `payment_date`) may update without rewriting P&L amounts.
- VAT settlement lifecycle remains independent of financial close status.
- Multi-table protect trigger uses `to_jsonb` field access (avoids PL/pgSQL NEW.column plan-cache failures).

### 9H-D Corrections & Reopening — **PASS** (local)

- Reopen requires non-empty reason; writes `erp_period_reopen_requests` + audit; status → `reopened`.
- Prior snapshots retained (new close increments version; older closings marked `superseded`).
- Corrections are separate docs; cannot recognize into a still-`closed` original period; originals untouched after correction post.
- UI: `/erp/finance/periods/corrections`.

### 9H-E Audit Log & Permissions — **PASS** (local)

- Extends existing `erp_audit_log` (no parallel journal): period id, role, prev/new values, request/source.
- Close / reopen / correction actions audited.
- Audit log UPDATE/DELETE blocked (`audit_log_immutable`).
- RPCs granted to `service_role` only; close/reopen actor lists on `erp_settings` (lightweight).
- UI: `/erp/finance/audit`.
- `erp_load_state` parts: `financialPeriods`, `periodClosings`, `periodCloseChecks`, `periodSnapshots`, `periodReopenRequests`, `financialCorrections`, `auditLog`.

---

## 4. Frontend / API

| Area | Notes |
|------|--------|
| Nav | `FINANCE_HREFS.periods`, `.audit` + mobile/desktop items |
| Pages | `FinancePeriodsPage`, `FinanceCorrectionsPage`, `FinanceAuditPage` |
| Routes | `/erp/finance/periods`, `/periods/corrections`, `/erp/finance/audit` |
| Actions | `saveFinancialPeriod`, `setFinancialPeriodStatus`, `periodCloseChecklist`, `closeFinancialPeriod`, `reopenFinancialPeriod`, `listPeriodSnapshots`, `saveFinancialCorrection`, `postFinancialCorrection` |
| Types / loader | State parts + action union wired |

Also fixed 9G UI pages that incorrectly called non-existent `useErp().run` → now use `act`.

---

## 5. Control tests (Free-path)

Command: `node scripts/erp/test-phase9h-periods.mjs`  
Result artifact: `docs/screenshots/phase9h/test-results.json`

| Suite | Count | Result |
|-------|------:|--------|
| 9H-A periods | 3 | PASS |
| Fixture expense | 1 | PASS |
| 9H-B close/snapshots | 7 | PASS |
| 9H-C protection / VAT independence | 4 | PASS |
| 9H-D reopen / corrections | 6 | PASS |
| 9H-E audit / load_state | 6 | PASS |
| **Total** | **27** | **PASS** |

Far-future dated fixtures only; production data and real warehouse balances untouched.

---

## 6. Remaining before Release 3 publish

1. Owner accept Phase 9H (this report) — CONDITIONAL until FE publish + prod SQL owner OK.  
2. Production migration apply (owner-gated) for 9B–9H SQL.  
3. Published frontend + live UI acceptance screenshots.  
4. Live GrabMerchant sample + Poster import beyond stubs.  
5. Auto-consume activation — **still OFF** until separate owner OK.  
6. Tax/CIT/depreciation policy accountant sign-off.  
7. Full regression on production-like data.  
8. Phase 10 — **not started** (out of scope here).

---

## 7. Explicit non-goals confirmed

- No production SQL applied.  
- No merge to `main`.  
- Frontend not published.  
- Auto-consume not activated.  
- Supabase Free Plan preserved.  
- Real financial documents / stock balances not changed (fixtures only).  
- Phase 10 not begun.
