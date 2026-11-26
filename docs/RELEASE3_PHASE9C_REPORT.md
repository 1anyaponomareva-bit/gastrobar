# Release 3 — Phase 9C Report: Input VAT Register

**Branch:** `release-3-phase9c`  
**Base:** Phase 9B accepted tip `b5b6f83`  
**Date:** 2026-11-26  
**Overall status: CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · no price/stock/history mutation on production · no real finance import · auto-consume OFF · Phase 9D not started.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9c` |
| Implementation | `d3d6cfc` |
| Backlog | `docs/RELEASE3_BACKLOG.md` (9B unfinished items frozen) |

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127100000_erp_r3_input_vat_register.sql` | Categories, tax invoices + lines + allocations, expense contract docs, status history, settings `input_vat_tax_period_mode`, RLS |
| `supabase/migrations/20261127101000_erp_r3_input_vat_rpcs.sql` | Split helper, unified register RPC, tax invoice / expense RPCs, adj→history trigger, `erp_load_state` 9C parts |

**Not applied to production.** Validated on local Free-path `gastrofood_r2_copy`.

---

## 3. Tables / views / RPC

### Tables

- `erp_input_vat_categories` — ingredients…other_expenses (+ platform commission/ads codes)
- `erp_tax_invoices`, `erp_tax_invoice_lines`, `erp_tax_invoice_allocations`
- `erp_expense_documents` — Phase 9G contract (services / platform fees without stock)
- `erp_input_vat_status_history`

### RPC

- `erp_input_vat_split` — same buckets as R2 `splitPurchaseVat`
- `erp_input_vat_register` — unified register + totals
- `erp_save_tax_invoice` / `erp_save_expense_document` / `erp_post_expense_document` / `erp_set_expense_vat_status`
- Trigger `erp_vat_adj_input_vat_hist` on posted `erp_vat_cost_adjustments`

No second Input VAT calculation engine — purchase amounts come from posted R2 receipt lines; adjustments update source status (R2) and are not double-counted as a second liability.

---

## 4. Integration with Release 2

| R2 source | Register use |
|-----------|--------------|
| Purchase receipt lines + Input VAT fields | Primary goods rows |
| VAT deduction statuses | `pending` / `deductible` / `partial` / `non_deductible` (no new dictionary) |
| VAT Cost Adjustments | Status history + adjustments total; line amounts reflect post-adj state |
| FIFO / lots / lineage | Untouched; adj lot effects remain R2 |
| R1 channel commission/ads forecast | **Excluded**; `from_forecast=true` blocked on expense save |

---

## 5. Double-count protection

1. Register liability = **current** source-line/expense/invoice-line split (after posted adj).  
2. Posted adjustments contribute to **VAT Adjustments** total, not a second full VAT amount.  
3. Tax invoice allocations capped ≤ invoice VAT; duplicate identity (supplier tax + series + number + type) blocked.  
4. Service invoices without receipt allocation appear once; invoices allocated to receipts do not invent a parallel goods VAT row from the invoice alone.

---

## 6. Register structure

Fields implemented in `erp_input_vat_register` JSON rows: legal entity, location, supplier, tax id, source type/id/line, invoice number/series/date, transaction / recognition dates, periods, category, rate, net/vat/gross, deductible / non-deductible / pending, %, status, currency, href.

Currency default **VND**. Timezone via existing business TZ / Ho Chi Minh usage. Tax period mode setting default **`accountant_tbd`**.

---

## 7. Yellow Mustard control calculations

| Case | Expected | Result |
|------|----------|--------|
| Pending | Pending 130,000 / Deductible 0 | PASS |
| Full | Deductible 130,000 / Pending 0 | PASS |
| Partial 50% | Deductible 65,000 / Non-deductible 65,000 | PASS |
| Non-deductible | Deductible 0 / Non-deductible 130,000 | PASS |

Implemented via `erp_input_vat_split` + expense-register path (test data, no production stock change).

---

## 8. Testing matrix (local Free path)

Script: `scripts/erp/test-phase9c-input-vat.mjs`  
Artifact: `GASTROBAR-backups/r3-phase9c-test-results.json`

| # | Scenario | Result |
|---|----------|--------|
| 1–6 | Pending/full/partial/non-deductible + register | PASS |
| 7 | Status change history | PASS |
| 8 | Invoice dedupe | PASS |
| 9 | Multi-rate service invoice | PASS |
| 10 | One invoice → multi receipt allocations | PASS |
| 11 | Allocation over-cap blocked | PASS |
| 12 | Distinct tx / invoice / recognition dates | PASS |
| 13 | Period filter | PASS |
| 14 | Forecast Grab blocked / excluded from register | PASS |
| 15 | RLS | PASS |
| 16 | R1/R2/9B object smoke + auto-consume OFF | PASS |

**Deferred / partial vs full checklist:** live posted receipt Yellow Mustard with real lot consumption adj after partial consume — covered by R2 adj engine + history trigger; not re-posted against production inventory in 9C. Full browser RLS role matrix deferred.

---

## 9. UI paths

| Screen | Path |
|--------|------|
| Input VAT register | `/erp/finance/vat/input` |
| Output VAT (9B) | `/erp/finance/vat/output` |
| VAT adjustments (R2) | `/erp/stock/vat-adjustments` |
| Receipts (R2) | `/erp/stock/receipts` → `/erp/documents/[id]` |

**FE not published.** Fixture screenshots (test data):

- `docs/assets/phase9c/01-input-vat-register.png`
- `docs/assets/phase9c/02-pending-list.png`

---

## 10. Not implemented (honest)

- Live Grab commission/ads tax invoices (Phase **9D**)  
- Full operating expense module (Phase **9G**) — contract only  
- Final VAT payable settlement (Phase **9E**)  
- Production migration apply / FE publish / live UI acceptance  
- Automatic “invoice present ⇒ deductible” (explicitly **not** done)  
- Dish BOM / Actual COGS / auto-consume (backlog — before 9F / R3 final)

---

## 11. Questions for accountant

1. Tax period basis: invoice date vs recognition date vs transaction date? (setting `input_vat_tax_period_mode`, now `accountant_tbd`)  
2. Deduction timing / carry-forward rules for Pending VAT?  
3. Grab service VAT rate and deductibility conditions when invoices arrive?  
4. Multi-invoice / credit-note netting presentation for period return?  
5. Fixed-asset Input VAT special treatment?

---

## 12. Final status

# **CONDITIONAL**

Ready for owner acceptance. Phase 9D not started.
