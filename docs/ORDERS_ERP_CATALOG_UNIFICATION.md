# ERP ↔ Prep Stock — галка `staff_listed`

**Status:** Order List restored (independent). Checkbox = Prep Stock only.  
**Constraints:** Free Plan · no FIFO auto-consume · no Poster · Order List not gated by the checkbox.

## Mapping

| Spec | ERP today | Notes |
|------|-----------|--------|
| Показывать в Prep Stock | `erp_products.staff_listed` | Default `false`. Toggle adds/removes Prep Stock row (`erp_prep_stock_items.id` = product uuid). |
| Order List | `erp_order_catalog_products` | **Ignores** `staff_listed`. Visible when `base_unit` set + supplier on product or pack, not hidden/archived. |
| Поставщик | optional for Prep Stock | Not required to enable the checkbox. Order List still needs a supplier path to appear. |
| Фасовка Orders | `order_pack_*` | Kept for Orders packing display; unrelated to Prep Stock checkbox. |
| ERP Product ID | `erp_products.id` (uuid) | Prep Stock item id when synced from ERP. |

## Rules (owner)

1. Order List must not empty because of the Prep Stock checkbox.
2. Checkbox only shows/hides the product in Prep Stock.
3. Supplier is optional for Prep Stock listing.
4. Russian name is a first-class field (`names.ru`); EN/VN stay in `name_en` / `name_vn`.

## Acceptance

- [ ] Order List shows previous catalog (unit + supplier), even if all `staff_listed = false`.
- [ ] Checkbox on → product in Prep Stock (no supplier required).
- [ ] Checkbox off → gone from Prep Stock; Order List unchanged.
- [ ] Russian name saves and reloads on product / prep cards.
- [ ] Stock qty, recipes, prices, finance docs untouched.

## UI paths

| Setting | Path |
|---------|------|
| Ingredient — Prep Stock | `/erp/menu/ingredients` → product → checkbox |
| Prep — Prep Stock | `/erp/menu/preps` → open prep → Хранение |
| Product card | `/erp/products/{id}` |
| Prep Stock | `/orders/prep-stock` |
| Order List | `/orders` |
