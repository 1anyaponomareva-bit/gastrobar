# Phase 8B — Purchase Documents & Input VAT

Status: **implemented in repo** (`erp-inventory`). SQL **not** applied to production until separate OK.

## Scope

Modernize **Склад → Поставки** (`DocumentEditor` receipts). No separate purchasing system.

## Delivered

| Area | Detail |
|------|--------|
| Migration | `supabase/migrations/20261125150000_erp_purchase_input_vat.sql` |
| Helpers | `src/lib/erp/purchaseVat.ts` + tests |
| Types | Receipt header + line Input VAT fields; supplier `tax_code` |
| UI | Receipt tax invoice header; price excl/incl VAT; line VAT rate (catalog), deduction status, %; Net/VAT/Gross/Effective preview |
| Posting | `erp_post_document` lot `unit_cost` = **effective inventory cost** (Pending/Non-Deductible include VAT) |
| Save | Persists header/line fields; default line status `pending` |
| Suppliers | Tax code column on Suppliers list (`erp_save_ref`) |

## Rules locked in 8A/8B

1. Missing VAT invoice **does not** block physical receipt posting; verification may be `missing`.
2. Missing invoice ≠ deductible.
3. Default deduction status: **Pending** (VAT stays in inventory cost until confirmed).
4. Effective inventory cost = Net + Non-Deductible VAT.
5. Input VAT rate priority: line/invoice → product exception → category → global.
6. Historical lots grandfathered (not rewritten).

## Not in this phase

- Phase 8D–G (VAT adjustment docs, reports, etc.) — see `PHASE8C_INVENTORY_COST_FIFO.md` for lot snapshots
- Production SQL apply

## Verify locally

```bash
npm run test:finance
# optional: ERP_LOCAL_DB=pglite npm run test:erp  (after clean local db)
```
