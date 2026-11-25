# Release 1 & 2 — UI Verification Audit

**Date:** 2026-11-25  
**Mode:** Audit only — no code changes, no SQL, no merge, no publish.  
**Branch analysed:** `erp-inventory` @ `346e9e6`  
**`origin/main` tip:** `3ad1c1c` (Release 1 + Phase 8A docs; **no** Phase 8B–hardening)

---

## 1. Environment

| Environment | URL | Frontend commit (best estimate) | Database | Auth barrier |
|-------------|-----|----------------------------------|----------|--------------|
| **Production** | `https://gastrofood.vn/erp` | ≈ `origin/main` (`3ad1c1c` lineage). Next buildId `NWJraPQ44Z-xaUKuZ6ZAj`. Bundle has R1 `DishChannelFinance` / `financialCalculator`; **no** R2 strings (`recipe_cost_source`, `Корректировки НДС`, `Manual Estimated Cost`). Stock nav matches **main** (no VAT-adjustments item). | Production Supabase `ulxmubivimwxevgxxxyu`. R1 Phase 3–5 SQL applied per prior reports. **R2 migrations 8B→hardening not applied.** | Admin login required. Agent session **not** available → deep UI walkthrough **blocked**. |
| **Vercel Preview (`erp-inventory`)** | `https://gastrobar-git-erp-inventory-annas-projects-183a79d7.vercel.app` | Expected latest branch tip `346e9e6` (auto Preview). | **Not verified.** Must not be assumed non-prod; write tests against prod DB are forbidden. | **Vercel Deployment Protection SSO** → 302 to `vercel.com/sso-api`. Agent cannot open ERP pages. |
| **Working branch only** | local / Preview after SSO | `346e9e6` | Needs non-prod clone for safe R2 SQL | — |

**Exact production git SHA** could not be read from Vercel API (no token in this environment). Conclusion is from **live JS string presence** + route behaviour vs `origin/main` / `origin/erp-inventory`.

### Browser check (this pass)

| Target | Result |
|--------|--------|
| `https://gastrofood.vn/erp/service` | Login wall «Вход для администратора» — evidence `docs/assets/r2-ui-login-required.png` / attempt `ui-audit-prod-login.png` |
| `https://gastrofood.vn/erp/menu/ingredients` | Same login wall |
| `https://gastrofood.vn/stock/receipts` (without `/erp`) | **404** — host-move short paths not active for this route |
| `https://gastrofood.vn/erp/stock/vat-adjustments` | HTTP 200 but matched as `/erp/stock/[kind]` → generic `StockDocsPage`, **not** R2 journal |
| Preview `/erp` | SSO redirect — **Unable To Verify** authenticated UI |

**Blocking factor:** no admin credentials / no live ERP session for the agent. Production and Preview authenticated screenshots of the nine features were **not** captured.

---

## 2. Label mismatch (why search fails)

| User looked for | Actual UI label / location (when present) |
|-----------------|-------------------------------------------|
| Служебное → **Costing Policy** | On R2 only: field **«Источник себестоимости техкарт»** / *Tech-card cost source* inside `/erp/service` Taxes card — **not** a separate submenu named Costing Policy |
| Склад → **Поставки и входящий НДС** | Nav item is only **«Поставки»** → `/erp/stock/receipts`. Input VAT fields live **inside** the receipt document, gated by `input_vat_enabled` |
| Склад → **Партии и FIFO** | **No dedicated nav item** on main or `erp-inventory`. FIFO is consumption logic; balances show average of remaining lots |
| Склад → **Корректировки НДС** | R2-only nav label; path `/erp/stock/vat-adjustments` |
| Склад → **Переработки** | Under **Меню**, not Склад: **«Переработки»** → `/erp/menu/processing` (and batches `/erp/preps/batches`) |

---

## 3. Per-feature findings

### 1) Costing Policy

| Question | Answer |
|----------|--------|
| Implemented in code? | **Yes** on `erp-inventory` (`ServicePages` + `recipeCosting.ts`) |
| UI component? | `<select data-testid="recipe-cost-source">` — Manual Estimated / Last Purchase / Weighted Average / Estimated FIFO |
| Wired to ERP shell? | Yes — `/erp/service` |
| Navigation? | **No separate** «Costing Policy» item — only field inside Taxes settings |
| Path | `Служебное` → `/erp/service` → block Taxes → «Источник себестоимости техкарт» |
| SQL? | Yes — `20261125190000` (+ hardening uses settings) |
| Frontend publish? | Yes — not on production bundles |
| Feature flag? | None |
| Status | **Implemented But Not Deployed** (+ naming: not a top-level menu) |

### 2) Поставки и входящий НДС

| Question | Answer |
|----------|--------|
| Deliveries list | **Working** on production — `/erp/stock/receipts` |
| Full R2 purchase VAT (net/gross, deduction status, tax invoice, effective inventory cost, post-post adj link) | **Implemented** on `erp-inventory` `DocumentEditor` |
| On production / main | **Partial** — `prices_include_vat`, line `vat_rate` when `input_vat_enabled`; **not** full 8B surface (`vat_deduction_status` journal, tax invoice, effective cost block, adj from posted receipt) |
| SQL for full behaviour | 8B+ (`…15150000`…) — **not** on production |
| Status | List: **Working**. Full Input VAT UX: **Requires SQL Migration** + **Implemented But Not Deployed** |

### 3) Партии и FIFO

| Question | Answer |
|----------|--------|
| FIFO consume | Backend **Working** (long-standing) |
| Dedicated «Партии и FIFO» screen / nav | **Missing Navigation** (and no R2-only lots journal page) |
| What exists | `/erp/stock` balances — display avg of remaining lots; movement report; lot fields on documents after post |
| R2 lot tax snapshots / adjusted unit cost UI | Needs 8C SQL + richer UI — mostly **Partially Implemented** |
| Status | **Missing Navigation** for a lots journal; FIFO engine **Working**; R2 lot tax UI **Partially Implemented** / not deployed |

### 4) Корректировки НДС

| Question | Answer |
|----------|--------|
| Code | `VatAdjustmentsPage`, `VatAdjustmentEditor`, routes under `/erp/stock/vat-adjustments` |
| Nav on `erp-inventory` | Yes — stockNav item |
| On production | Nav **absent**; URL falls into `[kind]` stub |
| Create from posted receipt | R2 `DocumentEditor` links to `/erp/stock/vat-adjustments/new?...` |
| SQL | 8D (+ hardening) |
| Status | **Implemented But Not Deployed** + **Requires SQL Migration** |

### 5) Переработки

| Question | Answer |
|----------|--------|
| UI | **Working** on production |
| Path | `Меню` → `Переработки` → `/erp/menu/processing` |
| Batches | `/erp/preps/batches`, `/erp/preps/batch/[id]` |
| R2 lineage / VAT propagate on production docs | SQL 8E **not** on prod — production cost lineage extras **Requires SQL Migration**; basic manufacture UI **Working** |
| Status | Core UI **Working** (under Menu, not Stock). R2 cost lineage **Requires SQL Migration** |

### 6) Карточка ингредиента — расширенная себестоимость

| Question | Answer |
|----------|--------|
| Path | `Меню` → `Ингредиенты` → `/erp/menu/ingredients` → card `/erp/products/[id]` |
| Pre-R2 fields on prod | `est_unit_cost`, weights — **Partially** present |
| R2 `buildIngredientCostCard` block (purchase net/gross, yield, recipe unit cost, VAT hints) | On `erp-inventory` only |
| Status | **Partially Implemented** on production; full card **Implemented But Not Deployed** |

### 7) Технологическая карта полуфабриката

| Question | Answer |
|----------|--------|
| UI | **Working** on production |
| Path | `Меню` → `Полуфабрикаты` → `/erp/menu/preps` → `/erp/preps/recipe/[id]` |
| Status | **Working** (find under Menu / Semi-finished, not Stock) |

### 8) Danish Hot Dog — финансовая калькуляция

| Question | Answer |
|----------|--------|
| Code (R1 Phase 7) | `DishChannelFinancePanel` on dish card — **present in production JS** (`6146-*.js` contains «Recommended Selling Price», `financialCalculator`) |
| Path | `Меню` → `Блюда` → open **Danish Hot Dog** → `/erp/menu/[id]` → section **«Каналы продаж»** |
| How to see detail | Enable **Detailed View**; expand channel row for commission VAT, ads scenarios, VAT simulation, CM, Recommended Selling Price |
| Compact default | `MenuPage` passes `defaultDetailed={false}` — easy to miss deep fields |
| Authenticated live verify | **Unable To Verify** (login wall) |
| Status | **Working** in production frontend code path (R1); live data confirm **Unable To Verify** without login. R2 recipe-cost policy overlay on same card — **Implemented But Not Deployed** |

### 9) Recommended Selling Price

| Question | Answer |
|----------|--------|
| Location | Inside expanded channel detail on dish card (same panel as §8) — heading «Recommended Selling Price» |
| Production bundle | **Present** |
| Separate menu item | **No** |
| Status | **Working** (buried in dish → channel expand); live screenshot **Unable To Verify** |

---

## 4. Summary table

| Функция | Реализована в коде | Доступна в Preview | Доступна на Production | Путь в интерфейсе | Причина недоступности | Что необходимо сделать | Статус |
|---------|--------------------|--------------------|-------------------------|-------------------|----------------------|------------------------|--------|
| 1. Costing Policy | Yes (`erp-inventory`) | Unable To Verify (SSO) | No | `/erp/service` → Taxes → «Источник себестоимости техкарт» | Not on prod FE; no menu named «Costing Policy»; needs R2 SQL/settings | Publish R2 FE after non-prod SQL; optionally rename/nav hint | **Implemented But Not Deployed** |
| 2. Поставки + входящий НДС (полный 8B) | Yes (branch) | Unable To Verify | Partial (basic VAT flags only) | `/erp/stock/receipts` → document | R2 FE+SQL not on prod | Apply 8B+ on clone then prod; deploy branch FE | **Requires SQL Migration** / **Implemented But Not Deployed** |
| 3. Партии и FIFO (журнал) | Engine yes; dedicated UI no | Unable To Verify | No dedicated page | Balances `/erp/stock` only | **Missing Navigation** / no lots journal | Design lots UI (or document that FIFO is implicit); deploy R2 lot tax fields with 8C | **Missing Navigation** / **Partially Implemented** |
| 4. Корректировки НДС | Yes (branch) | Unable To Verify | No (URL = generic kind) | `/erp/stock/vat-adjustments` | Not on prod FE; SQL 8D absent | Deploy R2 FE + apply 8D | **Implemented But Not Deployed** + **Requires SQL Migration** |
| 5. Переработки | Yes | Unable To Verify | Yes (base UI) | `/erp/menu/processing` | Looking under Склад | Use Menu → Переработки; apply 8E for lineage | **Working** (R2 lineage: **Requires SQL Migration**) |
| 6. Ингредиент — расширенная себестоимость | Full on branch | Unable To Verify | Partial | `/erp/products/[id]` via ingredients | R2 card block not deployed | Deploy R2 FE (+ SQL if needed for VAT fields) | **Partially Implemented** |
| 7. Техкарта полуфабриката | Yes | Unable To Verify | Yes | `/erp/menu/preps` → `/erp/preps/recipe/[id]` | Looking under Stock | Use Menu → Полуфабрикаты | **Working** |
| 8. Danish Hot Dog finance | Yes (R1 on main/prod JS) | Unable To Verify | Yes in bundle; live UI unverified | `/erp/menu/[danish-id]` → Каналы продаж | Easy to miss (compact view); auth blocked for agent | Owner open dish, Detailed View, expand Grab/Direct | **Working** / live **Unable To Verify** |
| 9. Recommended Selling Price | Yes (R1) | Unable To Verify | Yes in bundle; live unverified | Same as §8, expand channel | Not a top-level page | Same as §8 | **Working** / live **Unable To Verify** |

---

## 5. Unified fix & publish plan (await owner OK)

Do **not** execute until confirmed.

### A. Immediate clarification (no deploy)

1. Owner login on **production** and verify §7–§9 paths (Menu → Preps / Processing / Danish Hot Dog → Sales channels → Detailed View → expand row).  
2. Owner login on **Preview** (Vercel SSO + ERP admin) — expect R2 nav «Корректировки НДС» and Costing field on `/erp/service`.  
3. Confirm Preview env Supabase project ≠ production before any stock writes.

### B. Non-prod readiness

1. Provision non-prod Supabase clone.  
2. Apply migrations 8B→hardening via `npm run erp:r2-nonprod-gate`.  
3. Point Preview env at clone.  
4. Authenticated UI checklist for all nine items + screenshots.

### C. UX gaps to fix in a follow-up change set (after OK)

1. Rename or add nav hint: «Costing Policy» / «Политика себестоимости» → service field.  
2. Optional stock nav note that Переработки live under Menu (or cross-link).  
3. Decide whether a **Lots / FIFO journal** page is required for acceptance (currently missing).  
4. Consider `defaultDetailed={true}` on Danish Hot Dog / dish finance so Recommended Price is visible.  
5. Ensure dedicated `/erp/stock/vat-adjustments` route wins over `[kind]` (already true on branch; prod lacks page).

### D. Production publish (only after B + owner OK)

1. Backup / PITR.  
2. Apply SQL 8B→hardening.  
3. Deploy `erp-inventory` frontend (or merge to `main` then deploy — merge needs separate OK).  
4. Smoke: service costing select; receipt VAT; VAT adj journal; dish finance; no sale price auto-change.  
5. Rollback plan: FE previous Vercel deployment ≠ SQL rollback (restore DB separately).

### E. Explicitly out of scope until OK

- Merge to `main`  
- Production SQL  
- Production publish  
- Release 3  
- Mass historical cost rewrite  
- Changing live stock / tech cards / sale prices  

---

## 6. Bottom line

You could not find most R2 items because **Release 2 frontend and SQL are not on production**. Production matches **Release 1 / `main`**: deliveries, preps, processing, and dish channel finance exist, but **not** under the names/places used in R2 reports.

Several R1 features **are** on production but nested (dish → Sales channels → expand). Several R2 features exist only on `erp-inventory`. One requested area (**Партии и FIFO** as a stock section) was **never given a dedicated navigation entry**.

**Awaiting confirmation** before any fix implementation or publish.
