# Release 3 — Production Deploy Report (Phase 10H / 10I)

**Date:** 2026-11-27 (UTC+7)  
**Authorized app version:** `0767f22`  
**Deploy report commit:** `1c77ed5`  
**Status:** **DEPLOYED — awaiting owner final user acceptance**

---

## 1. Pre-deployment

| Item | Value |
|------|--------|
| Pre-deploy `origin/main` | `8f163f7` (9A only) |
| Conflicts vs `release-3-final` | None (ancestor; FF **18** commits) |
| Post-merge `origin/main` / production git | **`0767f22`** |
| Fresh backup | `C:\Users\Nikita Ponomarev\GASTROBAR-backups\prod-ulxmubivimwxevgxxxyu-2026-11-27T08-31-29-900Z.dump` |
| Backup size | **1 451 363** bytes |
| Backup integrity | `pg_restore -l` OK · **1412** TOC lines · meta `list_ok: true` |
| Backup time (UTC) | 2026-11-27T08:32:09.387Z |
| Schema compatibility | Additive R3 tables/RPCs; R1/R2 FE continues to work; new pages after FE deploy |

---

## 2. Production SQL (15 migrations)

Applied with `scripts/erp/apply-r3-migrations-prod.mjs` (`APPLY_R3_PROD=YES`).  
Artifact: `docs/screenshots/phase10h/prod-migrate-results.json`

| # | Migration | Status |
|---|-----------|--------|
| 1 | `20261127090000_erp_r3_sales_output_vat.sql` | **applied** |
| 2 | `20261127091000_erp_r3_sales_rpcs.sql` | **applied** |
| 3 | `20261127100000_erp_r3_input_vat_register.sql` | **applied** |
| 4 | `20261127101000_erp_r3_input_vat_rpcs.sql` | **applied** |
| 5 | `20261127110000_erp_r3_platform_settlements.sql` | **applied** |
| 6 | `20261127111000_erp_r3_platform_rpcs.sql` | **applied** |
| 7 | `20261127120000_erp_r3_vat_settlement.sql` | **applied** |
| 8 | `20261127121000_erp_r3_vat_settlement_rpcs.sql` | **applied** |
| 9 | `20261127130000_erp_r3_sales_bom_cogs.sql` | **applied** |
| 10 | `20261127131000_erp_r3_sales_bom_cogs_rpcs.sql` | **applied** |
| 11 | `20261127132000_erp_r3_profitability_rpcs.sql` | **applied** |
| 12 | `20261127140000_erp_r3_opex_assets_pnl.sql` | **applied** |
| 13 | `20261127141000_erp_r3_opex_pnl_rpcs.sql` | **applied** |
| 14 | `20261127150000_erp_r3_financial_periods.sql` | **applied** |
| 15 | `20261127151000_erp_r3_financial_periods_rpcs.sql` | **applied** |

### Data preservation (before → after)

| Entity | Before | After |
|--------|-------:|------:|
| Products | 147 | 147 |
| Recipes | 9 | 9 |
| Dishes | 1 | 1 |
| Suppliers | 26 | 26 |
| Lots | 1 | 1 |
| Stock rows | 0 | 0 |
| Documents | 2 | 2 |
| Finance transactions | 0 | 0 |
| Tax rates | 6 | 6 |
| auth.users | 5 | 5 |

### Security / flags (post-SQL smoke)

Artifact: `docs/screenshots/phase10h/prod-smoke-db.json`

| Check | Result |
|-------|--------|
| `sales_auto_consume_stock` | **false** |
| `expense_auto_allocate` | **false** |
| `cit_status` | **accountant_tbd** |
| `erp_financial_periods` present | yes |
| Audit immutability triggers | 2 |
| Snapshot immutability triggers | 2 |
| Period protect triggers | 21 |
| `anon` / `authenticated` cannot execute `erp_period_close` | PASS (at migrate) |
| RPC `erp_period_close` / `erp_accrual_pnl` | present |

No production financial/stock documents were created. No periods closed. No prices/recipes/lots rewritten.

---

## 3. Frontend deployment

| Item | Value |
|------|--------|
| Merge | `release-3-final` → `main` (FF) `8f163f7..0767f22` |
| Vercel production deployment | `gastrobar-hktjfkdpv-annas-projects-183a79d7` |
| Vercel status | **Ready** |
| Production commit | **`0767f22`** |
| Production URL | **https://gastrofood.vn** |
| ERP entry | **https://gastrofood.vn/erp** |

---

## 4. Smoke tests

### HTTP routes (all **200**)

Artifact: `docs/screenshots/phase10h/prod-http-smoke.json`

| Path | Status |
|------|--------|
| `/erp` | 200 |
| `/erp/finance` (кассовая книга) | 200 |
| `/erp/finance/overview` | 200 |
| `/erp/finance/sales` | 200 |
| `/erp/finance/expenses` | 200 |
| `/erp/finance/platforms` | 200 |
| `/erp/finance/profitability` | 200 |
| `/erp/finance/vat/input` | 200 |
| `/erp/finance/vat/output` | 200 |
| `/erp/finance/vat/settlement` | 200 |
| `/erp/finance/assets` | 200 |
| `/erp/finance/payables` | 200 |
| `/erp/finance/receivables` | 200 |
| `/erp/finance/pnl/accrual` | 200 |
| `/erp/finance/cashflow/management` | 200 |
| `/erp/finance/periods` | 200 |
| `/erp/finance/audit` | 200 |
| `/api/erp/state` (unauthenticated) | **401** (expected) |

No schema/API hard-fail on public route shell. Authenticated API not exercised with writes.

---

## 5. UI verification (10I)

### Menu paths & direct links

| Раздел | Меню | URL |
|--------|------|-----|
| Обзор | Финансы → Обзор | https://gastrofood.vn/erp/finance/overview |
| Продажи | Финансы → Продажи | https://gastrofood.vn/erp/finance/sales |
| Расходы | Финансы → Расходы | https://gastrofood.vn/erp/finance/expenses |
| Агрегаторы | Финансы → Агрегаторы | https://gastrofood.vn/erp/finance/platforms |
| Прибыльность | Финансы → Прибыльность | https://gastrofood.vn/erp/finance/profitability |
| Входящий НДС | Финансы → Входящий НДС | https://gastrofood.vn/erp/finance/vat/input |
| Исходящий НДС | Финансы → Исходящий НДС | https://gastrofood.vn/erp/finance/vat/output |
| НДС к уплате | Финансы → НДС к уплате | https://gastrofood.vn/erp/finance/vat/settlement |
| Основные средства | Финансы → Основные средства | https://gastrofood.vn/erp/finance/assets |
| Кредиторка | Финансы → Кредиторка | https://gastrofood.vn/erp/finance/payables |
| Дебиторка | Финансы → Дебиторка | https://gastrofood.vn/erp/finance/receivables |
| Accrual P&L | Финансы → P&L (Accrual) | https://gastrofood.vn/erp/finance/pnl/accrual |
| Cash Flow | Финансы → Cash Flow | https://gastrofood.vn/erp/finance/cashflow/management |
| Финансовые периоды | Финансы → Финансовые периоды | https://gastrofood.vn/erp/finance/periods |
| Журнал аудита | Финансы → Журнал аудита | https://gastrofood.vn/erp/finance/audit |
| Кассовая книга | Финансы → Касса | https://gastrofood.vn/erp/finance |

### Screenshots

| File | Content |
|------|---------|
| `docs/screenshots/phase10h/prod-erp-login.png` | Production ERP login at finance overview (auth gate) |

**Note:** Unauthenticated browser session shows admin login (expected). Interior authenticated screens require owner session — **not** claimed as completed user acceptance. No test documents created on production.

---

## 6. Disabled features (still OFF / isolated)

| Feature | Status |
|---------|--------|
| Auto-consume | **OFF** |
| Expense auto-allocate | **OFF** |
| Poster Auto-Sync / live ERP sync | **FORBIDDEN BY OWNER** (permanent; API + SQL applied 2026-11-27) |
| Grab Raw CSV/XLSX | **Partial** — unsupported without real sample |
| Live Payroll Import | **Deferred** |
| Automatic CIT | **Pending** (`accountant_tbd`) |

Incomplete data must remain Partial / Pending / Estimated — not silent zeros; tax calc ≠ official declaration.

---

## 7. Errors / limitations

| Item | Notes |
|------|-------|
| Authenticated UI click-through screenshots | Pending owner login session |
| User acceptance | **Not complete** until owner confirms |
| Grab raw / Poster sync / payroll live / CIT | Disabled or deferred as above |
| Release 4 | Not started |

No critical deploy failures. No destructive DB restore performed.

---

## 8. Rollback (reference)

- **FE:** Redeploy previous Vercel production (`gastrobar-kjyavc7kc…`, ~19h prior).  
- **DB:** Do **not** auto-restore. Owner confirmation required (destroys post-backup writes). Prefer forward fix.

---

## 9. Stop

Phase **10H deployed**. Phase **10I** smoke/routes/login verified.  

**Awaiting final owner user acceptance of Release 3.**
