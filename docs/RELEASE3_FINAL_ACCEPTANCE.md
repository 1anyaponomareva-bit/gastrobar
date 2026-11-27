# Release 3 — Final Acceptance (Phase 10A–10G)

**Date:** 2026-11-27  
**Branch:** `release-3-final`  
**Base authorized:** `f318635` (Phase 9H CONDITIONAL)  
**Build fix included:** cherry-pick `8541c16` → `5a56a2b` (Vercel typecheck / `useErp().run`)  
**Acceptance commit:** `79ec635`  
**Overall status:** **READY WITH DISABLED FEATURES**

10H Production Deployment and 10I Final Production Acceptance are **not** executed.  
Awaiting **one final owner confirmation** for: production SQL · merge to `main` · production frontend deploy.

---

## 1. Constraints honored

| Constraint | Status |
|------------|--------|
| Production SQL not applied | OK |
| Merge to `main` not performed | OK |
| Production frontend not published | OK |
| Supabase Pro not enabled | OK |
| SpiceSpace unused | OK |
| Auto-consume OFF | OK (`false` on restore + Free-path) |
| Real historical sales not imported | OK |
| Real payroll not imported | OK |
| Prices / recipes / stock not changed (beyond far-future fixtures on local copies) | OK |
| Real financial periods not closed | OK |
| Release 4 not started | OK |
| No new R3 feature scope | OK (fixes/tests/docs only) |

---

## 2. Phase 10A — Release Integration

### Branch / main compatibility

| Item | Value |
|------|-------|
| `origin/main` tip | `8f163f7` (9A architecture only) |
| Merge-base | `8f163f7` |
| `release-3-final` vs main | **16 commits ahead, 0 behind** (fast-forward capable later) |
| Modules present | 9A–9H migrations + FE + reports |

### SQL migrations

Canonical ordered list: `docs/RELEASE3_MIGRATIONS.md` (15 files, 9B→9H).  
Not rewritten; applied as-is on restored local DB.

### Backlog

Updated: `docs/RELEASE3_BACKLOG.md` with Production Blocker / Deferred / Disabled / Accountant / Future.

---

## 3. Phase 10B — Full Regression Testing

### Counts

| Suite | PASS | FAIL | SKIP | DEFERRED | Notes |
|-------|-----:|-----:|-----:|---------:|-------|
| R1 unit `npm run test:finance` | **74** | 0 | 0 | 0 | Calculator, VAT, recipe costing, VAT adj |
| R2 Phase 8 `test:phase8` | **13** | 0 | 0 | 0 | PGlite VAT/FIFO |
| R2 Phase 8G acceptance | **12** | 0 | 0 | 0 | PGlite acceptance |
| R3 9B sales Free-path | **PASS** | 0 | 0 | 0 | `test-phase9b-sales.mjs` |
| R3 9B acceptance S1–S15 | **15** | 0 | 0 | 0 | `test-phase9b-acceptance.mjs` |
| R3 9C Input VAT | **PASS** | 0 | 0 | 0 | `test-phase9c-input-vat.mjs` |
| R3 9D Platforms | **PASS** | 0 | 0 | 0 | `test-phase9d-platforms.mjs` |
| R3 9E VAT Settlement | **55** | 0 | 0 | 0 | artifact `docs/assets/phase9e/...` |
| R3 9F BOM/COGS/Profitability | **43** | 0 | 0 | 0 | |
| R3 9G Opex/P&L/CF | **48** | 0 | 0 | 0 | |
| R3 9H Periods/Audit | **27** | 0 | 0 | 0 | |
| Typecheck | **PASS** | 0 | 0 | 0 | `tsc --noEmit` |
| Production build | **PASS** | 0 | 0 | 0 | `next build` |
| Vercel Preview (`release-3-phase9h` / final push) | **Ready** after fix | — | — | — | prior Error was typecheck |
| Live Grab raw file | — | — | — | **DEFERRED** | no real export |
| Live Poster auto-sync | — | — | — | **FORBIDDEN BY OWNER** | Permanent ban |
| Auto-consume ON scenarios | — | — | — | **DISABLED** | plan only |
| Interactive UI ops on isolated FE↔test DB screenshots | — | — | — | **PARTIAL** | routes/build/Preview verified; see §7 |

**Unverified scenarios are not marked PASS.**

### Matrix (summary)

| Area | Result |
|------|--------|
| R1 tax rates / exceptions / channels / calculator / forecast margin / recommended prices | PASS (unit) |
| R2 supply / input VAT / FIFO / moves / writeoffs / count / production / VAT cost adj / lineage / recipe costing | PASS (PGlite 8/8G + prior R2 freeze) |
| R3 sales / output VAT / input VAT / platforms / VAT settlement / BOM / COGS / profitability / opex / payroll / assets / depr / P&L / CF / AP-AR / periods / audit | PASS (Free-path suites) |

---

## 4. Phase 10C — End-to-End Financial Testing

Script: `scripts/erp/test-phase10-e2e-finance.mjs`  
Artifact: `docs/screenshots/phase10/e2e-finance-results.json`  
**21/21 PASS** on `gastrofood_r2_copy` (far-future fixtures).

| Step | Result |
|------|--------|
| Expense / Input VAT register | PASS |
| Sale post + Output VAT | PASS |
| BOM explode | PASS |
| COGS with auto-consume OFF → pending | PASS |
| Platform normalized preview | PASS |
| Payroll accrual post | PASS |
| Depreciation run | PASS |
| VAT settlement compute | PASS |
| Accrual P&L / CF / AP-AR | PASS |
| Period close | PASS |
| Correction next period; original untouched | PASS |
| No double expense net | PASS |

Stock purchase→lots→production→transfer full warehouse chain for *current* real SKUs: covered by R2 Phase 8/8G + 9F suites; not re-executed as a single mega-script against live catalog lots (avoid mutating real balances). Marked **covered by regression**, not re-labeled as new E2E warehouse PASS beyond fixtures.

---

## 5. Phase 10D — Security

Script: `scripts/erp/test-phase10-security.mjs`  
Artifact: `docs/screenshots/phase10/security-results.json`  
**16/16 PASS** (local).

| Check | Result |
|-------|--------|
| `erp_period_close` not executable by `anon` / `authenticated` | PASS |
| Closed period: block UPDATE net/VAT/recognition_date | PASS |
| Closed period: block INSERT / DELETE | PASS |
| Payment-field exception allows payment_status/amount_paid/payment_date | PASS |
| Payment exception does **not** change net/VAT | PASS |
| Move open doc date into closed period blocked | PASS |
| Snapshot immutability | PASS |
| Audit log immutability | PASS |
| Secrets in git | No live keys found; only `process.env.SUPABASE_SERVICE_ROLE_KEY` references; `.env*` gitignored |

API/import bypass beyond SQL roles: service_role is intended server path; FE uses server actions with auth — no production publish in this phase. Parallel close race: not load-tested (DEFERRED stress).

---

## 6. Phase 10E — Database Migration & Backup

### Free Path steps performed

1. **Fresh pg_dump** via `scripts/erp/pg-dump-prod-free.mjs`  
   - Path: `%USERPROFILE%/GASTROBAR-backups/prod-ulxmubivimwxevgxxxyu-2026-11-27T08-03-48-031Z.dump`  
   - Bytes: **1 448 414** · `pg_restore -l` OK (**1412** TOC lines)
2. Restore → local DB **`gastrofood_r3_phase10`**
3. Baseline counts recorded
4. Applied all **15** R3 migrations in order
5. Post-migration preserve checks

Artifact: `docs/screenshots/phase10/restore-migrate-results.json` — **48 PASS**

### Data preservation (baseline → after)

| Entity | Before | After |
|--------|-------:|------:|
| Products | 146 | 146 |
| Recipes | 9 | 9 |
| Dishes | 1 | 1 |
| Suppliers | 26 | 26 |
| Lots | 1 | 1 |
| Stock rows | 0 | 0 |
| Documents | 1 | 1 |
| Finance transactions | 0 | 0 |
| Tax rates | 6 | 6 |
| auth.users | 5 | 5 |

R3 tables present; auto-consume remains **false**.  
**Production not migrated.**

---

## 7. Phase 10F — UI Acceptance

### Exact ERP menu paths (Finance)

| Section | Path |
|---------|------|
| Обзор | `/erp/finance/overview` |
| Касса | `/erp/finance` |
| Продажи | `/erp/finance/sales` |
| Исходящий НДС | `/erp/finance/vat/output` |
| Входящий НДС | `/erp/finance/vat/input` |
| Агрегаторы | `/erp/finance/platforms` |
| НДС к уплате | `/erp/finance/vat/settlement` |
| Прибыльность | `/erp/finance/profitability` |
| Расходы | `/erp/finance/expenses` |
| Основные средства | `/erp/finance/assets` |
| Кредиторка | `/erp/finance/payables` |
| Дебиторка | `/erp/finance/receivables` |
| Accrual P&L | `/erp/finance/pnl/accrual` |
| Cash Flow (mgmt) | `/erp/finance/cashflow/management` |
| Финансовые периоды | `/erp/finance/periods` |
| Корректировки | `/erp/finance/periods/corrections` |
| Журнал аудита | `/erp/finance/audit` |
| Legacy P&L | `/erp/finance/pnl` (labeled Legacy) |
| Legacy CF | `/erp/finance/cashflow` |

### Verification

- Pages compile in production build.  
- Preview deploy Ready after typecheck fix.  
- Nav wired in `financeNav.tsx`.  
- **Interactive click-through screenshots against a FE bound only to test DB:** PARTIAL / not claimed as full PASS (avoid driving prod Supabase from Preview for financial writes).

Grab raw format: keep Partial; UI must show unsupported raw format (normalized importer retained).

---

## 8. Live integrations / policies

| Topic | Status |
|-------|--------|
| Poster | **FORBIDDEN BY OWNER** — no ERP sync; API ban at pin `1c23863`; SQL guard proposed only |
| Grab | Normalized OK; **raw GrabMerchant DEFERRED** until real file |
| Auto-consume | **OFF**; activation plan = separate owner OK + go-live date; no historical backfill consume |
| Payroll / Staff | Accrual engine OK; **live import DEFERRED**; P&L completeness Partial when missing |
| Tax policy | CIT Pending; Input VAT Pending allowed; not an official declaration |

---

## 9. Phase 10G — Deployment Readiness

### Publish plan (for 10H — not executed)

1. Fresh production backup (new dump; do not reuse this report’s dump alone)  
2. Production schema check  
3. Production data baseline counts  
4. Apply 15 R3 migrations in order (`docs/RELEASE3_MIGRATIONS.md`)  
5. DB smoke (RPC presence, auto-consume false, settings)  
6. Merge `release-3-final` → `main` (FF)  
7. Production frontend deploy  
8. Production security checks (RPC grants, auth)  
9. Production UI verification (read-only first)  
10. Final user acceptance (10I)

### Compatibility window

R1/R2 FE on current prod schema is compatible **until** SQL lands.  
After SQL, before FE: new tables unused by old FE → generally safe; prefer short maintenance if deploying both.

### Rollback

| Layer | Plan |
|-------|------|
| Frontend | Redeploy previous Vercel production deployment |
| Database | **Do not** auto-restore. Restore from backup only with owner OK; destroys post-backup writes. Prefer forward-fix migrations if possible |

---

## 10. Production Blockers (must clear before READY without caveat)

1. Owner confirmation for production SQL + merge + FE deploy (10H/10I).  
2. Fresh backup immediately before SQL.  
3. Optional: Grab sample if owner requires full platform ops on day one (otherwise ship with Partial Grab).  
4. Optional: interactive UI screenshot pack on FE↔test DB if owner requires before publish.

---

## 11. Final status

### **READY WITH DISABLED FEATURES**

Allowed limited R3 publish after owner 10H confirmation, with:

- Auto-consume **OFF**  
- Grab raw **Partial**  
- Poster ERP sync **FORBIDDEN BY OWNER** (permanent)  
- Payroll live import **Deferred**  
- CIT / some tax policies **Pending / marked**

Not **READY** (unqualified) and not **BLOCKED** (no critical test failures on Free Path).

---

## 12. Stop point

Phase **10A–10G complete**.  
**Please confirm in one message** whether to proceed with Phase **10H** (production SQL + merge + frontend deploy) and then **10I**.
