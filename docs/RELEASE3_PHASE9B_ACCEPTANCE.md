# Phase 9B — Final Acceptance Matrix

**Branch:** `release-3-phase9b`  
**Implementation commit:** `1e2c6bf`  
**Date:** 2026-11-26  
**Environment:** local Free-path PostgreSQL `gastrofood_r2_copy` (not production)  
**Constraints:** no prod SQL · no merge to main · FE not published · auto-consume OFF · no real import · 9C not started  

**Overall status: CONDITIONAL**

---

## 1. Realization

| Component | Status | Notes |
|-----------|--------|-------|
| Sales Documents (`erp_sales_documents`) | **Full** | Draft/post/cancel/refund; locked when posted |
| Sales Lines (`erp_sales_lines`) | **Full** | Qty, money, VAT snapshot, modifiers, prep ids |
| Sales Source Links (`erp_sales_source_links`) | **Full** | Unique per source+account+external id |
| Canonical Order Key | **Full** | Unique among active non-cancelled docs |
| Output VAT Register | **Full** | UI `/erp/finance/vat/output` + RPC register |
| Output VAT Snapshot | **Full** | Rate/source/base/amount/exception/rule_ref frozen on save/post |
| Sales COGS Allocations (`erp_sales_cogs_allocations`) | **Full** | Schema + post_cogs bridge to `erp_consume` |
| Actual COGS | **Partial** | Works when auto-consume explicitly enabled (local test); **production flag OFF** |
| Pending COGS | **Full** | Default path + insufficient stock |
| Reconciliation Status | **Full** | exact / manual / unmatched / conflict |
| Poster / Grab Import Contracts | **Partial** | Contracts + validate-only stub; **no apply / no live fetch** |

### Left for later phases (not claimed as done)

- Live Poster/Grab historical import apply  
- Production enablement of `sales_auto_consume_stock`  
- Full dish BOM auto-explosion to FIFO (dish without product/prep → pending)  
- Accrual P&L / Phase 9C  
- Published FE / production migrations  
- Dedicated reconciliation workspace beyond card source-links list  
- Accountant-final discount/subsidy VAT policy lock-in  

---

## 2. Control scenarios

| # | Scenario | Result | Test reference |
|---|----------|--------|----------------|
| 1 | Повторное проведение одного заказа | **PASS** | `scripts/erp/test-phase9b-sales.mjs` → `repost_idempotent` |
| 2 | Повторный импорт одного заказа | **PASS** | `test-phase9b-sales.mjs` → `duplicate_poster_blocked` |
| 3 | Один заказ из Poster и Grab | **PASS** | `scripts/erp/test-phase9b-acceptance.mjs#S3` (manual link, 1 revenue doc) |
| 4 | Неоднозначное сопоставление | **PASS** | `test-phase9b-acceptance.mjs#S4` (exact → ERP_DUPLICATE; no amount/time auto-match RPC) |
| 5 | Продажа с модификаторами | **PASS** | `test-phase9b-acceptance.mjs#S5` (modifiers JSON persisted) |
| 6 | Смена глобального НДС после проведения | **PASS** | `test-phase9b-sales.mjs` → `posted_vat_frozen` |
| 7 | Полный возврат | **PASS** | `test-phase9b-sales.mjs` → `full_refund` |
| 8 | Частичный возврат | **PASS** | `test-phase9b-acceptance.mjs#S8` → `partially_refunded` |
| 9 | Недостаточный остаток → Pending COGS | **PASS** | `test-phase9b-acceptance.mjs#S9` (sale stays `posted`, COGS `partial`/`insufficient`) |
| 10 | Повторное FIFO-списание | **PASS** | `test-phase9b-acceptance.mjs#S10` (idempotent when `cogs_status=posted`) |
| 11 | Полуфабрикат без повторного сырья | **PASS** | `test-phase9b-acceptance.mjs#S11` (prep_product_ids stored + `erp_sales_post_cogs` prefers prep path). *Full stock drain of prep vs raw BOM not mass-run on prod (auto-consume OFF).* |
| 12 | Продажа после полуночи | **PASS** | `test-phase9b-sales.mjs` → `business_date_after_midnight` (02:30 → prior business day) |
| 13 | RLS и права | **PASS** | `test-phase9b-acceptance.mjs#S13` (RLS on; no INSERT/UPDATE/DELETE for anon/authenticated) |
| 14 | Параллельное проведение | **PASS** | `test-phase9b-acceptance.mjs#S14` (dual post → single `posted` doc) |
| 15 | Нет регрессий R1/R2 | **PASS** *(smoke)* | `test-phase9b-acceptance.mjs#S15` — key R1/R2 objects present (`erp_consume`, tax rates, lots, movements). **Not a full ERP audit.** |

Artifacts:

- `C:\Users\Nikita Ponomarev\GASTROBAR-backups\r3-phase9b-test-results.json`
- `C:\Users\Nikita Ponomarev\GASTROBAR-backups\r3-phase9b-acceptance-results.json`

---

## 3. Interface screenshots

**Note:** Frontend **not published**. Screenshots are **UI fixtures** mirroring implemented React screens (`FinanceSalesPage` / `FinanceOutputVatPage`) with **test data only**, badge `TEST DATA ONLY · FE not published`.

| Shot | File |
|------|------|
| Финансы → Продажи | [`docs/assets/phase9b/01-sales-list.png`](assets/phase9b/01-sales-list.png) |
| Карточка продажи | [`docs/assets/phase9b/02-sale-card.png`](assets/phase9b/02-sale-card.png) |
| Финансы → Исходящий НДС | [`docs/assets/phase9b/03-output-vat.png`](assets/phase9b/03-output-vat.png) |
| Карточка с Actual COGS | [`docs/assets/phase9b/04-cogs-actual.png`](assets/phase9b/04-cogs-actual.png) |
| Карточка с Pending COGS | [`docs/assets/phase9b/05-cogs-pending.png`](assets/phase9b/05-cogs-pending.png) |
| Сверка Poster / Grab | [`docs/assets/phase9b/06-reconcile-poster-grab.png`](assets/phase9b/06-reconcile-poster-grab.png) |

**Code paths (not live):**

- `/erp/finance/sales`
- `/erp/finance/sales/[id]`
- `/erp/finance/vat/output`

---

## 4. Why CONDITIONAL (not unconditional PASS)

1. FE not on production → live UI not owner-verified in browser against real app deploy.  
2. Actual COGS mass path intentionally disabled (`sales_auto_consume_stock=false`).  
3. Import contracts are stubs (validated, not applied).  
4. Scenario 15 is presence smoke, not full R1/R2 regression suite.  
5. Scenario 11 proves prep-preference contract + persistence; live prep FIFO burn only under explicit local flag.

No critical scenario marked PASS without a real test. No FAIL remaining after acceptance retest.

---

## 5. Final status

# **CONDITIONAL**

Awaiting owner approval before Phase 9C.
