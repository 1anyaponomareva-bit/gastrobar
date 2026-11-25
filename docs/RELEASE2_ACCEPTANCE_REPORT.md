# Release 2 — Acceptance Report (Phase 8G + Pre-Production Verification)

**Branch:** `erp-inventory`  
**Latest:** Pre-prod hardening migration `20261125200000_erp_r2_preprod_hardening.sql`  
**Date:** 2026-11-25  
**Production:** **not** deployed. SQL **not** applied. Merge to `main` **not** done.  
**Release 3 / Phase 9:** **not** started.

Owner preliminary approval of Phase 8B–8G technical reports: **received**.  
This document adds final pre-production verification items requested before publish.

---

## 0. Final pre-production verification (owner brief)

### 0.1 Costing Policy — **approved & implemented**

| Policy | Status |
|--------|--------|
| Default Recipe Cost Source = `manual_estimated` | Default in DB + Settings UI |
| Actual inventory consumption = FIFO (`erp_consume`) | Unchanged |
| Weighted Average / Last Purchase / Estimated FIFO | Optional forecast sources only |
| Sale prices never auto-changed | Confirmed |

### 0.2 Non-production Supabase

| Item | Status |
|------|--------|
| Production project `ulxmubivimwxevgxxxyu` | **Blocked** for test apply |
| Agent-accessible GASTROFOOD staging clone | **Not provisioned** in this environment (no SERVICE_ROLE / DB URL for a non-prod GASTROFOOD project) |
| PGlite full ordered apply of 8B→hardening | **Pass** (local non-prod substitute) |
| Gate script | `npm run erp:r2-nonprod-gate` → `scripts/erp/apply-r2-migrations-nonprod.mjs` |

**Owner action required:** create/link a Supabase **clone** of production schema (Release 1), set `ERP_SUPABASE_PROJECT_REF` + `ERP_ALLOW_NONPROD_APPLY=1`, apply migrations 8B→hardening in order, then point a Vercel Preview env at that clone (not production) for UI stock tests.

### 0.3 Hardening delivered in this pass

| Topic | Change |
|-------|--------|
| Tax rate validation | `erp_tax_rate_percent_allowed` uses **active `erp_tax_rates` catalog + effective dates** (not hardcoded-only 0/5/8/10). Exempt / Not Subject via `tax_treatment`. |
| Backdated VAT adj | `vat_adj_allow_backdated` default **false**. Checkbox alone insufficient. When enabled: confirm + **reason_note** + audit. Period close = Release 3. |
| Unallocated adj UI | Journal warning + badge; text states **not** auto P&L/COGS; no arbitrary edit of amounts. |
| Chicken chain | `npm run test:phase8g:chicken` — Raw→Mince→Cooked→2-Pack→Dish + transfer + VAT adj on consumed lot |

### 0.4 Release 1 Output VAT — **re-confirmed**

`dishChannelFinance.test.ts`: legacy `dish.vat_rate` does not become an individual exception when global moves; modern channels use only `financialCalculator.ts`.

### 0.5 Danish Hot Dog

Fixture finance matrix + R1 vs R2 explanation: `docs/assets/r2-danish-hotdog-comparison.md` + `r2-phase8g-acceptance.json`.  
Live component Δ table requires clone dump or owner-authorized read after SQL apply — **not** force-fit to 27 902.06.

### 0.6 Preview / UI

- Login screenshot: `docs/assets/r2-ui-login-required.png`  
- Preview alias still behind Vercel SSO / ERP admin auth — **not** bypassed.  
- Preview must not run write tests against production DB.

### 0.7 Remaining blockers before production deploy

1. Owner provisions non-prod Supabase clone + applies migrations via gate.  
2. Authenticated UI acceptance on Preview wired to that clone.  
3. Backup / PITR restore point on production.  
4. Explicit OK for production SQL + frontend publish + merge.

---

## 1. Executive status

| Gate | Status |
|------|--------|
| Phases 8A–8F implemented on `erp-inventory` | **Yes** |
| Pre-prod hardening (tax catalog + backdated default deny + unalloc UI) | **Yes** |
| Critical unit + PGlite SQL/RPC controls | **Pass** |
| Chicken multilevel production chain (PGlite) | **Pass** (8 checks) |
| Remote Supabase clone integration | **Pending owner** (credentials / project) |
| Authenticated UI screenshots of R2 screens | **Blocked** — admin login + non-prod Preview |
| Production SQL apply | **Awaiting owner OK** |
| Merge `erp-inventory` → `main` | **Awaiting owner OK** |
| **Technical readiness for controlled deploy** | **CONDITIONAL PASS** — code+PGlite green; remote Supabase clone + UI sign-off still required |

Release 2 is **technically ready for a controlled production window** only after:

1. Non-prod Supabase clone apply + smoke.  
2. Owner UI walkthrough on Preview→clone.  
3. Full Supabase backup + restore point.  
4. Migrations 8B→hardening on production in one window, then matching frontend.

---

## 2. Phase 8A–8F completion matrix

| Phase | Status | Commits | SQL migration | Tests (beyond TS unit) | Remaining limits |
|-------|--------|---------|---------------|------------------------|------------------|
| **8A** Audit | Done (docs only) | `3ad1c1c` | — | Architecture audit doc | N/A |
| **8B** Purchase Input VAT | Done | `7ffb798` | `20261125150000_erp_purchase_input_vat.sql` | `purchaseVat` + PGlite receipts | Draft invoice optional; no auto-deduction without status |
| **8C** Inventory FIFO + lot tax | Done | `1b8c021`, verified in `845ce0c` | `20261125160000_erp_lots_input_vat_fifo.sql` | PGlite lot costs, FIFO, acquisition | Historical lots → `tax_status_known=false` |
| **8D** VAT cost adjustment | Done | `28f2c36`, hardened `845ce0c` | `20261125170000_erp_vat_cost_adjustment.sql` | PGlite adj + backdate confirm | Unallocated never auto P&L |
| **8E** Production lineage | Done | `845ce0c` | `20261125180000_erp_production_cost_lineage.sql` | Chicken SF + VAT prop PGlite | Concurrent edge cases documented |
| **8F** Recipe costing | Done | `3a5f6e6` | `20261125190000_erp_recipe_costing.sql` | Controls + snapshots PGlite | Forecast ≠ posted sale COGS |
| **8G** Acceptance | This report | harness `test-phase8g-acceptance.ts` | — | 12 SQL/RPC acceptance checks | UI auth owner-gated |

### Key files by phase (summary)

- **8B:** `purchaseVat.ts`, `DocumentEditor.tsx`, purchase migration  
- **8C:** lot FIFO migration, acquisition UI, `purchaseVat` extensions  
- **8D:** `vatCostAdjustment.ts`, `VatAdjustment*.tsx`, adj migration  
- **8E:** production lineage migration, propagate RPC, `test-phase8-vat.ts`  
- **8F:** `recipeCosting.ts`, Menu/Product/Service UI, dish cost snapshots  
- **Docs:** `docs/PHASE8A_*.md` … `PHASE8F_*.md`, `RELEASE2_MIGRATION_PLAN.md`

---

## 3. Architecture — stock & tax (Release 2)

```
Purchase document (net/gross, VAT rate, deduction status, optional tax invoice)
        │
        ▼
erp_post → Effective Inventory Cost
  = Net + NonDeductible VAT + Pending VAT + Allocated acquisition
  (Pending NOT double-counted with NonDeductible)
        │
        ▼
erp_lots (unit_cost, tax snapshots, tax_status_known)
        │
        ├─ erp_consume (FIFO by received_at) → movements (ACTUAL COGS)
        │
        ├─ production → output lot + erp_production_lot_components (8E)
        │         └─ VAT adj can propagate along lineage
        │
        └─ quotes / est_unit_cost → costing.ts (FORECAST)
                  │
                  ▼
         dish Recipe Cost → dishChannelFinance → financialCalculator
                  │
                  ├─ Contribution Margin
                  └─ Recommended Selling Price (display only)
```

**Hard rules preserved**

- Actual write-off = FIFO (`erp_consume`), never replaced by WAC.  
- Missing cost = null / incomplete, never silent 0.  
- Forecast dish snapshots do not rewrite historical sale COGS.  
- Sale prices are never auto-changed.  
- Historical unknown tax stays Legacy / Unknown (no auto deduction).

---

## 4. Migration sequence (Release 2)

Apply **only** after backup, on non-prod first, then production in one window:

1. `20261125150000_erp_purchase_input_vat.sql` — 8B  
2. `20261125160000_erp_lots_input_vat_fifo.sql` — 8C  
3. `20261125170000_erp_vat_cost_adjustment.sql` — 8D  
4. `20261125180000_erp_production_cost_lineage.sql` — 8E  
5. `20261125190000_erp_recipe_costing.sql` — 8F  
6. `20261125200000_erp_r2_preprod_hardening.sql` — pre-prod hardening  

Gate: `npm run erp:r2-nonprod-gate` (refuses production ref `ulxmubivimwxevgxxxyu`).

**Prerequisites already on production (Release 1):** tax rates, VAT exceptions I/O, sales channel finance (`…251100`–`…251300` as applicable).

**Compatibility:** Branch is ahead of `main` (8A docs commit is on both lineage; 8B–8F only on `erp-inventory`). Frontend with R2 UI **must not** go live against a DB missing 8B–8F RPCs/columns.

**PGlite verification:** full ordered apply via `createTestDb()` / `ERP_MIGRATIONS` — FK, constraints, RPC execute grants to `service_role`, revoke from `anon`/`authenticated`, RLS on new tables, indexes present. See §8.

---

## 5. Control financial calculations (verified)

Sources: pure helpers + **posted SQL/RPC documents** on PGlite (`docs/assets/r2-phase8g-acceptance.json`).

### Yellow Mustard — 20 kg @ 81 250 net / 8%

| Mode | Per kg (lot `unit_cost`) | 15 g recipe |
|------|--------------------------|-------------|
| Deductible | **81 250** | **1 218.75** |
| Pending / Non-deductible | **87 750** | **1 316.25** |
| Partial 50% | **84 500** | **1 267.50** |
| Doc totals | Net 1 625 000 / Gross 1 755 000 (pending) | |

### Pickled Cucumbers — jar

| Metric | Result |
|--------|--------|
| Loss % | **51.4563%** |
| Recipe consumption | **0.1 jar** (25 g / 250 g) |
| Deductible recipe cost | **2 400** |
| Pending recipe cost | **2 592** |
| Double loss | Not applied |

### Pork Hot Dog Sausage — 50 g

| Mode | Per piece |
|------|-----------|
| Deductible | **7 650** |
| Pending | **8 262** |

### FIFO multiple lots

| Step | Result |
|------|--------|
| Lot A 10 × 80 000 + Lot B 10 × 90 000 | Posted |
| Consume 12 kg write-off | **total_cost = 980 000** (10×80k + 2×90k) |
| Remaining | **8 kg**, value **720 000** |
| WAC substitution | **Rejected** (980k ≠ 12×85k) |

### VAT adjustment

Pending → Deductible on unused lot: qty unchanged; `unit_cost` 87 750 → 81 250; unallocated = 0.

### Production (8E, prior suite)

Chicken pending receipt → mince production → VAT adj propagates to SF output lot; no double VAT; unallocated 0 on full remaining chain.

---

## 6. Danish Hot Dog

### Cost baseline (Release 1 production snapshot)

From `docs/RELEASE1_ACCEPTANCE_REPORT.md` (live est × qty at that time):

| | Amount (₫) |
|--|------------|
| Food Cost | 24 716.36 (control fixture uses 24 750) |
| Packaging | 3 185.70 (fixture 3 152) |
| **Total** | **27 902.06** |

**Phase 8G does not force-fit** live dish cost to 27 902.06 after R2 goes live. After Input VAT-aware receipts/adjustments, ingredient `est_unit_cost` / quotes may change; each delta should be listed at cutover from production quotes.

### Forecast finance matrix (legacy food 24 750 + pack 3 152)

Computed via `financialCalculator` / `danishHotDogInput` (JSON: `docs/assets/r2-phase8g-acceptance.json`):

| Price | Channel | CM % Pending | CM % Full VAT sim |
|------:|---------|-------------:|------------------:|
| 99 000 | Direct | 69.56 | 69.56 |
| 99 000 | Grab Organic | 48.36 | 49.93 |
| 99 000 | Grab Standard | 40.80 | 42.93 |
| 99 000 | Grab Full | 39.72 | 41.93 |
| 109 000 | Direct | 72.35 | 72.35 |
| 109 000 | Grab Organic | 51.15 | 52.72 |
| 109 000 | Grab Standard | 43.59 | 45.72 |
| 109 000 | Grab Full | **42.51** | **44.72** |
| 119 000 | Direct | 74.68 | 74.68 |
| 119 000 | Grab Organic | 53.47 | 55.04 |
| 119 000 | Grab Standard | 45.91 | 48.04 |
| 119 000 | Grab Full | 44.83 | 47.04 |

Matches Release 1 control scenarios (±0.05 pp where previously asserted).

**Sale prices were not modified** during acceptance.

---

## 7. Costing policy recommendation (GASTROFOOD)

| Policy | Maps to | Use |
|--------|---------|-----|
| **Manual Estimated Cost** (`manual_estimated`) | `reference` / `est_unit_cost` | **Recommended default** — stable menu forecast; updated from last confirmed receipt without flickering remaining-lot WAC |
| Last Purchase | `last_lot` | Spot-check newest posted lot |
| Weighted Average / Estimated FIFO | `fifo_remaining` | Analytics / “what remaining stock would imply” — **not** actual consume |

**Recommendation:** keep global default **`manual_estimated`**. Do **not** change production `recipe_cost_source` without owner confirmation. Actual warehouse accounting remains **FIFO**.

---

## 8. Regression & SQL/RPC results

| Suite | Passed | Failed | Notes |
|-------|-------:|-------:|-------|
| `npm run test:finance` | **74** | 0 | Calculator, dish finance, purchase VAT, adj, recipe costing, composition |
| `npx tsx scripts/erp/test-phase8-vat.ts` | **13** | 0 | 8C–8F PGlite |
| `npx tsx scripts/erp/test-phase8g-acceptance.ts` | **12** | 0 | §9 controls + FIFO + tax rates + finance matrix |
| `npx tsx scripts/erp/test-erp.ts` | **129** | 0 | Full stock / production / menu / finance SQL regression |
| `npm run typecheck` | pass | — | |
| `npm run build` | pass | — | recorded in 8G run |

**Total automated checks counted above: 74 + 13 + 12 + 129 = 228** (plus typecheck/build).

**Artifacts**

- `docs/assets/r2-phase8g-acceptance.json`  
- `docs/assets/r2-ui-login-required.png`  

### Defects found and fixed during 8G

1. **`erp_save_settings` (8F) omitted legacy VAT % validation** — invalid rate `7` was accepted. Restored `erp_tax_rate_is_legacy_percent` checks in `20261125190000_erp_recipe_costing.sql`.  
2. **Regression isolation** — Phase 4 left `input_vat_enabled=true`; later movement-value tests expected net-only costs. Restored `input_vat_enabled=false` after Phase 4; movement report test opts out explicitly.  
3. **Legacy “recoverable VAT excluded” test** — updated for R2: default receipt status **Pending** includes VAT in `unit_cost`; explicit **Deductible** excludes it.  

No remaining critical failures in the suites above.

---

## 9. UI / screenshots

| Screen | Status |
|--------|--------|
| Production login `https://gastrofood.vn/erp/service` | Captured — **admin login required** (`docs/assets/r2-ui-login-required.png`) |
| Vercel Preview alias | `https://gastrobar-git-erp-inventory-annas-projects-183a79d7.vercel.app` — currently **Vercel SSO** gate for visitor |
| Authenticated: Taxes, Channels, Receipts, Lots, VAT adj, Preps, Danish Hot Dog, Cost History, Channel finance | **Needs owner login** on Preview or staging after SQL apply |

**Owner action:** log in on Preview (or local + PGlite / staging Supabase with R2 migrations) and confirm UI checklist §12 of the Phase 8G brief. Agent will not bypass authentication.

---

## 10. Security & access

| Control | Finding |
|---------|---------|
| RPC execute | New R2 functions: **revoke** `public/anon/authenticated`, **grant** `service_role` |
| RLS | Enabled on new tables (`erp_vat_cost_adjustments*`, `erp_dish_cost_snapshots`, …); client has no direct table grants |
| API path | `/api/erp/action` → server `rpc(...)` with actor; validation in SQL (`erp_raise`) |
| Tax / adj / settings | Only via authenticated admin session + server actions; no anonymous write |
| Audit | `erp_audit` / card snapshots / adjustment history tables |
| Sale price | UI + save dish never auto-writes recommended price as live price |

**Note:** Full penetration of every RPC as `anon` is covered by pattern from Release 1 `test-erp` privilege checks; R2 follows the same grant model. Staging re-check after apply recommended.

---

## 11. Historical data guarantees

Confirmed by design + tests:

- Existing posted receipts/lots **not** rewritten by migrations (additive columns; legacy → `tax_status_known=false`).  
- FIFO allocations / movements immutable (triggers).  
- Posted production docs unchanged; lineage table is additive.  
- Forecast `erp_dish_cost_snapshots` ≠ sale COGS.  
- Closed P&L / tax registers not auto-posted from unallocated adj.  
- **No mass historical recalculation** in R2.

---

## 12. Unresolved accounting questions (owner / accountant)

1. Company default when tax invoice arrives late: keep **Pending** until confirmed (current).  
2. Treatment of **unallocated** VAT adj amounts in management P&L (manual only — system does not auto-post).  
3. Whether to backfill any high-value legacy lots via documented adjustments after go-live.  
4. Final sign-off on **manual_estimated** as global forecast source.

---

## 13. Risks & legacy

| Risk | Mitigation |
|------|------------|
| Deploy frontend before SQL | Blocked by this plan; deploy DB first or atomically |
| Partial migration | Forbidden — apply 8B→8F together |
| Confusing forecast vs FIFO actual | Docs + UI hints; policy labels |
| Preview SSO / auth | Owner screenshot session |
| Shopee channel incomplete finance | Pre-existing R1; not R2 scope |
| `costing.channelResult` legacy helper | Still in codebase; dish card uses modern calculator |

---

## 14. Production deployment plan

### Pre-flight

1. Owner OK on this report.  
2. Supabase **full backup** (logical dump / PITR restore point — **not** row counts).  
3. Clone DB: apply migrations 1→5; run `test-phase8-vat` + `test-phase8g-acceptance` against clone if possible.  
4. Freeze optional: pause new receipts/production during cutover window (minutes).  
5. Confirm Vercel env still points to intended project; feature flags none required.

### Cutover order

1. Apply SQL 8B→8F on production.  
2. Smoke: open receipt draft with Pending VAT; post; check lot `unit_cost`; open VAT adj UI; open dish Recipe Cost.  
3. Deploy `erp-inventory` frontend (or merge then deploy — **only after owner merge OK**).  
4. Verify Danish Hot Dog costs/CM; list any ingredient deltas vs 27 902.06.  
5. Confirm sale prices unchanged.

### Rollback

1. Frontend: redeploy previous Vercel production deployment.  
2. Database: restore from pre-cutover backup / PITR (preferred). Forward-only SQL is not designed for partial down-migrate.  
3. Do **not** leave R2 UI on R1 schema.

### Post-checks

- Post one test receipt on staging clone (not prod) with Pending → Deductible adj.  
- Spot-check FIFO write-off.  
- Audit log entries for settings / adj.  
- No automatic price changes.

### Commits to publish (when approved)

```
3ad1c1c Phase 8A audit
7ffb798 Phase 8B
1b8c021 Phase 8C
28f2c36 Phase 8D
845ce0c Phase 8C verify + 8D harden + 8E
3a5f6e6 Phase 8F
(+ Phase 8G report / harness commit)
```

---

## 15. Acceptance criteria checklist

| Criterion | Met? |
|-----------|------|
| All mandatory phases complete | **Yes** |
| Critical tests passed | **Yes** (unit + PGlite) |
| SQL verified non-prod (PGlite ordered) | **Yes** |
| FIFO correct | **Yes** (980k / 720k control) |
| Production cost lineage preserved | **Yes** (8E suite) |
| No double VAT | **Yes** |
| Historical data not damaged | **Yes** (additive) |
| Adjustments traceable | **Yes** |
| Calculator gets coherent food/pack cost | **Yes** |
| Sale prices not auto-changed | **Yes** |
| Safe deploy + rollback plan | **Yes** (§14) |
| Authenticated UI sign-off | **Pending owner** |

---

## 16. Final decision request

Release 2 Acceptance Report is ready for owner review.

**Awaiting your decision on:**

1. Authenticated UI walkthrough / screenshots.  
2. Non-prod Supabase clone apply (recommended before prod).  
3. Production SQL window + frontend publish.  
4. Merge `erp-inventory` → `main`.  

**Until then:** no merge, no production SQL, no production publish, no Release 3.
