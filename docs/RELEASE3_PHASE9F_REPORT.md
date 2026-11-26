# Release 3 — Phase 9F Report: Actual COGS & Channel / Location Profitability

**Branch:** `release-3-phase9f`  
**Base:** Phase 9E tip `2f48193`  
**Date:** 2026-11-27  

## Overall status: **CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · auto-consume left **OFF** · Danish Hot Dog recipe not modified · no real historical sales import · no real stock mutation on production · Phase 9G not started.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9f` |
| Base | `2f48193` |
| Backlog | `docs/RELEASE3_BACKLOG.md` |

---

## 2. SQL migrations

| File | Stage | Role |
|------|-------|------|
| `supabase/migrations/20261127130000_erp_r3_sales_bom_cogs.sql` | 9F-A/B | BOM snapshots, modifier maps, pending COGS, COGS columns |
| `supabase/migrations/20261127131000_erp_r3_sales_bom_cogs_rpcs.sql` | 9F-A/B | Explode, snapshot, post_cogs rewrite, refund policy, VAT→COGS adj |
| `supabase/migrations/20261127132000_erp_r3_profitability_rpcs.sql` | 9F-C | Control math, channels/locations/products, completeness, load_state parts |

Local Free-path: `gastrofood_r2_copy`. **Not on production.**

---

## 3. Phase 9F-A — Dish BOM Explosion

### Mechanism

- `erp_sales_bom_explode(dish, qty, modifiers, prep_ids, at)` reuses **`erp_count_explode` / `erp_count_stocked`** (no second recipe engine).
- Stocked semi-finished / finished products **stop** nested raw explosion (chicken→mince→sausage: consume sausage lot, not raw again).
- Explicit `prep_product_ids` on the sale line: consume prep + dish packaging; do not re-explode prep raw BOM.
- Modifiers: `add` / `exclude` / `replace|choose`. Unmapped `external_key` → **`mapping_required`** (no guessing).
- `erp_sales_bom_snapshot` freezes lines on the sales line; future recipe edits do **not** rewrite the snapshot.

### Tables

- `erp_modifier_product_maps`
- `erp_sales_bom_snapshots`
- `erp_sales_bom_snapshot_lines`

### 9F-A test results

Script: `scripts/erp/test-phase9f-bom-cogs.mjs`  
Simple BOM, qty scale, add/exclude, mapping_required, prep+pack, snapshot idempotent + immutable — **PASS**.

---

## 4. Phase 9F-B — Actual COGS Integration

### Sales → FIFO → Actual COGS

1. Post sale (revenue fact kept even if stock missing).  
2. `erp_sales_bom_snapshot` (idempotent).  
3. `erp_sales_post_cogs` (requires `p_auto_consume=true` **and** settings flag; default **OFF**).  
4. Bridge writeoff document + **`erp_consume`** FIFO.  
5. Allocations in `erp_sales_cogs_allocations` with `cogs_kind` food/packaging.  
6. Insufficient stock → `erp_sales_pending_cogs` (missing qty); **no** negative stock / fictional receipts; missing cost **≠ 0**.

### Fields

- Food / Packaging / Total Actual COGS  
- Estimated COGS (menu only; labeled; not Actual)  
- Original Actual / COGS Adjustments / Adjusted Actual  
- COGS status: none|pending|posted|partial|…

### Refunds

- `erp_refund_sales_document(..., p_restore_stock default false)`  
- Default policy: **refund_without_stock_return** / **cancel_before_prep**  
- Physical stock return requires a **manual** document (blocked as auto).

### VAT Cost Adjustments

- `erp_sales_apply_vat_cogs_adjustment` — adjustment layer only; original consume rows unchanged; idempotent per adjustment id.

### 9F-B test results

Pending insufficient, sale stays posted, idempotent posted COGS, Danish Hot Dog food/pack split on **test lots**, Estimated ≠ Actual, VAT adj −500, refund without stock, auto-consume restored OFF — **PASS**.

---

## 5. Phase 9F-C — Channel & Location Profitability

### RPCs

- `erp_profitability_control_math` — fixture §17  
- `erp_profitability_channels` / `_locations` / `_products`  
- `erp_profitability_completeness` — Complete|Partial|Estimated|Requires Reconciliation  
- `erp_profitability_pending_cogs`

### Financial model (implemented)

Net Revenue − Food Actual − Pack Actual = Gross Profit → − Actual commission − Actual advertising = Contribution Margin.  
Grab Net Earnings **not** treated as net profit. Recoverable Input VAT not in opex. Campaign ads **not** auto-allocated to dishes.

### Control fixture

| Metric | Expected | Result |
|--------|----------|--------|
| Total Actual COGS | 28,000 | **PASS** |
| Gross Profit | 72,000 | **PASS** |
| Gross Margin | 72% | **PASS** |
| Contribution Margin | 47,000 / 47% | **PASS** |

### UI (not published)

| Path | Screen |
|------|--------|
| `/erp/finance/profitability` | Overview |
| `/erp/finance/profitability/channels` | Channels |
| `/erp/finance/profitability/locations` | Locations |
| `/erp/finance/profitability/products` | Products / dishes |
| `/erp/finance/profitability/cogs` | Pending COGS |

Nav: **Финансы → Прибыльность**

---

## 6. Danish Hot Dog (test only)

- Recipe **not** modified.  
- BOM explode: 12 lines (food + packaging).  
- Local test lots @ unit_cost 500 → Actual food/pack split (example run: food 1,097.5 · pack 2,004.5 · total 3,102).  
- Estimated menu cost 27,902.06 kept separate — **not** used as Actual.  
- Variance demonstrates Forecast vs Actual on test FIFO, not production truth.

---

## 7. Testing summary

| Area | Result |
|------|--------|
| 9F-A BOM / modifiers / snapshot | PASS |
| 9F-B FIFO COGS / pending / refund / VAT adj | PASS |
| 9F-C control math + reports | PASS |
| Auto-consume restored OFF | PASS |
| R1/R2/9B–9E presence regression | PASS (smoke) |
| Results JSON | `docs/assets/phase9f/r3-phase9f-ab-test-results.json` |

Full matrix §18: covered in Free-path script themes; Poster+Grab double-consume covered by existing 9B source-link uniqueness + COGS idempotent path; parallel race not load-tested.

---

## 8. Screenshots (fixtures)

| File |
|------|
| `docs/assets/phase9f/01-profitability-overview.png` |
| `docs/assets/phase9f/02-profitability-channels.png` |
| `docs/assets/phase9f/03-danish-cogs.png` |
| `docs/assets/phase9f/04-pending-cogs.png` |

---

## 9. Completeness / limitations

1. Auto-consume **not** activated on production — backlog remains Open.  
2. Live Grab raw import still Partial.  
3. Live Poster import still Open.  
4. Campaign/location advertising allocation methodology deferred.  
5. FE not published — fixture screenshots only.  
6. Channel commission/ads currently aggregated by settlement date window (not per-order join until richer match coverage).  
7. Physical stock return path intentionally manual.  
8. Historical auto-allocation of later lots to pending sales — **not** implemented (policy TBD).  
9. Full authenticated UI regression deferred.

---

## 10. Status by sub-phase

| Sub-phase | Status |
|-----------|--------|
| 9F-A Dish BOM Explosion | **PASS** (local Free-path) |
| 9F-B Actual COGS Integration | **PASS** (local; auto-consume OFF default) |
| 9F-C Profitability | **PASS** (RPCs + UI wired; FE unpublished) |
| Phase 9F overall | **CONDITIONAL** |

**CONDITIONAL** because: production auto-consume OFF; Grab/Poster live imports incomplete; FE unpublished; ad allocation policy TBD; commission attach is period-level until richer order matching.

---

Phase 9G not started. Awaiting acceptance.
