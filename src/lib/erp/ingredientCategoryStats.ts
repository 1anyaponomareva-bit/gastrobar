import { addTotals, stockByProduct, stockOf, stockValue } from "./stockView";
import type { ErpCategory, ErpDish, ErpProduct, ErpSettings, ErpStockRow, ErpVatException } from "./types";
import { DEFAULT_VAT_RATE, effectiveInputVatRate } from "./vat";

export const INGREDIENT_PRODUCT_TYPES = new Set(["ingredient", "packaging", "consumable"]);
export const CATEGORY_TRASH_DAYS = 14;

/** Lot cost is net (recoverable input VAT is not in inventory). Poster shows remaining value with VAT. */
export function withInputVat(
  net: number | null,
  settings: Pick<ErpSettings, "input_vat_enabled" | "default_input_vat_rate">,
  rate?: number | null,
): number | null {
  if (net == null) return null;
  if (!settings.input_vat_enabled) return net;
  const use = rate ?? settings.default_input_vat_rate ?? DEFAULT_VAT_RATE;
  if (use == null) return net;
  return net * (1 + Number(use) / 100);
}

export function withProductInputVat(
  net: number | null,
  productId: string,
  settings: Pick<ErpSettings, "input_vat_enabled" | "default_input_vat_rate">,
  exceptions: ErpVatException[] | null | undefined,
): number | null {
  return withInputVat(net, settings, effectiveInputVatRate(productId, settings, exceptions));
}

export type IngredientCategoryStat = {
  id: string;
  nameEn: string;
  nameVn: string;
  count: number;
  qty: number;
  unit: string | null;
  mixedUnits: boolean;
  valueNet: number | null;
};

const sellable = new Set(["finished", "semi_finished"]);

/** Categories ingredients already use, plus empty rows (Add). POS-only trees stay off this list. */
export function isIngredientCategoryRow(
  categoryId: string,
  products: Pick<ErpProduct, "category_id" | "type" | "archived_at">[],
  dishes: Pick<ErpDish, "category_id" | "archived_at">[],
): boolean {
  const inCat = products.filter((p) => p.category_id === categoryId && !p.archived_at);
  if (inCat.some((p) => INGREDIENT_PRODUCT_TYPES.has(p.type))) return true;
  if (inCat.some((p) => sellable.has(p.type))) return false;
  if (dishes.some((d) => d.category_id === categoryId && !d.archived_at)) return false;
  return true;
}

export function liveCategories<T extends { archived_at: string | null; deleted_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.archived_at && !row.deleted_at);
}

export function trashedCategories<T extends { deleted_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deleted_at);
}

export function trashExpiresAt(deletedAt: string, now = Date.now()): number {
  return Date.parse(deletedAt) + CATEGORY_TRASH_DAYS * 24 * 60 * 60 * 1000;
}

export function trashAlive(deletedAt: string, now = Date.now()): boolean {
  return trashExpiresAt(deletedAt, now) > now;
}

export function ingredientCategoryStats(
  categories: ErpCategory[],
  products: ErpProduct[],
  dishes: ErpDish[],
  stock: ErpStockRow[],
): IngredientCategoryStat[] {
  const stockMap = stockByProduct(stock, null);
  const ingredients = products.filter((p) => INGREDIENT_PRODUCT_TYPES.has(p.type) && !p.archived_at);
  const out: IngredientCategoryStat[] = [];
  for (const category of liveCategories(categories)) {
    if (!isIngredientCategoryRow(category.id, products, dishes)) continue;
    const items = ingredients.filter((p) => p.category_id === category.id);
    const totals = items.map((p) => stockOf(stockMap, p.id));
    const agg = addTotals(totals);
    const stockedUnits = new Set(
      items.filter((p) => stockOf(stockMap, p.id).qty > 0 && p.base_unit).map((p) => p.base_unit as string),
    );
    const mixed = stockedUnits.size > 1;
    const idleUnits = new Set(items.map((p) => p.base_unit).filter(Boolean) as string[]);
    out.push({
      id: category.id,
      nameEn: category.name_en,
      nameVn: category.name_vn,
      count: items.length,
      qty: agg.qty,
      unit: mixed ? null : stockedUnits.size === 1 ? [...stockedUnits][0] : idleUnits.size === 1 ? [...idleUnits][0] : null,
      mixedUnits: mixed,
      valueNet: stockValue(agg),
    });
  }
  return out;
}

export function sumIngredientCategoryStats(rows: IngredientCategoryStat[]): {
  count: number;
  qty: number | null;
  unit: string | null;
  valueNet: number | null;
} {
  const units = new Set(rows.filter((row) => row.qty > 0).map((row) => row.unit).filter(Boolean) as string[]);
  const mixed = units.size > 1 || rows.some((row) => row.mixedUnits && row.qty > 0);
  const valueKnown = rows.every((row) => row.valueNet != null);
  return {
    count: rows.reduce((sum, row) => sum + row.count, 0),
    qty: mixed ? null : rows.reduce((sum, row) => sum + row.qty, 0),
    unit: mixed ? null : units.size === 1 ? [...units][0] : rows.find((row) => row.unit)?.unit ?? null,
    valueNet: valueKnown ? rows.reduce((sum, row) => sum + (row.valueNet ?? 0), 0) : null,
  };
}
