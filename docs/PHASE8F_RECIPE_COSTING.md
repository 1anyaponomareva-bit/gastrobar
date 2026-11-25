# Phase 8F — Recipe Costing & Financial Integration

**Status:** Implemented on branch `erp-inventory`.  
**Not merged to main. SQL not applied to production.**  
**Do not start Phase 8G without owner OK.**

## Goal

One forecast chain:

`Purchase → Input VAT → FIFO lots → Processing / SF → Recipe → Food Cost → Channel → CM → Recommended Price`

Uses existing:

- `costing.ts` (tech-card explosion, MenuPriceSource)
- `financialCalculator.ts` + `dishChannelFinance.ts` (no duplicate formulas)
- FIFO via `erp_consume` for **actual** stock write-off (unchanged)

## Cost sources (do not mix forecast with actuals)

| Kind | Role |
|------|------|
| Estimated Unit Cost (`est_unit_cost`) | Card / manual / last receipt reference |
| Last Purchase Cost | Newest posted lot `unit_cost` |
| Weighted Average / Estimated FIFO | Remaining lots WAC (`fifo_remaining`) |
| FIFO Inventory Cost | Posted lots (actual consume) |
| Actual Consumption Cost | Allocations from `erp_consume` |
| Production Cost | Produced lot + 8E lineage components |
| Adjusted Inventory Cost | After posted VAT cost adjustment (8D) |
| Recipe Estimated Cost | Exploded tech-card under settings policy |

**Missing cost ⇒ null / incomplete — never silent 0.**

## Costing policy (`erp_settings.recipe_cost_source`)

| Setting | Maps to `MenuPriceSource` |
|---------|---------------------------|
| `manual_estimated` (default) | `reference` |
| `last_purchase` | `last_lot` |
| `weighted_average` | `fifo_remaining` |
| `estimated_fifo` | `fifo_remaining` |

Actual write-off remains FIFO regardless of policy.

## Calculation scheme

```
Product card est_unit_cost / quotes
        │
        ▼
leafPrice(priceSource) ──► costLine(qty gross)
        │                     │
        │                     ├─ explode active SF recipes (no double-count parent lots)
        │                     └─ packaging flagged separately
        ▼
summarize → Food / Packaging / Total
        │
        ▼
dishChannelFinance → financialCalculator
        │
        ├─ Food Cost %
        ├─ Contribution Margin
        └─ Recommended Selling Price (display only; sale price not auto-changed)
```

Usable pack (jar) path (Pickles):

```
Purchase unit cost / Net usable kg = Cost per usable kg
Recipe usable kg × Cost per usable kg = Ingredient cost
(Loss % is informational — not applied a second time)
```

Production:

```
Production Unit Cost = Allocated Production Cost / Usable Production Output
Multi-output: allocate by coefficients (not full cost on each output)
```

## Recipe dependency graph

```
raw → SF₁ → SF₂ → … → dish
```

Helpers in `recipeCosting.ts`:

- `detectRecipeCycles` — blocks cyclic tech-cards
- `affectedProductsByCostChange` / `affectedDishesByProduct` — selective refresh
- No full-menu recompute when a single SKU changes

## UI

1. **Settings** — Tech-card cost source  
2. **Product card** — Ingredient cost readout (units, yield, net/gross, effective cost, source)  
3. **Dish card**
   - Recipe Cost (food / pack / total / source / completeness / warnings)
   - Sales Channel Finance (Release 1 panel)
   - Cost History (`erp_dish_cost_snapshots` — forecast only)

## Control examples

See `src/lib/erp/recipeCosting.test.ts`:

- §14 Pickled Cucumbers — 2 400 / 2 592  
- §15 Yellow Mustard — 1 218.75 / 1 316.25 / 1 267.50  
- §16 Pork Hot Dog — 7 650 / 8 262 per piece  
- §17 Chicken sausage multilevel + cycles  
- §18 Danish Hot Dog finance vs `financialCalculator` (legacy food 24 750 + pack 3 152 = 27 902.06)  
- §19 Margin impact scan  

## Danish Hot Dog — old vs new

Release 1 control total **27 902.06 ₫** = food **24 750** + packaging **3 152**.

Phase 8F does **not** force this number. If live ingredient costs (after Input VAT / FIFO / adjustments) differ, dish Recipe Cost will differ; document component deltas in acceptance. Finance scenarios at 99k / 109k / 119k still go through `financialCalculator.ts`.

## DB

Migration: `20261125190000_erp_recipe_costing.sql`

- `erp_settings.recipe_cost_source`
- `erp_dish_cost_snapshots` + `erp_record_dish_cost_snapshot` / `erp_dish_cost_history`
- Extended `erp_save_settings`

## Non-goals / constraints

- No parallel tech-card or finance calculator  
- No auto sale-price changes  
- No rewrite of historical receipts, FIFO allocations, production docs, sale COGS, closed periods, P&L, tax registers  
- No Phase 8G / Release 3  
- No production SQL apply without owner OK  
