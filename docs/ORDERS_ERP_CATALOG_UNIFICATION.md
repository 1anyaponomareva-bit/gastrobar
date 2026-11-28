# ERP ↔ Orders — единый справочник (Accountable Item + фасовка)

**Status:** Phase 1 in progress (UI + SQL). Old tables **not** deleted.  
**Constraints:** Free Plan · no FIFO auto-consume · no Poster · no stock/recipe/price/finance mutation beyond catalog fields · history preserved.

## Mapping to existing ERP

| Spec | ERP today | Notes |
|------|-----------|--------|
| Показывать в Orders / Show in Orders | `erp_products.staff_listed` | Default `false`. Owner enables per item. |
| Скрыт в заявках | `erp_products.staff_hidden` | Kept; accountable + not hidden required for Orders. |
| ERP Product ID | `erp_products.id` (uuid) | Orders lines already store `product_id`. |
| Наименование / категория / единица | `name_*`, `category_id`, `base_unit` | Already from ERP. |
| Фасовка (структурированная) | **new** `order_pack_*` columns | Not free-text `staff_pack`; not yield; not stock UOM. |
| Закупочные packs | `erp_product_packs` + `erp_packs` | Unchanged (supplier ordering units). |

## Phases

### Phase 1 — Foundation (this change)

1. SQL: `order_pack_type`, `order_pack_content_qty`, `order_pack_content_unit`.
2. Backfill `staff_listed = true` for products already visible in Orders (supplier + unit), then **require** `staff_listed` in order catalog RPCs.
3. ERP UI: checkbox «Показывать в Orders» on ingredient + prep cards; packing in «Хранение»; list filter + column.
4. Orders UI: read-only packing line + packs × content = total; no free-text packing edit.
5. Order snapshot already freezes names/pack labels at place time — extend with packing fields when present.

### Phase 2 — Prep Stock from ERP

- Prep Stock items (`erp_prep_stock_items` / static) → ERP `semi_finished` with Accountable.
- Migrate balances by `item_id` → `product_id` map; keep movement history.
- Remove Orders Admin Prep Stock catalog editor after cutover.

### Phase 3 — Retire duplicates (needs owner GO)

**Do not drop until backup + acceptance:**

| Artifact | Action |
|----------|--------|
| Orders Admin inventing products outside ERP | Already uses `erp_save_product` — keep; remove any leftover Staff JSON import as default path |
| `staff_pack` free text | Deprecate in UI; keep column for history |
| `erp_prep_stock_items` | Drop only after Prep Stock cutover + backup |
| Old `/staff` Order List JSON | Out of scope until Staff app retired |

**Backup before Phase 3:** `pg_dump` of `erp_products`, `erp_product_packs`, `erp_supplier_orders*`, `erp_prep_stock_*`.

## Acceptance checks

- [ ] New product: Accountable off → absent from Orders.
- [ ] Toggle on → appears (with unit + supplier as today).
- [ ] Toggle off → gone from new orders; old orders unchanged.
- [ ] Prep packing edited only in ERP; Orders shows read-only.
- [ ] Snapshot after rename/repack still shows old names/packing.
- [ ] Stock qty, recipes, prices, finance docs untouched.
- [ ] Screenshots + paths (see below).

## UI paths

| Setting | Path |
|---------|------|
| Ingredient — Show in Orders | `/erp/menu/ingredients` → product → checkbox |
| Prep — Show in Orders + фасовка | `/erp/menu/preps` → open prep → Хранение |
| Product card (general) | `/erp/products/{id}` |
| Orders list | `/orders` |
| Orders admin (ERP products) | `/orders/admin` |

## Out of scope (explicit)

- Poster POS  
- Auto-consume FIFO  
- Changing warehouse balances / tech cards / purchase prices / finance documents  
- Bidirectional sync Orders → ERP catalog  
