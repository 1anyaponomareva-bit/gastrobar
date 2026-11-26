# Release 3 — Phase 9E Report: VAT Settlement

**Branch:** `release-3-phase9e`  
**Base:** Phase 9D tip `a6c89cc`  
**Date:** 2026-11-27  

## Overall status: **CONDITIONAL**

Constraints honored: no production SQL · no merge to `main` · FE not published · no real tax documents/payments · no historical tax recalculation · auto-consume OFF · prices/recipes/stock untouched · Phase 9F not started · Live Grab Import remains Partial until real GrabMerchant sample.

---

## 1. Commit / branch

| Item | Value |
|------|--------|
| Branch | `release-3-phase9e` |
| Base commit | `a6c89cc` |
| Backlog | `docs/RELEASE3_BACKLOG.md` updated |

---

## 2. SQL migrations

| File | Role |
|------|------|
| `supabase/migrations/20261127120000_erp_r3_vat_settlement.sql` | Settings `vat_settlement_period_kind`, settlements/lines, carryforwards, payments/allocations, period corrections, RLS |
| `supabase/migrations/20261127121000_erp_r3_vat_settlement_rpcs.sql` | Compute/collect/save/approve, CF opening, payment save/post, corrections, export, `erp_load_state` 9E parts |

Local Free-path validated on `gastrofood_r2_copy`. **Not on production.**

---

## 3. Tables & RPC

### Tables

- `erp_vat_settlements`
- `erp_vat_settlement_lines`
- `erp_vat_carryforwards`
- `erp_vat_payments`
- `erp_vat_payment_allocations`
- `erp_vat_period_corrections`

Linked to: Legal Entity, tax period fields, Output/Input registers (via collect), R2 VAT cost adjustments (info-only; not double-counted), cash `erp_finance_transactions` (optional link on payment).

**No parallel tax registers** — settlement reads 9B/9C/9D + R2 sources.

### RPC

| Function | Role |
|----------|------|
| `erp_vat_settlement_compute` | Pure formula (Cases A–C) |
| `erp_vat_settlement_collect` | Aggregate Output + Input register + CF + warnings |
| `erp_vat_settlement_save` | Draft/calculated settlement (+ manual amounts for tests) |
| `erp_vat_settlement_approve` | Snapshot freeze + CF apply / generate |
| `erp_vat_carryforward_opening` | Pre-ERP opening — requires `confirmed: true` |
| `erp_vat_payment_save` / `erp_vat_payment_post` | Payments + allocations; idempotent `payment_key` |
| `erp_vat_period_correction_save` | Prior-period correction document (does not rewrite approved) |
| `erp_vat_settlement_export` | Export payload + non-official disclaimer |

---

## 4. Integration with 9B / 9C / 9D / R2

| Source | Use in settlement |
|--------|-------------------|
| 9B `erp_sales_documents.output_vat_amount` | Output VAT (posted / refunded statuses) |
| 9C `erp_input_vat_register` | Deductible / Pending / Non-Deductible totals |
| 9D platform expenses / Grab pending | Completeness warning `grab_vat_unverified` |
| 9D unmatched settlement lines | Warning `unreconciled_platform_sales` |
| R2 `erp_vat_cost_adjustments` | **Not** added again into payable (already in register statuses); abs sum kept as info |

Pending VAT and Non-Deductible VAT are **excluded** from deductible base.  
R1 forecast VAT is **not** read by collect/compute.

---

## 5. Settlement formula

```
Output VAT
− Eligible Deductible Input VAT
± Applicable VAT Adjustments   (0 when already in registers)
− Eligible VAT Carryforward
= VAT Settlement Result
```

- Result ≥ 0 → **VAT Payable**  
- Result < 0 → **Potential VAT Carryforward** (not auto refund / cash)  
- Payment status separate: `unpaid | partially_paid | paid | overpaid`

Default company cadence: `vat_settlement_period_kind = accountant_tbd` (not auto-forced monthly/quarterly).

Timezone recognition UI: Asia/Ho_Chi_Minh · Currency: VND.

---

## 6. Carryforward

- Opening CF only via confirmed document (`erp_vat_carryforward_opening`)  
- Approve applies FIFO remaining CF; exhausted status prevents reuse  
- Negative settlement generates approved potential CF for next period  
- Insufficient CF blocks approve (`insufficient_carryforward`)  
- Entity-scoped CF matching (`is not distinct from` legal entity)

---

## 7. Payments

- Linked optionally to `finance_transaction_id` (unique — no duplicate cash link)  
- `payment_key` idempotent (re-save returns same id)  
- Re-post is no-op (no double liability reduction)  
- Partial / full allocation supported  
- VAT payment is **not** treated as P&L operating expense in this phase

---

## 8. Completeness warnings (before final)

Emitted by collect / stored on settlement:

- `pending_input_vat`
- `unconfirmed_tax_invoices`
- `grab_vat_unverified`
- `unreconciled_platform_sales`
- `tax_period_rules_unconfirmed`

If warnings exist → `is_final = false`; approve requires `p_force` or data fix. Incomplete calc is **not** marked as final tax result.

Approved settlements are backend-locked (`ERP_DOCUMENT_LOCKED`). Full financial period lock = Phase **9H**.

---

## 9. UI paths (not published)

| Path | Screen |
|------|--------|
| `/erp/finance/vat/settlement` | Tax overview dashboard |
| `/erp/finance/vat/settlement/periods` | Period calculations |
| `/erp/finance/vat/settlement/carryforward` | Carryforward |
| `/erp/finance/vat/settlement/payments` | VAT payments |
| `/erp/finance/vat/settlement/corrections` | Period corrections |

Nav: **Финансы → НДС к уплате**

Component: `src/components/erp/FinanceVatSettlementPage.tsx`  
CSV export via `exportVatSettlement` (disclaimer: not official VN declaration).

---

## 10. Control cases (test data only)

| Case | Expected | Result |
|------|----------|--------|
| A Payable | 12,000,000 VND | **PASS** |
| B Carryforward | Payable 0; Potential CF 5,000,000 | **PASS** |
| C Partial 50% | Deductible 65,000; Non-ded 65,000; Payable 935,000 | **PASS** |
| D Partial pay | Liability 12M − pay 8M → Outstanding 4,000,000 | **PASS** |

---

## 11. Testing

Script: `scripts/erp/test-phase9e-vat-settlement.mjs`  
Results: `docs/assets/phase9e/r3-phase9e-test-results.json` (**55 checks PASS**)

Covered themes (spec §15): formula output/input, pending/nonded exclusion, partial deduction, payable/CF, CF reuse protection, adjustments double-count avoidance, approve lock, partial/full pay, payment idempotency, monthly/quarterly, incomplete data, Grab warning path (collect), no forecast keys, RLS presence, 9B/9C/9D/R2 regression presence, load_state parts.

---

## 12. Screenshots (test fixtures — FE not published)

| File | Content |
|------|---------|
| `docs/assets/phase9e/01-vat-settlement-overview.png` | Dashboard KPIs (Case A/D) |
| `docs/assets/phase9e/02-vat-settlement-periods.png` | Period list |
| `docs/assets/phase9e/03-vat-carryforward.png` | CF history |
| `docs/assets/phase9e/04-vat-payments.png` | Payments |

HTML sources alongside PNGs. Generated by `scripts/erp/shot-phase9e-ui.mjs`.

---

## 13. Remaining limitations

1. Live GrabMerchant raw import still **Partial** (does not block 9E).  
2. Company tax period cadence remains `accountant_tbd` until accountant confirms.  
3. Tax recognition mode for Input VAT still `accountant_tbd`.  
4. Full financial period lock deferred to **Phase 9H**.  
5. Official Vietnam declaration form/format not implemented (internal calc only).  
6. Payments UI lists + API; richer cashbook create UX can deepen later.  
7. FE not published — fixture screenshots only.  
8. Collect uses sales `business_date` for Output VAT window until recognition rule confirmed.  
9. Period corrections stored as documents; automatic recognition-period application rule not hardcoded.

---

## 14. Questions for accountant

1. Confirm company VAT filing cadence: **monthly** vs **quarterly**.  
2. Input VAT recognition date rule (invoice / recognition / transaction / business).  
3. Deduction timing and carryforward eligibility rules.  
4. Prior-period correction recognition period policy.  
5. VAT refund conditions (ERP currently only creates potential CF — never auto cash refund).  
6. Tax calendar / payment due date rules.  
7. Official declaration export format (when ready).  
8. Opening pre-ERP VAT carryforward amount to confirm as opening document.

---

## 15. Status rationale → **CONDITIONAL**

**PASS factors:** unified settlement engine; Cases A–D; CF + payments + approve snapshot lock; UI routes; Free-path SQL tests; no parallel registers; Grab Partial preserved; 9F not started.

**CONDITIONAL factors:** accountant tax rules still TBD; Grab live format open; FE not published; period hard-lock = 9H; official declaration not claimed.

**FAIL:** none for Phase 9E scope.

---

Phase 9F not started. Awaiting acceptance.
