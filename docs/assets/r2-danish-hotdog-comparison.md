# Danish Hot Dog — Release 1 vs Release 2 forecast

**Sale prices not changed.** Live production dish card was not rewritten.

## Release 1 production snapshot (from RELEASE1_ACCEPTANCE_REPORT)

| Component | Amount (₫) |
|-----------|------------:|
| Food Cost | 24 716.36 |
| Packaging Cost | 3 185.70 |
| **Total Product Cost** | **27 902.06** |

Control fixture used in calculator tests: food **24 750** + pack **3 152** = **27 902**.

## Release 2 forecast behaviour

After R2 migrations on a database:

- Ingredient lines still explode via `costing.ts` using `recipe_cost_source` (default **`manual_estimated`** → `est_unit_cost` / reference).
- If purchase lots are posted with **Pending** Input VAT, `est_unit_cost` from last receipt may move to **gross-effective** inventory cost → Food Cost rises vs R1 “net-only” era.
- If lots are **Deductible**, forecast stays at net (aligned with R1 assumption that recoverable VAT was excluded).
- Packaging unchanged unless packaging SKU costs change.
- **No automatic sale price change.**

### Expected explanation template (fill at cutover from live quotes)

| Ingredient | Qty | Unit | R1 unit cost | R2 unit cost | Cost source | Input VAT status | Δ reason |
|------------|----:|------|-------------:|-------------:|-------------|------------------|----------|
| *(from live dish lines)* | | | | | reference / last_lot / fifo | pending / deductible / … | |

Until R2 SQL is applied on a clone with production-like data, component-level Δ cannot be computed against live lots without reading production (read-only OK) or loading a clone dump.

## Finance matrix (fixture food 24 750 + pack 3 152)

See `docs/assets/r2-phase8g-acceptance.json` — Direct / Grab Organic / Standard / Full at 99k / 109k / 119k, Pending vs Full VAT simulation. Matches Release 1 control scenarios (e.g. Grab Full @ 109k → **42.51%** / **44.72%**).

## Output VAT inheritance (Release 1 fix — re-confirmed)

Unit tests in `dishChannelFinance.test.ts`:

- Legacy `dish.vat_rate` equal to old global does **not** become an individual override when global moves 8→10.
- Priority: Dish Output Exception → Category → Channel → Global.
- Modern channels use **only** `financialCalculator.ts` via `dishChannelFinance`.
