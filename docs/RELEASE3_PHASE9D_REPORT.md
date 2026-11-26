# Release 3 — Phase 9D Report: Platform Commission, Advertising & Settlements

**Branch:** `release-3-phase9d`  
**Base:** Phase 9C tip `c0d1e0c`  
**Date:** 2026-11-26  

## Overall status: **CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · no real Oct 2026 documents · auto-consume OFF · prices/recipes/stock untouched · Phase 9E not started.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9d` |
| Implementation | (tip after this report commit) |
| Backlog | `docs/RELEASE3_BACKLOG.md` updated |

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127110000_erp_r3_platform_settlements.sql` | Accounts, column maps, import batches, settlements/lines, payouts/allocations, reconciliation, RLS |
| `supabase/migrations/20261127111000_erp_r3_platform_rpcs.sql` | Import pipeline RPCs, payouts, dashboard, Oct 2026 math, load_state 9D parts |

Local Free-path validated on `gastrofood_r2_copy`. **Not on production.**

---

## 3. Tables & RPC

### Tables

- `erp_platform_accounts`
- `erp_platform_column_maps` (inactive until owner Grab sample)
- `erp_platform_import_batches`
- `erp_platform_settlements`
- `erp_platform_settlement_lines`
- `erp_platform_payouts`
- `erp_platform_payout_allocations`
- `erp_platform_reconciliation`

### RPC

- `erp_platform_import_upload` → `preview` → `confirm` → `apply`
- `erp_platform_save_payout` / `erp_platform_post_payout`
- `erp_platform_dashboard`
- `erp_platform_manual_match`
- `erp_platform_oct2026_fixture_math`

---

## 4. Supported import formats

| Format | Status |
|--------|--------|
| `normalized_json_v1` | **Working** (full pipeline) |
| `normalized_csv_v1` | **Working** (headers = ERP normalized fields) |
| `grab_merchant_csv` | **Gated** — requires active `erp_platform_column_maps` + real sample |
| `grab_merchant_xlsx` | **Architecture only** — blocked until sample + parser activation |

**No GrabMerchant raw column names were invented.**

Owner action: provide a real GrabMerchant CSV/XLSX export so column map can be activated.

Fixture (normalized, not raw Grab): `docs/fixtures/grab-oct2026-normalized.json`

Client parser: `src/lib/erp/platformImport.ts`

---

## 5. Deduplication

- File: unique `(platform_code, file_sha256)` for non-rejected batches  
- Operation: unique `operation_key` on settlement lines  
- Re-apply batch: idempotent  
- Renamed file with same SHA: blocked  
- Duplicate operation in later file: preview error `duplicate_operation`  
- Bank tx: unique payout_bank reconciliation link (no second cash)

---

## 6. Integration Phase 9B

- Links Grab `external_order_id` + merchant → `erp_sales_source_links`  
- Match statuses: matched / conflict / unmatched / manually_matched  
- **Does not create sales revenue** from settlement  
- **Does not trigger FIFO**  
- Gross mismatch → `conflict` (no auto-overwrite of posted sale)

---

## 7. Integration Phase 9C

- Optional `p_create_vat_expenses` creates Pending Input VAT expense docs (`platform_commission` / `platform_advertising`)  
- VAT status defaults **unverified/pending** — never forecast-derived deductible VAT  
- Tax invoice dedupe reused from 9C  
- Uses existing Input VAT register (no second register)

---

## 8. Payout reconciliation

- Expected / actual / outstanding  
- One payout → many settlements via allocations  
- Partial payout status  
- Optional link to existing `erp_finance_transactions` without recreating cash  
- Dashboard: Net Earnings vs Actual Payouts difference (explicitly not auto bank receipt)

---

## 9. October 2026 control calculation

| Check | Result |
|-------|--------|
| 434 904 005 − 764 000 = 434 140 005 | PASS |
| 434 140 005 − 85 240 734 − 30 349 488 − 76 347 = 318 473 436 | PASS |
| VAT on commission/ads | Unverified (not deductible) |
| Real Oct docs created | **No** |

---

## 10. Testing

Script: `scripts/erp/test-phase9d-platforms.mjs`  
Artifact: `GASTROBAR-backups/r3-phase9d-test-results.json`

Covered: correct import, errors, duplicate file/op, Grab raw blocked, Poster+Grab match, conflict, unverified VAT, partial VAT, invoice dedupe, partial payout, multi-settlement payout, no double revenue, auto-consume OFF, dashboard, RLS, R1/R2/9B/9C smoke.

**Deferred until Grab sample:** live raw CSV/XLSX column parse, advertising dual-source (settlement vs ads report) full reconcile UI, browser RLS matrix.

---

## 11. UI paths (FE not published)

| Screen | Path |
|--------|------|
| Overview | `/erp/finance/platforms` |
| Import | `/erp/finance/platforms/import` |
| Commission | `/erp/finance/platforms/commission` |
| Advertising | `/erp/finance/platforms/ads` |
| Payouts | `/erp/finance/platforms/payouts` |
| Reconcile | `/erp/finance/platforms/reconcile` |

Screenshots (test fixtures):

- `docs/assets/phase9d/01-platforms-overview.png`
- `docs/assets/phase9d/02-platforms-import.png`

---

## 12. Remaining limitations

1. Raw GrabMerchant format unknown — **owner must provide sample file**  
2. XLSX parser not activated  
3. FE not published / migrations not on production  
4. Live Grab Import backlog remains **Partial** until real-format validation  
5. Advertising allocation methodology across orders not approved — period/campaign level only  
6. Net Earnings never treated as bank money without payout reconcile  

---

## 13. Questions for owner / accountant

1. **Owner:** Please attach a real GrabMerchant settlement CSV and/or XLSX (headers + 5–10 sample rows can be anonymized).  
2. **Owner:** Confirm Merchant ID / Store ID mapping to ERP locations.  
3. **Accountant:** Commission / advertising VAT rates and deductibility when invoices arrive?  
4. **Accountant:** Is Net Earnings After Marketing the expected payout base, or another Grab field?  
5. **Owner:** Separate advertising report vs settlement ads — which is source of truth?

---

## 14. Final status

# **CONDITIONAL**

Primary condition: raw GrabMerchant sample not yet provided; normalized pipeline and architecture are ready.

Phase 9E not started. Awaiting acceptance.
