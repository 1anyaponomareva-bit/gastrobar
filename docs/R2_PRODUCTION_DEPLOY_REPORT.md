# Release 2 — Production deploy report

**Owner approval:** 2026-11-25 — Free-plan R2 publish OK  
**Owner acceptance (technical):** 2026-11-25 — deploy report accepted; R2 technical publish **closed**  
**Stable production pin:** `c3e0b15` — see `docs/R2_PRODUCTION_FREEZE.md`  
**Status:** Published — awaiting **user UI verification** (no further R1/R2 changes without need)  
**SpiceSpace / Pro / Release 3:** not used / not started

---

## 1. Pre-publish

| Check | Result |
|-------|--------|
| Fresh prod dump | `C:\Users\Nikita Ponomarev\GASTROBAR-backups\prod-ulxmubivimwxevgxxxyu-2026-11-25T08-27-02-380Z.dump` |
| Dump size / integrity | **1 281 323 bytes**, `pg_restore -l` OK (`list_lines=1250`), meta JSON beside dump |
| Production git before deploy | `origin/main` = **`3ad1c1c`** (Phase 8A docs) |
| Target branch | `origin/erp-inventory` = **`c3e0b15`** (17 commits ahead, fast-forward) |
| Schema vs tested copy | Prod **pre-SQL**: no R2 tables/columns (`erp_vat_cost_adjustments` absent, no `recipe_cost_source`). Baseline counts matched local copy: dishes=1, lots=1, recipes=9 |
| ERP after DB password reset | `https://gastrofood.vn/erp` → **HTTP 200** (app uses API keys, not DB password) |
| Stock docs during migrate | Only `cancelled` documents; no draft/posted in flight — no posting freeze required |
| SQL/RPC/RLS | Applied on Free Supabase; roles `anon`/`authenticated`/`service_role` present; smoke OK |

---

## 2. Production SQL (all six)

| # | Migration | Status |
|---|-----------|--------|
| 1 | `20261125150000_erp_purchase_input_vat.sql` | **OK** |
| 2 | `20261125160000_erp_lots_input_vat_fifo.sql` | **OK** |
| 3 | `20261125170000_erp_vat_cost_adjustment.sql` | **OK** |
| 4 | `20261125180000_erp_production_cost_lineage.sql` | **OK** |
| 5 | `20261125190000_erp_recipe_costing.sql` | **OK** |
| 6 | `20261125200000_erp_r2_preprod_hardening.sql` | **OK** |

Apply log: `GASTROBAR-backups\r2-prod-apply-2026-11-25T08-28-36-220Z.json`  
Versions recorded in `supabase_migrations.schema_migrations`.

### Post-SQL smoke (production)

| Check | Result |
|-------|--------|
| `erp_settings.recipe_cost_source` | **`manual_estimated`** (unchanged policy) |
| `vat_adj_allow_backdated` | **`false`** |
| Tables | `erp_vat_cost_adjustments`, `erp_dish_cost_snapshots`, `erp_document_acquisition_costs`, `erp_production_lot_components` |
| `erp_effective_inventory_cost(100,10,'deductible',…)` | `100` |
| non-deductible | `110` |
| `erp_split_purchase_vat(10,'partial',50)` | `(5,5,0)` |
| `erp_vat_adj_preview('{}')` | guard **ERP_INVALID** / `source_line_id` (expected) |
| Tax catalog | `erp_tax_rate_percent_allowed(7,…)=false`, `(8,'standard')=true` |
| Counts | dishes=1, lots=1 (unchanged) |
| Existing lot | `unit_cost` kept; `effective_inventory_cost` null on old lot (**no historical rewrite** — by design) |
| RLS | `erp_dish_cost_snapshots.relrowsecurity=true`; grants present for anon/authenticated/service_role on VAT adj table |

**No sale prices / recipes / stock qty mass changes. No test stock documents created.**

---

## 3. Frontend deployment

| Item | Value |
|------|--------|
| Merge | Fast-forward `erp-inventory` → `main` (`3ad1c1c..c3e0b15`) |
| Production commit | **`c3e0b15`** (`docs: free-plan backup path — need DB password + Docker` tip; includes Phases 8B–8G + UX) |
| Vercel | Deployment `dpl_7QxdZRSTXXxXSaTEdzEc9dVh1fYh` / `gastrobar-k3rj80ebt-…` — **Ready**, target **production** |
| Clone log | `Branch: main, Commit: c3e0b15` |
| Alias | `https://gastrofood.vn` |
| Bundle check | R2 chunks present (`vat-adjustments/page-…js`, `recipe_cost_source` / `manual_estimated` in JS) |
| Route HTTP | `/erp`, `/erp/service`, `/erp/stock`, `/erp/stock/receipts`, `/erp/stock/vat-adjustments`, `/erp/menu/processing` → **200** |

---

## 4. UI paths (authenticated session available)

Live ERP: **https://gastrofood.vn/erp**

| Function | Path |
|----------|------|
| Политика расчёта себестоимости | **Служебное** → https://gastrofood.vn/erp/service (блок «Налоги» / поле политики) |
| Поставки и входящий НДС | **Склад** → https://gastrofood.vn/erp/stock/receipts |
| Остатки / FIFO | **Склад** → https://gastrofood.vn/erp/stock |
| Корректировки НДС | **Склад** → https://gastrofood.vn/erp/stock/vat-adjustments |
| Переработки | **Склад / Меню** → https://gastrofood.vn/erp/menu/processing |
| Карточка ингредиента | **Меню → Ингредиенты** → https://gastrofood.vn/erp/menu/ingredients → product `/erp/products/[id]` (пример Pickles: `/erp/products/64033345-8058-4185-ac74-8c3e77d93496`) |
| Техкарта полуфабриката | **Меню → Полуфабрикаты** → https://gastrofood.vn/erp/menu/preps → `/erp/preps/recipe/[productId]` (пример: `/erp/preps/recipe/29b73e5b-bb5f-41f0-a822-445e38d52a8f`) |
| Danish Hot Dog — себестоимость / маржа | **Меню → Блюда (recipes)** → https://gastrofood.vn/erp/menu/recipes → https://gastrofood.vn/erp/menu/34a2654c-9dd0-4e22-b9ff-a061c2bd5ce0 |
| Рекомендуемая цена продажи | Same dish card (flags: recommended + margin + cost **seen** in CDP) |

### Screenshots (CDP, logged-in)

Under  
`C:\Users\Nikita Ponomarev\.cursor\projects\c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory\assets\`

- `r2-prod-service-costing.png` / `r2-prod-service-v2.png` — costing policy visible  
- `r2-prod-stock-fifo.png`, `r2-prod-stock-receipts.png`, `r2-prod-vat-adjustments.png`  
- `r2-prod-processing-v2.png`  
- `r2-prod-danish-card.png` — Danish Hot Dog + recommended/margin  
- `r2-prod-recipes-list.png`, `r2-prod-ingredient-pickles.png`, `r2-prod-prep-techcard.png`  
- JSON: `r2-prod-ui-shots.json`, `r2-prod-ui-shots-v2.json`, `r2-prod-danish.json`

---

## 5. Limits respected

- Costing policy remains **`manual_estimated`**
- FIFO logic for stock issues unchanged in intent (8C functions deployed)
- Sale prices not rewritten (`Danish Hot Dog` still `99000`)
- Tech cards / historical cost / stock qty not mass-recalculated
- No test stock docs on prod
- No SpiceSpace, no Supabase Pro, no Release 3

---

## 6. Issues / limitations

1. **Historical lots:** pre-R2 lots keep `unit_cost`; new VAT snapshot columns null until new receipts — intentional.  
2. **`/erp/menu/dishes`:** returns «Блюдо не найдено» (route is list at `/erp/menu/recipes` or dish at `/erp/menu/[id]`). Nav «Блюда» still works via recipes list.  
3. **Docker/WSL:** still not required for this publish (local PG used earlier for dry-run).  
4. Agent did **not** create posting stock documents on production (per constraints).

---

## 7. Rollback note (no auto-restore)

If critical regression: stop FE traffic / revert `main` deploy to pre-`c3e0b15`; DB restore from  
`prod-ulxmubivimwxevgxxxyu-2026-11-25T08-27-02-380Z.dump`  
**only after separate owner confirmation** (destructive).

---

**Technical acceptance recorded.** Awaiting user interface verification. Release 3 not started.  
Freeze rules: `docs/R2_PRODUCTION_FREEZE.md`.
