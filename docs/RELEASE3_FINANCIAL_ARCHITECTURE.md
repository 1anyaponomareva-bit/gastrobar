# Release 3 — Phase 9A: Financial & Tax Accounting Architecture

**Status:** Design only — awaiting owner / accountant approval  
**Base:** Production pin `c3e0b15` (+ later RU UX label commits; R1/R2 product logic unchanged)  
**Live ERP:** https://gastrofood.vn/erp  
**Date:** 2026-11-26  

**Constraints for this phase (honoured):** no code changes, no production SQL, no merge for R3 features, no financial documents created, no SpiceSpace, stay on Supabase Free. Phase **9B+** starts only after explicit owner OK.

---

## 0. Executive summary

GASTROFOOD ERP already has:

- Strong **inventory + FIFO + production + Input VAT (R2)** foundations.
- Strong **forecast** channel / dish finance (**R1** `financialCalculator`).
- A **Poster-style cashbook** Finance module (accounts, transactions, shifts, payroll, simple P&L / Cash flow).

It does **not** yet have a unified **accrual financial system** that connects:

**actual sales → FIFO COGS → platform settlements → expense ledger → VAT registers → period close.**

Release 3 must **extend** existing tables/RPCs, not invent parallel costing, VAT, or FIFO engines.

---

## 1. Goals (restated)

Enable factual answers for:

| Question | Layer |
|----------|--------|
| Company revenue (net) | P&L / Sales |
| Actual COGS of sold goods | Sales ↔ FIFO |
| Gross profit / Contribution margin | P&L / Channel |
| Aggregator commission & ads (actual) | Platform settlements |
| Operating expenses | Expense docs |
| Operating / net profit | P&L |
| Tax liabilities | VAT Accounting |
| Cash movement | Cash Flow |
| Location / channel profitability | Analytics dims |

Three **independent** books (must not be mixed):

1. **Profit & Loss** — accrual per accounting policy  
2. **Cash Flow** — money in/out  
3. **VAT Accounting** — output / deductible input / adjustments / settlement  

Hard rules already proven in R1/R2 and carried forward:

- Purchase of raw materials ≠ monthly COGS.  
- Grab payout ≠ restaurant net revenue.  
- Recoverable VAT ≠ income/expense.  
- Forecast dish cost ≠ posted sale COGS.  
- Pending Input VAT ≠ automatically deductible.

---

## 2. Preserve Release 1 & 2 (do not fork)

| Keep | Source |
|------|--------|
| Tax rates catalog + history | `erp_tax_rates`, `erp_tax_rate_history` |
| Input / Output VAT exceptions | `erp_vat_exceptions` (+ history) |
| Sales Channel Finance + history | `erp_sales_channels`, `erp_sales_channel_finance_history` |
| Financial Calculator (forecast) | `src/lib/erp/financialCalculator.ts` |
| Costing policy default `manual_estimated` | `erp_settings.recipe_cost_source` |
| FIFO consume | `erp_consume` / lots / movements |
| Purchase Input VAT + lot snapshots | R2 migrations `…15150000`–`…160000` |
| VAT Cost Adjustments + lineage | `…170000`–`…180000` |
| Recipe costing / dish snapshots | `…190000` (forecast only) |
| Hardening | `…200000` |

**Do not** create a second FIFO, second VAT splitter, or second CM formula for “actual” reports — reuse R1 calculator **shape** for forecast; feed **actual** amounts into the same semantic fields where possible.

---

## 3. Audit — current Finance module

### 3.1 UI routes (production)

| Route | Purpose | Maturity |
|-------|---------|----------|
| `/erp/finance` | Transactions (income / expense / transfer) | **Implemented** (cashbook) |
| `/erp/finance/shifts` | Cash shifts | **Implemented** |
| `/erp/finance/accounts` | Cash / bank / card accounts | **Implemented** |
| `/erp/finance/categories` | Categories + `pnl_block` | **Implemented** (thin taxonomy) |
| `/erp/finance/salary` | Payroll slips | **Partial** (simple payslip → optional cash tx) |
| `/erp/finance/report` | Monthly income/expense by category | **Partial** (cashbook, not true P&L) |
| `/erp/finance/cashflow` | Money movement by tx date | **Partial** (account CF, not IAS 7 O/I/F) |
| `/erp/finance/pnl` | Blocked P&L from categories | **Partial** (from cashbook categories, not sales/COGS) |

Nav: `src/components/erp/financeNav.tsx`.

### 3.2 Core tables (migration `20261108120000_erp_finance.sql`)

| Table | Role |
|-------|------|
| `erp_finance_accounts` | Cash / bank / card; opening balance; optional `location_id`; system roles drawer/acquiring/safe |
| `erp_finance_categories` | Income/expense flags; `pnl_block` ∈ revenue/cogs/opex/other_*/tax/none |
| `erp_finance_transactions` | amount, account, optional to_account, category, `occurred_at` (cash), `deal_at` (accrual-ish), source/auto_kind |
| `erp_finance_shifts` | POS cash shift open/close |
| `erp_finance_employees` | Staff rates |
| `erp_finance_payroll` | Period payslip; optional link to transaction |

**Missing vs R3 needs:** legal entity, cost/profit center, VAT on expense lines, payment status separate from cash date, platform settlement objects, sales documents, financial period lock, audit reopen.

### 3.3 Client report engines (`src/lib/erp/finance.ts`)

| Function | Basis | Gap |
|----------|--------|-----|
| `buildMonthlyReport` | Transactions by **deal_at** | Not sales/VAT/COGS |
| `buildPnl` | Categories’ `pnl_block` × income/expense txs | **Not** Net Revenue − Actual COGS; purchases tagged `cogs` inflate “COGS” |
| `buildCashflow` | Balances by **occurred_at**; transfers excluded from P&L-like lines | No operating/investing/financing split |

Already good: **deal date vs cash date** separation exists in data model — must be hardened in R3 policy, not replaced.

### 3.4 Forecast finance (R1) — not the actual ledger

| Asset | Role |
|-------|------|
| `financialCalculator.ts` | Gross → net revenue, CM, recommended price; **forecast** rates |
| `dishChannelFinance.ts` / UI | Per-channel scenarios on dish card |
| Channel % commission / ads | **Preliminary** settings — must **not** overwrite Grab actuals when import exists |

### 3.5 Inventory / tax (R2) — factual stock & purchase VAT

| Asset | Role for R3 |
|-------|-------------|
| `erp_documents` / lines | receipt, transfer, writeoff, count, production — **no `sale` doc_type yet** |
| `erp_lots` + Input VAT columns | Inventory cost basis |
| `erp_movements` | FIFO consume / produce — **candidate Actual COGS source** when linked to sales |
| `erp_vat_cost_adjustments*` | Purchase VAT corrections; unallocated ≠ auto P&L |
| `erp_production_lot_components` | Lineage for adj propagation |
| `erp_document_acquisition_costs` | Extra acquisition costs on receipts |

### 3.6 Sales storage today

| Source | What exists | Gap |
|--------|-------------|-----|
| ERP DB | Dish sale prices / channel prices | **No** posted sales order / ticket store for P&L |
| Poster POS libs | Menu/order client for **poster-test** / public ordering | **Not** wired as ERP sales journal |
| GrabMerchant | **None** in repo | Import + reconcile required |
| Cash shifts | `sales_cash` / `sales_card` totals | Cash proxy only — not line-level sales + VAT + COGS |

### 3.7 Supplier payments

| Exists | Gap |
|--------|-----|
| Receipts with supplier; optional finance tx `source=receipt` | No AP aging, no invoice register separate from stock receipt, no partial pay schedule |

### 3.8 Payroll / bank / cash

| Exists | Gap |
|--------|-----|
| Employees + payroll → optional cash tx | No employer SI, staff meals, statutory; no bank import parser (source enum allows `bank_import` but no implementation) |

### 3.9 Audit matrix (implemented / partial / missing)

| Capability | State |
|------------|--------|
| Cash accounts & transfers | **Done** |
| Manual income/expense | **Done** |
| Cash shifts | **Done** |
| Simple payroll | **Partial** |
| Cashbook P&L / CF | **Partial** (wrong grain for company P&L) |
| Forecast CM / VAT on dish | **Done** (R1) |
| Purchase Input VAT + adj | **Done** (R2) |
| FIFO actual consume | **Done** (stock) |
| Sales documents + Output VAT register | **Missing** |
| Actual COGS per sale | **Missing** (movements exist, no sales link) |
| Grab/Poster import + dedupe | **Missing** |
| Platform settlement vs payout | **Missing** |
| Expense docs with VAT status | **Missing** (only cash txs) |
| VAT settlement (payable/carryforward) | **Missing** |
| Financial periods + locks | **Missing** |
| Multi-location legal/analytic dims | **Partial** (`erp_locations`, warehouse, channel; no legal entity / cost center) |
| Unallocated VAT adj → P&L | **Explicitly deferred to R3** (UI already says so) |

---

## 4. Architecture principles

```
                    ┌─────────────────────┐
   Forecast only    │ financialCalculator │  (R1 — keep)
   (menu / pricing) └──────────┬──────────┘
                               │ never writes tax register / COGS
                               ▼
┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐
│ Sales facts  │──▶│ Accrual P&L      │◀──│ Expense facts   │
│ + Output VAT │   │ (period books)   │   │ + Input VAT     │
└──────┬───────┘   └────────┬─────────┘   └────────┬────────┘
       │                    │                      │
       │            ┌───────▼────────┐             │
       │            │ VAT Settlement │◀────────────┘
       │            └────────────────┘
       │
       ▼
┌──────────────┐         ┌─────────────────┐
│ FIFO consume │────────▶│ Actual COGS     │
│ movements    │         │ (sale-linked)   │
└──────────────┘         └─────────────────┘

┌──────────────────────────────────────────┐
│ Cash Flow (accounts, payouts, payroll)   │  ← money dates only
└──────────────────────────────────────────┘
```

**Separation rules**

| Event | P&L | Cash | VAT |
|-------|-----|------|-----|
| Stock receipt (goods) | Inventory / not COGS | Optional supplier payment later | Input VAT (R2 status) |
| Sale posted | Net revenue + COGS | When money received / payout | Output VAT |
| Grab payout arrives | — | Cash in (settlement) | — |
| Grab commission invoice | Commission expense | When paid | Input VAT if invoice |
| Internal transfer WH | — | — | No external VAT / revenue |

---

## 5. Analytic dimensions (company-central)

Single DB (current Supabase project). Filters, not separate DBs per restaurant.

| Dimension | Existing hook | R3 proposal |
|-----------|---------------|-------------|
| Legal Entity | — | `erp_legal_entities` (start with one row GASTROFOOD) |
| Business Location | `erp_locations` | FK on sales, expenses, settlements |
| Warehouse | `erp_warehouses` | Keep for stock; map to location |
| Cost Center | — | Optional on expenses / payroll |
| Profit Center | — | Derive from location × channel or explicit |
| Sales Channel | `erp_sales_channels` | Keep; mark `forecast` vs `actual` settings |
| Financial Period | — | `erp_finance_periods` (month) |
| Expense Category | `erp_finance_categories` | Extend taxonomy + map to P&L lines |
| Supplier | `erp_suppliers` | Keep |
| Payment Method | accounts.kind / new enum | On cash txs & settlements |

Internal transfers between units of the **same** legal entity: stock doc only; **no** external revenue; **no** duplicate VAT.

---

## 6. Sales architecture

### 6.1 Proposed documents

**`erp_sales_documents`** (header) + **`erp_sales_lines`** (+ optional payments / refunds child tables).

Header fields (minimum):

- `id`, `doc_no`, `sold_at`, `business_location_id`, `sales_channel_id`  
- `external_order_id`, `poster_order_id`, `grab_order_id` (nullable)  
- `canonical_order_key` (unique) — **dedupe key**  
- Gross / merchant discount / platform-funded discount  
- Taxable amount, output VAT rate/amount, net revenue  
- Payment status, refund/chargeback flags  
- `source` ∈ `poster` | `grab` | `manual` | `import`  
- `finance_period_id`, status ∈ draft/posted/cancelled  

Lines: product/dish, qty, amounts, VAT, **`cogs_amount`**, link to consume batch.

### 6.2 Import & dedupe

| Source | Import | Canonical key proposal |
|--------|--------|------------------------|
| Poster | Order API / export | `poster:{spot}:{order_id}` |
| GrabMerchant | Settlement / order CSV or API | `grab:{merchant_id}:{order_id}` |
| Both | Match map table | Prefer Grab financials for money; Poster for kitchen SKU map when both exist |

**`erp_sales_source_links`**: `(canonical_order_key, source, external_id)` unique — prevents double revenue.

Owner decision needed: when both exist, **which source owns Gross Sales** vs **which owns kitchen items** (see §19).

### 6.3 Sales ↔ FIFO / Actual COGS

Recommended flow (no second consume engine):

1. Post sale (or import confirmed).  
2. Call existing **`erp_consume`** (or thin wrapper) for recipe explosion / mapped ingredients at location warehouse.  
3. Persist allocation rows: `erp_sales_cogs_allocations` (sale_line_id, lot_id, qty, unit_cost, amount) sourced from movements.  
4. Sum → `actual_cogs` on sale line/header.  
5. Write-offs / waste stay **non-COGS** opex or separate loss — never silent into sales COGS.

Until sales posting exists, **do not** invent COGS from purchase totals or forecast snapshots.

---

## 7. Input VAT register (extend R2)

Reuse purchase docs + VAT adj. Add **register view/materialization** across:

| Domain | Source docs |
|--------|-------------|
| Ingredients / packaging | `erp_documents` receipt + R2 VAT fields |
| Equipment / services / rent / utilities / Grab commission & ads | New **`erp_expense_documents`** (or generalized `erp_ap_invoices`) with same VAT status enum as R2 |
| Adjustments | `erp_vat_cost_adjustments` |

Register columns: Total / Deductible / Non-deductible / Pending / Adjustments; supplier invoice identity for **duplicate invoice guard**.

**Never** build the register from dish forecast VAT.

---

## 8. Output VAT register

From **posted sales documents** only:

- Store applied rate + amount at post time.  
- Refunds / chargebacks = reversing or negative docs.  
- Global rate change does **not** rewrite history (same R1 rule).

---

## 9. GrabFood — forecast vs actual

| Layer | Use |
|-------|-----|
| Channel finance % (R1) | Pricing / CM **forecast** only |
| GrabMerchant import | **Actual** commission, ads, chargebacks, net earnings, payout |
| Tax invoices for commission/ads | Confirm Input VAT; until then **Pending** |

Proposed objects:

- `erp_platform_settlement_imports` (file/batch)  
- `erp_platform_settlement_lines` (order-level or fee-level)  
- `erp_platform_payouts` (bank cash in)  
- Reconcile report: earnings vs payout vs VAT invoices  

When actual amounts exist → P&L uses **actuals**, not %.

---

## 10. Control example — Grab October 2026 (arithmetic only)

| Metric | VND | Check |
|--------|-----|-------|
| Gross Sales | 434 904 005 | given |
| Merchant Discounts | 764 000 | given |
| Net Sales | 434 140 005 | = Gross − Discounts **✓** |
| Channel Commission | 85 240 734 | given |
| Marketing | 30 349 488 | given |
| Chargebacks | 76 347 | given |
| Net Earnings After Marketing | 318 473 436 | = Net Sales − Comm − Mkt − Chargebacks **✓** (`diff=0`) |

**Phase 9A:** verified arithmetically only.  
**Do not** auto-create Oct 2026 financial documents.  
Commission / marketing VAT: **unconfirmed** until tax invoices.

---

## 11. Operating expenses

Extend category catalog (map to existing `erp_finance_categories` + new codes):

Payroll, Employer SI, Staff Meals, Rent, Electricity, Water, Gas, Internet, Cleaning, Maintenance, Transportation, Marketing, Software, Professional Services, Depreciation, Other.

**`erp_expense_documents`** (accrual) fields: category, location, cost center, supplier, expense date, net/VAT/gross, VAT deduction status, payment status/date, attachment, allocation % across locations.

Cash payment may create/link `erp_finance_transactions` (Cash Flow) **without** double-counting P&L (P&L from expense doc; cash from payment).

---

## 12. Target P&L structure

```
Gross Sales
− Merchant Discounts
− Output VAT
= Net Revenue
− Actual COGS
= Gross Profit
− Platform Commission (actual)
− Advertising (actual)
− Other variable
= Contribution Margin          ← not Net Profit
− Payroll / Rent / Utilities / Other opex
= EBITDA
− D&A
= Operating Profit
± Other
= Profit Before Tax
− CIT (only if rate confirmed)
= Net Profit
```

Every line: **Actual** or explicitly **Estimated**.  
Unconfirmed CIT rate → show “not applied”.

Current `/erp/finance/pnl` is a **placeholder** relative to this structure; R3 replaces its data source, may keep route/skin.

---

## 13. Cash Flow structure

| Section | Sources |
|---------|---------|
| Opening | Account balances |
| Operating | Customer/platform receipts, supplier & opex payments, payroll |
| Investing | Equipment (when tagged) |
| Financing | Owner contributions, loans |
| Closing | Opening + net |

Support: cash, bank, platform settlements, supplier payments, payroll, owner, loans, **internal transfers** (CF neutral).

Existing `buildCashflow` is a starting point for account rolls; extend classification tags on categories/accounts.

---

## 14. VAT Settlement

```
Output VAT (period)
− Eligible Deductible Input VAT
± VAT Adjustments (R2)
− Applicable carryforward
= VAT Payable / Carryforward
```

Pending ≠ deductible.  
Unallocated R2 adjustments: separate bucket until allocated (manual / lineage rules).  
Period rules → **accountant confirmation** (§19).

---

## 15. Financial periods

States: `open` → `under_review` → `closed` (→ `reopened` with rights).

- DB constraints / RPC guards: no post/edit in `closed` without reopen.  
- Corrections = new docs in open/reopen period.  
- Reopen: role + reason + `erp_audit_log`.

---

## 16. Proposed Finance UI IA

Keep ERP design system; evolve nav (do not fork a second Finance app):

| Menu | Route (proposal) | Notes |
|------|------------------|-------|
| Dashboard | `/erp/finance` | KPIs: revenue, CM, cash, VAT due |
| Sales | `/erp/finance/sales` | New |
| Expenses | `/erp/finance/expenses` | New (accrual) |
| Platform Settlements | `/erp/finance/settlements` | Grab/etc. |
| Input VAT | `/erp/finance/vat/input` | Register over R2 + expenses |
| Output VAT | `/erp/finance/vat/output` | From sales |
| VAT Settlement | `/erp/finance/vat/settlement` | |
| Channel Profitability | `/erp/finance/channels` | Actual + optional forecast compare |
| Profit & Loss | `/erp/finance/pnl` | Replace engine |
| Cash Flow | `/erp/finance/cashflow` | Extend |
| Periods | `/erp/finance/periods` | |
| (Keep) Transactions / Accounts / Shifts / Salary / Categories | existing paths | Cashbook & master data |

Filters: period, location, city, unit, channel, expense category.

---

## 17. Implementation plan Phase 9B–10

### 9B — Sales & Output VAT
- **Depends:** 9A approval; location/channel masters  
- **DB:** sales documents/lines, canonical keys, source links, output VAT snapshot cols  
- **API/RPC:** save/post/cancel sale; import stubs  
- **UI:** Sales list/editor; Output VAT register v1  
- **Tests:** post sale; VAT frozen on rate change; no double key  
- **Risk:** Poster schema mismatch; partial orders  

### 9C — Input VAT Register
- **Depends:** R2 live; expense doc VAT or purchase-only v1  
- **DB:** register view; invoice uniqueness  
- **UI:** Input VAT register; duplicate warnings  
- **Tests:** pending excluded from deductible  
- **Risk:** service invoices without stock receipt  

### 9D — Platform commission, advertising & settlements
- **Depends:** 9B keys for order match (soft)  
- **DB:** settlement import + payout tables  
- **UI:** import wizard; reconcile vs payout  
- **Tests:** Oct 2026 control arithmetic fixture (no auto docs)  
- **Risk:** Grab file format drift; VAT invoices lag  

### 9E — VAT Settlement
- **Depends:** 9B+9C (+9D VAT when available)  
- **DB:** settlement runs; carryforward  
- **UI:** period VAT worksheet  
- **Tests:** pending not in eligible; adj included per rules  
- **Risk:** legal period rules unclear until accountant OK  

### 9F — Channel & location profitability
- **Depends:** 9B actuals; 9D fees  
- **DB:** reporting views/RPCs  
- **UI:** channel/location P&L slices  
- **Tests:** CM ≠ net profit labels  
- **Risk:** shared opex allocation policy  

### 9G — Operating expenses, full P&L & Cash Flow
- **Depends:** expense docs; 9B COGS link (or explicit Estimated COGS flag)  
- **DB:** expense docs; category map; P&L snapshot optional  
- **UI:** expenses; new P&L; CF sections  
- **Tests:** purchase ≠ COGS; transfer ≠ revenue  
- **Risk:** dual posting cash+accrual mistakes  

### 9H — Financial periods & audit
- **Depends:** posting paths from 9B–9G  
- **DB:** periods; lock triggers; reopen audit  
- **UI:** period console  
- **Tests:** closed period rejects post  
- **Risk:** emergency corrections UX  

### 10 — Final acceptance & production deploy
- Free-path: `pg_dump` → local PG restore → migrate → smoke → owner OK → prod SQL → FE merge  
- Same discipline as R2 (`docs/R12_FREE_PATH_READINESS.md`, `R2_PRODUCTION_FREEZE.md`)  
- No Pro / no SpiceSpace without separate OK  

---

## 18. Infrastructure

| Item | Decision |
|------|----------|
| Supabase | **Free**, project `ulxmubivimwxevgxxxyu` |
| GitHub / Vercel | unchanged |
| Pre-prod SQL | Local PG restore of prod dump (proven Free path) |
| SpiceSpace | **Not used** |
| Paid add-ons | Only with separate approval |

---

## 19. Owner / accountant decisions (blockers for 9B+)

1. **VAT accounting method** for books: cash / accrual / hybrid (UI exists; still often «Не подтверждён»).  
2. **Who owns Gross Sales** when Poster + Grab both have the order?  
3. **COGS timing:** at sale post vs day-end batch explosion?  
4. **Shared opex allocation** across locations (%, headcount, revenue)?  
5. **CIT rate** and whether to show Estimated tax.  
6. **VAT period** (calendar month?) and invoice eligibility lag.  
7. **Grab tax invoices:** process to clear Pending on commission/ads.  
8. Confirm **Oct 2026** is fixture-only until import UI ships.  
9. Single **legal entity** now vs multi-entity later.  
10. Whether salary module expands in 9G or stays cashbook-only initially.

---

## 20. Risks

| Risk | Mitigation |
|------|------------|
| Treating cashbook P&L as company truth | Replace data source; label old report “Cashbook” if kept |
| Using forecast channel % as actual Grab cost | Hard gate: actual settlement overrides |
| Purchase totals as COGS | Enforce sale↔FIFO link; category hygiene |
| Double-count Poster+Grab | Canonical order key + source links |
| Mixing recoverable VAT into opex | Reuse R2 deduction status on all AP |
| Free-tier migration mistakes | Mandatory dump → local apply → smoke |
| Scope explosion | Strict phase gates; 9A = design only |

---

## 21. Proposed migration themes (names only — not applied)

Illustrative sequence (final names at 9B+):

1. `erp_legal_entity_and_dims`  
2. `erp_finance_periods`  
3. `erp_sales_documents`  
4. `erp_sales_cogs_allocations`  
5. `erp_expense_documents`  
6. `erp_platform_settlements`  
7. `erp_vat_registers_and_settlement`  
8. `erp_finance_period_locks`  

Each applied only after Free-path verification and owner OK.

---

## 22. Data-flow diagrams (logical)

### 22.1 Financial data

```
Poster / Grab / Manual
        │
        ▼
 Sales Document (posted) ──► Output VAT Register
        │
        ├──► Net Revenue ─────────────┐
        │                             │
        └──► erp_consume (FIFO) ──► Actual COGS ──► P&L
                                                  │
 Expense Docs / Settlements ──────────────────────┤
 Payroll (accrual) ───────────────────────────────┤
                                                  ▼
                                         P&L / CM / Net Profit

 Bank / Cash / Payouts / Payments ──► Cash Flow (separate)
```

### 22.2 Tax data

```
Sales posted ──► Output VAT (frozen on doc)

Purchases R2 + Expense invoices ──► Input VAT (Pending/Deductible/Non-ded.)
VAT Cost Adjustments R2 ──► Adjustments bucket
        │
        ▼
 Period VAT Settlement ──► Payable / Carryforward
```

---

## 23. Phase 9A deliverable checklist

| Item | In this doc |
|------|-------------|
| Finance module audit | §3 |
| Existing tables / functions | §3.2–3.5 |
| Gaps | §3.9 |
| Architecture & separation | §4–5 |
| Financial / tax data flow | §22 |
| Poster / Grab import & dedupe | §6.2, §9 |
| Sales ↔ FIFO COGS | §6.3 |
| Report structures | §12–14 |
| Migration themes | §21 |
| Plan 9B–10 | §17 |
| Risks | §20 |
| Owner questions | §19 |
| Oct 2026 arithmetic | §10 **✓** |

---

## 24. Explicit non-actions (9A)

- No application code changes for R3 features.  
- No production DB changes / migrations.  
- No merge of R3 feature branches.  
- No prices / recipes / stock rewrites.  
- No real Oct 2026 postings.  
- **Phase 9B not started** until owner confirmation on this document (+ answers to §19 as needed).

---

**Awaiting approval of `docs/RELEASE3_FINANCIAL_ARCHITECTURE.md` to open Phase 9B.**
