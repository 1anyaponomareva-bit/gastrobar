# Release 1 & 2 — Deployment Preparation Report

**Date:** 2026-11-25  
**Branch tip:** `erp-inventory` (after this prep commit; base verified `0c6cba4`+)  
**`origin/main`:** `3ad1c1c`  
**Release 3:** not started  
**Production SQL / merge / deploy:** **not executed** — awaiting one final owner OK

---

## 1. Readiness summary

| Gate | Status |
|------|--------|
| Code on `erp-inventory` includes R1 leftovers + full R2 + UX/RU fixes | **Yes** |
| Fast-forward / merge into `main` | **Clean** — main is ancestor; branch **13 commits** ahead; no real merge conflicts |
| Automated tests (finance / phase8 / 8G / chicken) | **Pass** (see §3) |
| Frontend ↔ DB compatibility | R2 FE **requires** R2 SQL first (missing columns/RPCs on prod today) |
| Non-prod Supabase apply of 8B→hardening | **BLOCKED** — Free plan: branching locked («Upgrade to unlock»). See `docs/R12_BLOCKERS_BACKUP_NONPROD.md` |
| Production backup / PITR restore point | **BLOCKED** — Free plan: **no** scheduled backups, **no** PITR. See `docs/R12_BLOCKERS_BACKUP_NONPROD.md` |
| Production FE fingerprint to restore | Documented (pre-R2 bundles; build fingerprint in prior verify) |

**Overall readiness:** **CONDITIONAL** — publish sequence is ready on paper and in CI-style tests; **blocking** until (A) non-prod Supabase migration smoke and (B) confirmed production backup.

---

## 2. Commits to publish (`main` → `erp-inventory`)

```
7ffb798 Phase 8B: purchase documents Input VAT (receipts)
1b8c021 Phase 8C: FIFO lot Input VAT snapshots + acquisition costs
28f2c36 Phase 8D: Input VAT cost adjustment documents
845ce0c Phase 8C verify + 8D backdate guard + 8E production lineage
3a5f6e6 Phase 8F: Recipe costing & financial integration
5cade9c Phase 8G: Release 2 acceptance report + regression fixes
d568e2d Release 2 pre-prod: catalog tax validation, backdated adj default off
346e9e6 docs: finalize R2 pre-prod acceptance report (CONDITIONAL PASS)
0a0cda7 docs: Release 1/2 UI verification audit
3c28279 fix(erp): UX discoverability for R2 Costing Policy, FIFO, processing
03fa20f fix(erp): localize dish channel finance labels for RU/VN
03e9f90 fix(erp): RU label for Contribution Margin on dish card
0c6cba4 docs: verify where R1/R2 live on production FE and DB
(+ deployment-prep / Costing Policy RU label commit if present)
```

`main` already contains R1 Phase 3–7 FE; production FE already serves Phase 6–7. This publish adds **R2 + fixes**.

---

## 3. Test results (this pass)

| Suite | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm run test:finance` | **74/74** |
| `npm run test:phase8` | **13/13** (PGlite) |
| `npm run test:phase8g` | **12/12** (PGlite) |
| `npm run test:phase8g:chicken` | **8/8** (PGlite) |
| Remote Supabase clone integration | **Not run** — blocker §5 |

PGlite is **not** a substitute for non-prod Supabase; it only validates ordered SQL/RPC logic locally.

---

## 4. SQL migrations

### Already on production (verified earlier)

R1: `…251100` tax rates, `…251200` exceptions, `…251300` channels (+ related).  
`…251400` dish vat legacy clear — treat as R1-era; confirm in dashboard if listed.

### **New — apply in one window (Release 2)**

| # | File | Phase |
|---|------|-------|
| 1 | `20261125150000_erp_purchase_input_vat.sql` | 8B |
| 2 | `20261125160000_erp_lots_input_vat_fifo.sql` | 8C |
| 3 | `20261125170000_erp_vat_cost_adjustment.sql` | 8D |
| 4 | `20261125180000_erp_production_cost_lineage.sql` | 8E |
| 5 | `20261125190000_erp_recipe_costing.sql` | 8F |
| 6 | `20261125200000_erp_r2_preprod_hardening.sql` | Hardening |

**Order:** 1→6 only. Do not partial-apply.  
**Effects:** additive schema/RPC; historical lots stay `tax_status_known=false`; **no** auto sale-price change; **no** mass historical COGS rewrite; unallocated VAT adj **not** auto P&L.

Gate script (non-prod only): `npm run erp:r2-nonprod-gate`  
Refuses production ref `ulxmubivimwxevgxxxyu` and requires `ERP_ALLOW_NONPROD_APPLY=1`.

---

## 5. Non-prod Supabase — **BLOCKING**

**Status:** No agent-accessible GASTROFOOD staging/clone. Local `SUPABASE_SERVICE_ROLE_KEY` is empty placeholder. Gate correctly refuses apply without ack + non-prod ref.

### Concrete way to create/use a clone

1. Supabase Dashboard → project `ulxmubivimwxevgxxxyu` → **Database** → create **branch / clone** (or new project + restore latest backup).  
2. Note new project **ref** (must ≠ `ulxmubivimwxevgxxxyu`).  
3. Set locally / in CI:
   - `ERP_SUPABASE_PROJECT_REF=<clone-ref>`
   - `ERP_ALLOW_NONPROD_APPLY=1`
   - DB URL or service role for the **clone only**
4. Apply migrations 1→6 (SQL editor or `erp:r2-nonprod-gate` once wired).  
5. Smoke: receipt with Pending VAT → post → lot cost; VAT adjustment; production batch; settings Costing Policy; dish channels.  
6. Point **Vercel Preview** env of `erp-inventory` at the **clone** (not production) for UI stock tests.

Until this is done, production SQL apply remains **unsafe to recommend as fully verified**.

---

## 6. Backup & rollback (owner actions)

### Before publish — owner confirms

1. Supabase **PITR / backup** restore point timestamp (write it here: `____________`).  
2. Record current production Vercel deployment URL / ID (or redeploy previous from Vercel UI).  
3. Spot-check counts unchanged intent: products, dishes/recipes, receipts, lots, tax rates/exceptions/channels (read-only).

### DB rollback

- Prefer **PITR restore** to pre-migration timestamp.  
- Forward-only SQL — no down-migrations in this package.  
- Vercel FE rollback **does not** undo SQL.

### Frontend rollback

- Redeploy previous production deployment on Vercel.  
- If R2 SQL already applied, rolled-back R1-only FE should still run for core paths; avoid leaving R2-only UI without SQL (or vice versa) longer than the cutover window.

---

## 7. Navigation after publish (RU paths)

| Функция | Путь |
|---------|------|
| Политика расчёта себестоимости | **Служебное** → `/erp/service` → Налоги → поле «Политика расчёта себестоимости» |
| Поставки → входящий НДС | **Склад** → «Поставки (вх. НДС)» → `/erp/stock/receipts` → открыть/создать поставку (поля НДС при `input_vat_enabled`) |
| Остатки / FIFO | **Склад** → «Остатки / FIFO» → `/erp/stock` |
| Корректировки НДС | **Склад** → «Корректировки НДС» → `/erp/stock/vat-adjustments` (также из проведённой поставки) |
| Переработки | **Склад** → «Переработки» → `/erp/menu/processing` (тот же раздел в Меню) |
| Ингредиент → себестоимость | **Меню** → Ингредиенты → карточка `/erp/products/[id]` |
| Техкарта полуфабриката | **Меню** → Полуфабрикаты → `/erp/preps/recipe/[id]` |
| Блюдо → каналы / маржа | **Меню** → Блюда → карточка → «Каналы продаж» (подробный вид по умолчанию) |
| Блюдо → рекомендуемая цена | Там же → раскрыть канал → «Рекомендуемая цена продажи» |

Labels use `T(ru,en,vi)` — RU/EN/VN follow UI language.

---

## 8. Recommended production sequence

**Justify order:** R2 frontend expects new columns/RPCs. Current production schema **lacks** them → **SQL before FE**.

1. **Backup** — confirm PITR timestamp.  
2. **Schema check** — re-confirm R2 objects still absent; R1 present.  
3. **Apply SQL** 8B→hardening (1→6) on production in one window.  
4. **DB smoke** — settings save with `recipe_cost_source`; optional draft receipt (no need to mutate live stock if clone already proved posting). Prefer minimal prod writes.  
5. **Merge** `erp-inventory` → `main` (fast-forward).  
6. **Production deploy** from `main` (Vercel).  
7. **Smoke tests** — login; service costing policy; stock nav items; open Danish Hot Dog channels + recommended price; open VAT adjustments list (empty OK).  
8. **UI acceptance** — checklist §7.

**Do not** change sale prices, mass-recalc history, delete data, or start Release 3.

Alternative (not recommended): deploy FE first → broken R2 screens until SQL. Rejected.

---

## 9. Blocking factors before final OK

1. **Non-prod Supabase clone** not available to agent — owner must provision + apply 1→6 + smoke.  
2. **Production backup/PITR** timestamp not confirmed by owner.  
3. **Preview → clone** for authenticated UI stock tests (SSO + env) not completed.  
4. Final **single owner confirmation** for: production SQL + merge + deployment.

---

## 10. Request

После снятия блокировок §9 (или вашего явного принятия риска без clone — **не рекомендуется**):

**Прошу одно итоговое подтверждение на:**

1. Применение SQL-миграций 8B→hardening на production  
2. Merge `erp-inventory` → `main`  
3. Production frontend deployment  

До этого подтверждения: **не** применяю production SQL, **не** делаю merge, **не** публикую.
