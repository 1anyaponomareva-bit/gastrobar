# Release 3 — Phase 9B Report: Sales & Output VAT

**Branch:** `release-3-phase9b`  
**Base:** `origin/main` @ `8f163f7` (Phase 9A design)  
**Date:** 2026-11-26  
**Status:** Implementation complete on branch. **Awaiting owner acceptance.**  
**Constraints honored:** no production SQL, no merge to `main`, no frontend publish, no real historical import, no mass stock consume, no Phase 9C.

---

## 1. Realized tables

| Table | Purpose |
|-------|---------|
| `erp_legal_entities` | Single legal entity now (`GASTROFOOD`); timezone `Asia/Ho_Chi_Minh`; configurable `business_day_cutoff` (default 05:00) |
| `erp_sales_documents` | Sales header: internal/canonical/external IDs, source, channel, location, entity, dates, money, VAT snapshot, COGS status, reconciliation |
| `erp_sales_lines` | Line items: product/dish, qty, discounts, VAT snapshot, modifiers, prep choices, line COGS |
| `erp_sales_source_links` | Poster/Grab/manual source keys + match kind (`exact` / `manual` / `unmatched` / `conflict`) |
| `erp_sales_cogs_allocations` | Link sales line → stock movement / FIFO allocation / Actual COGS |
| `erp_sales_import_batches` | Validate-only import stub batches (Poster/Grab contracts) |

**Settings columns:**

- `erp_settings.default_legal_entity_id`
- `erp_settings.sales_auto_consume_stock` — **default `false`** (production mass consume OFF)

RLS enabled on all new tables; grants limited to `service_role` (same Free-plan pattern as R1/R2).

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127090000_erp_r3_sales_output_vat.sql` | Schema: entities, sales docs/lines/links, COGS allocations, import batches, settings flags, RLS |
| `supabase/migrations/20261127091000_erp_r3_sales_rpcs.sql` | RPCs + `erp_load_state` sales parts |

**Not applied to production.** Validated on local Free-path copy `gastrofood_r2_copy` (PostgreSQL 17).

---

## 3. API and RPC

### RPCs

| Function | Role |
|----------|------|
| `erp_sales_business_date` | Order timestamp → business date using entity timezone + cutoff |
| `erp_sales_make_canonical_key` | `source:account_or_location:external_id` |
| `erp_sales_resolve_output_vat` | Rate resolve + snapshot payload (company default / dish / category exception) |
| `erp_save_sales_document` | Create/update **draft** only; VAT computed; optional source link |
| `erp_post_sales_document` | Post; freeze VAT snapshot; idempotent re-post |
| `erp_cancel_sales_document` | Soft cancel; history preserved |
| `erp_refund_sales_document` | Full / partial refund statuses |
| `erp_sales_link_source` | Exact / manual match; conflict on ambiguous auto-merge |
| `erp_sales_import_stub_validate` | Contract validate only → batch `validated` (not applied) |
| `erp_sales_post_cogs` | Sales → FIFO via existing `erp_consume` bridge; blocked unless flag/`force` |
| `erp_sales_output_vat_register` | Period register rows |
| `erp_load_state` | Extended with `legalEntities`, `salesDocuments`, `salesLines`, `salesSourceLinks`, `salesCogsAllocations` |

### Action route (`app/api/erp/action/route.ts`)

- `saveSalesDocument`
- `postSalesDocument`
- `cancelSalesDocument`
- `refundSalesDocument`
- `linkSalesSource`
- `postSalesCogs`
- `validateSalesImportStub`

Client helpers: `src/lib/erp/sales.ts`  
Types: `src/lib/erp/types.ts`  
Loader: `src/lib/erp/stateLoader.ts`

---

## 4. UI — exact open paths

| Screen | Path |
|--------|------|
| Sales list / create draft | `/erp/finance/sales` |
| Sales document card | `/erp/finance/sales/[id]` |
| Output VAT register | `/erp/finance/vat/output` |

Nav labels in **Финансы**: «Продажи», «Исходящий НДС».

Cashbook reports explicitly labeled **Cash Basis** (not Accrual P&L):

- `/erp/finance/report`
- `/erp/finance/cashflow`
- `/erp/finance/pnl`

**Frontend not published** (Phase 9B constraint). UI code is on the branch only.

### Screenshots

Live production screenshots are **not** available: migrations not on production and FE not published. Local Free-path SQL smoke results are saved at:

`C:\Users\Nikita Ponomarev\GASTROBAR-backups\r3-phase9b-test-results.json`

UI acceptance screenshots should be captured after optional preview deploy / owner OK to apply migrations to a non-prod target.

---

## 5. Deduplication mechanism

1. **`canonical_order_key`** unique among non-deleted, non-cancelled documents.  
2. **`erp_sales_source_links`**: unique `(source_system, account_or_location_key, external_id)`.  
3. Re-import of the same Poster/Grab external id → blocked (no second revenue / VAT / COGS).  
4. Poster ID ≠ Grab ID → **not** auto-merged by amount/time.  
5. Match kinds: `exact_match` | `manual_match` | `unmatched` | `conflict`.  
6. Raw `poster_payload` / `grab_payload` stored separately; gross from one source is **not** overwritten by another on divergence.

Import contracts: `docs/RELEASE3_PHASE9B_IMPORT_CONTRACTS.md`.

---

## 6. Sales → FIFO → Actual COGS

- Reuses Release 2 **`erp_consume`** (writeoff bridge) — **no second stock engine**.  
- Allocations stored in `erp_sales_cogs_allocations`.  
- Default path: `sales_auto_consume_stock = false` → `cogs_status = pending`, reason `auto_consume_disabled`.  
- Idempotent: existing allocations / stock doc prevent double consume.  
- Insufficient stock → sale remains posted; Pending COGS + reason.  
- Prep/semi-finished: consume finished prep product, not raw already consumed in production (existing recipe consume rules).  
- Actual COGS is not silently replaced by Manual Estimated Costing.

**Mass automatic consume on production is not activated.**

---

## 7. Output VAT

- Uses Release 1 tax settings + `erp_vat_exceptions` (dish/category) when present.  
- On save/post: snapshot of rate, source, taxable base, VAT amount, exception id, `rule_ref = erp_sales_resolve_output_vat@9b`.  
- Changing `default_output_vat_rate` after post **does not** rewrite posted documents (verified in tests).  
- Discount/subsidy tax policy remains configurable — not hard-coded as final law.  
- Refunds adjust order status; register includes posted / partially_refunded / refunded.

---

## 8. Test results (local Free path)

Command:

```bash
ERP_TEST_LOCAL=1 node scripts/erp/test-phase9b-sales.mjs --local
```

Target: local PostgreSQL `gastrofood_r2_copy` (pg_dump Free-path copy — not production).

| Test | Result |
|------|--------|
| business_date_after_midnight (02:30 → previous day) | PASS |
| save_draft | PASS |
| post_sale | PASS |
| output_vat_snapshot (108000 → VAT 8000 @ 8%) | PASS |
| repost_idempotent | PASS |
| duplicate_poster_blocked | PASS |
| cogs_pending_default (auto_consume off) | PASS |
| auto_consume_flag_false | PASS |
| posted_vat_frozen after global rate 8→10 | PASS |
| full_refund | PASS |
| import_stub_validated | PASS |
| import_stub_not_applied | PASS |
| grab_oct2026_fixture_math | PASS |

Additional coverage notes:

- Multi-dish / modifiers / prep: schema + save payload support; full integration matrix deferred to Phase 9C acceptance pack.  
- Partial refund RPC supported (`p_full=false`).  
- RLS: new tables follow service_role-only grant pattern of R1/R2.  
- R1/R2 regression: migrations additive; existing costing/FIFO/tax RPCs not rewritten.

---

## 9. Commit

- **Commit:** `1e2c6bf` — `feat(erp): Phase 9B Sales and Output VAT (branch only)`
- **Branch pushed:** `origin/release-3-phase9b`
- **Not merged** to `main`.

---

## 10. Limitations / known gaps

1. Migrations **not** on Supabase production.  
2. Frontend **not** published — Sales / Output VAT UI invisible on live site until separate OK.  
3. Automatic Poster/Grab historical import **not** connected (stubs + contracts only).  
4. `sales_auto_consume_stock` remains **false** — no live FIFO drain from sales.  
5. Unconfirmed accountant rules for funded discounts / platform subsidies stay configurable, not frozen as policy.  
6. October 2026 Grab figures used only as arithmetic fixture.  
7. VAT resolve bugfix during local test: `SELECT INTO` on missing exception nulled `v_rate` — fixed in RPC migration before final smoke.  
8. `gen_random_bytes` avoided (local PG `pgcrypto` quirk); UUID-based defaults used.  
9. UI screenshots pending preview/publish approval.  
10. Full matrix (modifiers + prep double-consume edge cases + RLS role matrix in browser) recommended as acceptance checklist before 9C.

---

## 11. Readiness for Phase 9C

**Ready to start Phase 9C after owner acceptance of 9B**, provided:

- Branch review OK  
- Decision on when to apply migrations (still not production without separate OK)  
- Decision on preview FE publish for UI acceptance  

Phase 9C **not started**.

---

## 12. Stop

Phase 9B development on this branch is complete. Awaiting acceptance.
