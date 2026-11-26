# Release 3 — Phase 9G Report: Operating Expenses, P&L & Cash Flow

**Branch:** `release-3-phase9g`  
**Base:** Phase 9F tip `55bd9af`  
**Date:** 2026-11-27  

## Overall status: **CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · no real expenses/payroll/assets imported · auto-consume OFF · prices/recipes/stock untouched · Phase 9H not started.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9g` |
| Base | `55bd9af` |
| Backlog | `docs/RELEASE3_BACKLOG.md` |

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127140000_erp_r3_opex_assets_pnl.sql` | Expense extensions, allocations/payments, payroll accruals, fixed assets, AP/AR, settings |
| `supabase/migrations/20261127141000_erp_r3_opex_pnl_rpcs.sql` | Pay/allocate, payroll, depreciation, accrual P&L, CF, dashboard, load_state |

Local Free-path: `gastrofood_r2_copy`. **Not on production.**

---

## 3. Sub-phase results

### 9G-A Operating Expenses — **PASS** (local)

- Extends Phase 9C `erp_expense_documents` (no parallel expense engine).  
- Payments: `erp_expense_payments` linked optionally to cashbook tx (idempotent `payment_key`).  
- Partial/full pay updates `payment_status`; **does not** re-post P&L expense.  
- Allocations: manual only; `expense_auto_allocate=false`; auto blocked.  
- Posted expenses locked; adjustments via separate docs (`adjusted` status reserved).  
- Categories reuse `erp_input_vat_categories` + finance categories seeds.

### 9G-B Payroll & Staff — **PASS** (local / contract)

- New `erp_payroll_accruals` for approved accruals (manual / staff_management / import source).  
- Gross / employee SI / employer SI / PIT / net / meals separated.  
- Employer SI **not** deducted from net; employee withholdings **not** employer opex.  
- Accrual → P&L period; payment → CF / AP only (no second P&L).  
- Existing `erp_finance_payroll` remains cashbook bridge — no second salary engine.  
- **No real salaries imported.**

### 9G-C Fixed Assets — **PASS** (local)

- `erp_fixed_assets` + `erp_depreciation_entries`.  
- Straight-line only; useful life required to activate.  
- Depreciation idempotent per period key; NBV updated; non-cash P&L.  
- Capitalizable expenses skip opex AP on post.  
- Policy status `depreciation_policy_status=accountant_tbd`.  
- **No real asset cards created beyond tests.**

### 9G-D Accrual P&L — **PASS**

- `erp_accrual_pnl` aggregates 9B sales, 9F COGS, 9D platform fees, opex, payroll accruals, depreciation.  
- Control fixture §18: GP 360B / 72%, CM 245B / 49%, EBITDA 80B / 16%, EBIT/PBT 75B / 15% — **PASS**.  
- CIT `accountant_tbd` → Net Profit = **Pending Tax Calculation** (not auto).  
- Cash Basis `/erp/finance/pnl` labeled **Legacy**; Accrual at `/erp/finance/pnl/accrual`.

### 9G-E Cash Flow — **PASS** (local)

- `erp_management_cashflow` from cashbook + investing (capex payments) + financing category markers.  
- Internal transfers counted separately / excluded from external net.  
- Legacy CF remains at `/erp/finance/cashflow`; management at `/erp/finance/cashflow/management`.

### 9G-F Dashboard & AP/AR — **PASS** (wired)

- `erp_finance_dashboard`, `erp_ap_ar_summary`.  
- UI overview + expenses + assets + payables/receivables.  
- Completeness from accrual P&L (pending COGS / CIT).

---

## 4. Tables & RPC (summary)

**Tables:** `erp_expense_lines`, `erp_expense_allocations`, `erp_expense_payments`, `erp_payroll_accruals`, `erp_payroll_payments`, `erp_fixed_assets`, `erp_depreciation_entries`, `erp_ap_ar_items` (+ extensions on expense docs / settings).

**Key RPC:**  
`erp_expense_payment_*`, `erp_expense_allocation_save`, `erp_payroll_accrual_*`, `erp_payroll_payment_post`, `erp_fixed_asset_*`, `erp_depreciation_run`, `erp_accrual_pnl`, `erp_accrual_pnl_control_math`, `erp_management_cashflow`, `erp_ap_ar_summary`, `erp_finance_dashboard`.

---

## 5. UI paths (FE not published)

| Path | Screen |
|------|--------|
| `/erp/finance/overview` | Dashboard |
| `/erp/finance/expenses` | Operating expenses |
| `/erp/finance/assets` | Fixed assets |
| `/erp/finance/payables` | AP |
| `/erp/finance/receivables` | AR |
| `/erp/finance/pnl/accrual` | Accrual P&L |
| `/erp/finance/pnl` | Cash Basis / Legacy |
| `/erp/finance/cashflow/management` | Management CF |
| `/erp/finance/cashflow` | Cash Basis / Legacy |

Cashbook (`/erp/finance`) preserved.

---

## 6. Testing

Script: `scripts/erp/test-phase9g-opex-pnl.mjs`  
Results: `docs/assets/phase9g/r3-phase9g-test-results.json` (**48 PASS**)

Covered: expense post/pay/idempotency/alloc/lock, payroll accrual+next-period pay, employer SI, straight-line depr idempotent, capex vs opex AP, accrual P&L + CIT pending, CF, dashboard, AP/AR, regressions 9E/9F/cashbook, auto-consume OFF.

---

## 7. Screenshots (fixtures)

| File |
|------|
| `docs/assets/phase9g/01-finance-overview.png` |
| `docs/assets/phase9g/02-expenses.png` |
| `docs/assets/phase9g/03-accrual-pnl.png` |
| `docs/assets/phase9g/04-assets-depr.png` |

---

## 8. Limitations

1. CIT rate unset — Net Profit not computed.  
2. Auto allocation methods disabled.  
3. Depreciation life/policy accountant TBD.  
4. Staff Management live import not activated (contract only).  
5. Financing CF depends on category codes (`owner_contribution`, `loan_in`, …) when present.  
6. Platform commission/ads in P&L still period-window from 9D lines.  
7. No full General Ledger.  
8. FE unpublished; fixture screenshots only.  
9. Period lock = Phase 9H.

---

## 9. Questions for accountant

1. Confirm CIT rate and when Net Profit may be shown.  
2. Confirm straight-line useful lives / capitalization threshold.  
3. Confirm Input VAT recognition for services.  
4. Confirm payroll SI/PIT rule tables (configurable, not hard-coded).  
5. Confirm allocation methods allowed for shared Head Office costs.  
6. Confirm treatment of owner contributions / loan principal in CF vs P&L.

---

## 10. Status rationale → **CONDITIONAL**

**PASS:** control P&L; expense/payroll/asset/CF/dashboard Free-path; Legacy cash P&L separated; no parallel engines; 9H not started.

**CONDITIONAL:** CIT/depreciation/tax policies TBD; no live payroll/assets; FE unpublished; Grab/Poster/auto-consume backlog remains.

---

Phase 9H not started. Awaiting acceptance.
