# Release 1 Acceptance Report

**Branch:** `erp-inventory` @ `eee8cc4`  
**Date:** 2026-11-25  
**Scope:** Phase 3–7 (Tax → Exceptions → Channel Finance → Calculator → Dish Margin UI)  
**Not done:** merge to `main`, production frontend deploy, Phase 8 / Release 2

---

## 1. Phase 3–7 integration

| Phase | Status on production DB | Status in `erp-inventory` frontend |
|---|---|---|
| 3 Tax Settings & VAT Catalog | Applied (`erp_tax_rates` = 6 active) | On `main` + branch |
| 4 Input/Output VAT Exceptions | Applied (`erp_vat_exceptions` = 5, all **input**) | On `main` + branch |
| 5 Sales Channel Finance | Applied (Direct / Grab / Shopee + history) | On `main` + branch |
| 6 Unified Financial Calculator | N/A (TS only) | On branch |
| 7 Dish Margin UI | N/A (TS/UI only) | On branch |

**Data path verified:**  
`erp_settings` + `erp_tax_rates` + `erp_vat_exceptions` + `erp_sales_channels`  
→ `resolveDishOutputVatRate` / `computeDishChannelFinance`  
→ `financialCalculator.calculateChannelFinance`  
→ `DishChannelFinancePanel` / `dishEconomics` / menu list.

---

## 2. Output VAT priority (final logic)

**Effective for dish × channel finance:**

1. **Individual Output VAT Exception** (`erp_vat_exceptions`, scope `dish`)
2. **Explicit `dish.vat_rate`** — only if set **and ≠ global default** (auto-seeded 8% is ignored)
3. **Category Output VAT Exception**
4. **Sales Channel `output_vat_rate`**
5. **Global `default_output_vat_rate`**

**Dish Field role:** legacy column kept for UI editing. Auto-baseline equal to global does **not** override category/channel. An explicit non-global value acts as the individual override (same priority tier as a dish exception, used only when no dish exception row exists). Prefer creating a dish-scoped exception for long-term single source of truth.

**Purchase/input VAT never drives dish output VAT.**

---

## 3. Real dishes in production

**Active dishes in production:** only **Danish Hot Dog** (12 lines, sale price **99 000 ₫**).  
Cheese & Bacon, Burgers, Combos, Breakfast Box, Fries, Drinks, Modifiers — **not present** (or not unarchived) in production `erp_dishes`.

### Production cost (est_unit_cost × qty)

| Component | Amount (₫) |
|---|---|
| Food Cost | 24 716.36 |
| Packaging Cost | 3 185.70 |
| Total Product Cost | **27 902.06** |

(Matches control fixture ±0.1 ₫.)

### Finance table — Danish Hot Dog @ 99 000 ₫

| Channel / scenario | Mode | Net Revenue | Comm Gross | Ads Gross | CM (₫) | CM % | Rec. price (target) |
|---|---|---|---|---|---|---|---|
| Direct / Current | modern | 91 666.67 | 0 | 0 | 63 764.61 | **69.56%** | 101 000 |
| Grab Standard / Pending | modern* | 91 666.67 | 19 438.06 | 6 930 | 37 396.56 | **40.80%** | 115 000 |
| Grab Organic / Pending | modern* | 91 666.67 | 19 438.06 | 0 | 44 326.56 | **48.36%** | 90 000 |
| Grab Full / Pending | modern* | 91 666.67 | 19 438.06 | 7 920 | 36 406.56 | **39.72%** | 120 000 |
| Grab Full / Full VAT Sim | modern* | 91 666.67 | 19 438.06 | 7 920 | 38 433.08 | **41.93%** | 111 000 |
| Shopee | **incomplete** | — | — | — | — | — | — |

\*Grab `finance_preliminary = true`.  
Prices / tech cards were **not modified** during testing.  
JSON: `assets/r1-dish-finance-table.json`

Control §14 at 109 000 ₫ still passes unit tests (44.72% / 42.51%).

---

## 4. Legacy calculator audit

| Location | Uses | Risk |
|---|---|---|
| `costing.channelResult` | Legacy commission_pct math | Kept for helpers / `test-erp` |
| `menu.dishCost().channels` | Still builds `channelResult[]` | **Not rendered** on Menu dish card (Phase 7 panel) |
| `menuFields.dishEconomics` | Margin/profit from **financialCalculator** | OK |
| `MenuFoodcostPage` | `eco.margin` = Contribution Margin % | OK |
| `MenuRecipesPage` | Markup = legacy cost markup; Profit = price−cost | Poster-style, **not** platform CM |
| `test-erp.ts` | Explicit `channelResult` assertions | Regression only |

**Conclusions:**
- Modern configured channels: **single formula source** = `financialCalculator.ts`.
- Legacy Rate is **not** mixed with new commission+ads.
- Recommended price uses **only** `recommendSellingPrice`.
- No finance/P&L reports consume `channelResult`.

---

## 5. Recommended Selling Price checks

- Round-up 1 000 / 5 000 / 10 000 — implemented; unit tests cover 1 000.
- After rounding, actual margin recalculated (Direct target → 101 000 ≈ 70.16%; Grab Standard → 115 000 ≈ 45.03%).
- Unreachable ≥100% → warning (tested).
- Incomplete channel → no recommended price (Shopee).
- Apply requires **two-step confirm**; scenarios do not auto-write prices.
- Apply writes only `channel_prices[channelId]` in the dish form (not other dishes / not global channel settings).

---

## 6. Automated regression

| Check | Result |
|---|---|
| `npm run test:finance` | **29/29 pass** |
| `npm run test:erp` | **129/129 pass** |
| `npx tsc --noEmit` | **pass** |
| `npm run build` | **pass** |

### Untouched domains (spot-check on production)

| Area | Observation |
|---|---|
| Lots / FIFO | 1 lot, qty 0 — unchanged by Release 1 frontend |
| Documents | 1 doc, 0 posted |
| P&L / finance SQL | Not modified in branch |
| Tax settings | Present; FK tax rate ids set |
| Channel settings | Direct / Grab / Shopee as Phase 5 |
| Tech cards | Danish Hot Dog 12 lines unchanged |

---

## 7. Screenshots & Preview

### Vercel Preview (requires admin login — do not bypass)

- Stable alias: https://gastrobar-git-erp-inventory-annas-projects-183a79d7.vercel.app  
- Latest deploy: https://gastrobar-7kijy4t0m-annas-projects-183a79d7.vercel.app  

**Admin authorization is required** for `/erp/*` (login gate). No credentials were used/bypassed by the agent.

### Captured evidence

| Asset | Content |
|---|---|
| `r1-ui-login-required.png` | gastrofood.vn ERP login (auth required) |
| `r1-data-tax-rates.png` | Phase 3 catalog (Table Editor) |
| `r1-data-vat-exceptions.png` | Phase 4 exceptions |
| `r1-data-channels.png` | Phase 5 channels |
| `r1-data-dishes.png` | Danish Hot Dog |
| `r1-data-settings-vat.png` | Settings VAT flags |
| `phase7-*.png` | Calculator-backed UI mockups (pre-auth) |

**Pending from Nikita (logged-in session):** Service→Taxes, Exceptions, Direct/Grab editors, Menu list, Danish Compact/Detailed, ads/VAT/recommend panels, desktop+tablet.

---

## 8. Production deployment plan (NOT executed)

### Commits on `erp-inventory` not in `main`

1. `7e1b89a` Phase 6 calculator  
2. `24875b2` Phase 7 dish UI  
3. `25c043f` docs note  
4. `eee8cc4` VAT priority fix  

(`merge-tree` reports clean merge into current `main`.)

### DB migrations for this deploy

**None.** Phase 3–5 SQL already on production. Phase 6–7 are frontend-only and compatible with current schema (`commission_rate`, history, tax tables present).

### Compatibility

- Frontend expects Phase 5 columns → **present on prod**.  
- Shipping Phase 7 UI without Phase 5 would break → already satisfied.  
- Do not merge until UI accepted on Preview.

### Rollback

1. Redeploy previous `main` production deployment on Vercel.  
2. No DB rollback required for Phase 6–7.  
3. Phase 5 columns are additive; leave in place.

### Post-deploy checks

1. Login → Service Taxes / Exceptions / Channels.  
2. Open Danish Hot Dog → Direct + Grab CM vs acceptance table.  
3. Grab Organic/Standard/Full + VAT Simulation.  
4. Recommend + confirm does not auto-save until Save dish.  
5. Spot-check stock/receipts/P&L unchanged.  
6. `npm run test:finance` / `test:erp` on tagged commit.

---

## 9. Risks & remaining Legacy

1. **Only one active dish** in production — category matrix incomplete until more cards exist.  
2. **Grab Preliminary** — contract rates not confirmed.  
3. **Shopee Incomplete** — no commission/ads rates.  
4. **Authenticated UI screenshots** still need owner login on Preview.  
5. **Legacy leftovers:** `channelResult` API, Recipes list markup/profit columns, editable `dish.vat_rate` (auto-8 ignored).  
6. Control price 109 000 vs live 99 000 — different CM%; both consistent with calculator.

---

## 10. Readiness

| Item | Ready? |
|---|---|
| Technical Phase 3–7 | Yes |
| Automated tests / build | Yes |
| Prod DB schema | Yes (no new SQL) |
| Authenticated UI sign-off | **Blocked on owner Preview review** |
| Merge / production deploy | **Awaiting Nikita confirmation** |

**Phase 8 / Release 2:** not started.
