import { DEFAULT_MENU_PRICE_SOURCE, LOSS_METHODS, type CostContext, type LossPcts, type MenuPriceSource } from "@/lib/erp/costing";
import { dishCost, menuCostContext } from "@/lib/erp/menu";
import type { ErpCategory, ErpDish, ErpProduct, ErpRecipe, ErpState } from "@/lib/erp/types";
import { locale, T } from "./i18n";

/**
 * Field map for the Menu UI. Agreed with Agent 3:
 * GASTROBAR-menu-logic/docs/erp-menu-api-contract.md
 *
 * Poster tab            → existing source
 * Товары                → erp_products.type = finished (resale; Agent 1 tovary.md). Sale price is not on products yet.
 * Тех. карты            → erp_dishes + erp_dish_lines (sellable menu item; price lives here)
 * Полуфабрикаты         → erp_products.type = semi_finished + erp_recipes
 * Ингредиенты           → erp_products.type = ingredient (packaging/consumable via type filter)
 * Контроль фудкоста     → dishCost / menuCostContext (`src/lib/erp/menu.ts`)
 * Категории (оба дерева)→ erp_categories (one table — do not invent a second)
 * Цехи                  → no table; not warehouses
 * Заведения             → not 1:1 with workshops; no API yet
 */
export const MENU_CONTRACT = {
  dishCategoryField: "category_id" as const,
  productCategoryField: "category_id" as const,
  workshopField: null,
  venueField: null,
  sharedCategories: true,
};

/** Poster list filter «Заведение» — radio, cannot clear. Selecting does not filter until availability exists. */
export const POSTER_VENUES = [
  { id: "GASTROBAR", label: "GASTROBAR" },
  { id: "FOODTRUCK", label: "FOODTRUCK" },
  { id: "PREP KITCHEN", label: "PREP KITCHEN" },
  { id: "ONLINE KITCHEN", label: "ONLINE KITCHEN" },
] as const;

/** Poster «Цех приготовления» on the add form. Not erp_warehouses. */
export const POSTER_WORKSHOPS = ["Без цеха", "GASTROBAR", "GASTROFOOD", "GASTROTRUCK WORKSHOP"] as const;

export const INGREDIENT_TYPES = ["ingredient", "packaging", "consumable"] as const;

export function dishTitle(dish: Pick<ErpDish, "name_en" | "name_vn">) {
  return dish.name_vn && dish.name_vn !== dish.name_en ? `${dish.name_en} / ${dish.name_vn}` : dish.name_en;
}

export function categoryLabel(category: ErpCategory | undefined) {
  if (!category) return "—";
  return category.name_vn && category.name_vn !== category.name_en ? `${category.name_en} / ${category.name_vn}` : category.name_en;
}

export function defaultDishCategoryId(categories: ErpCategory[]): string {
  const main = categories.find((category) => !category.archived_at && /главн|main screen/i.test(`${category.name_en} ${category.name_vn}`));
  return main?.id ?? "";
}

export function costContextOf(state: ErpState, priceSource: MenuPriceSource = DEFAULT_MENU_PRICE_SOURCE): CostContext {
  return menuCostContext(state, priceSource);
}

export function dishEconomics(state: ErpState, ctx: CostContext, dish: ErpDish) {
  const { summary, channels, main } = dishCost(ctx, dish, state.settings, state.channels);
  return {
    summary,
    channels,
    main,
    channel: main,
    channelName: main?.name ?? "—",
    cost: summary.totalCost,
    markup: main?.markupPct ?? null,
    foodOnPrice: main?.foodCostOnPricePct ?? null,
    foodCostPct: main?.foodCostPct ?? null,
    margin: main?.grossMarginPct ?? null,
    profit: main?.grossProfit ?? null,
  };
}

/** Poster list «Наценка»: (цена / себестоимость − 1) × 100. Zero/unknown cost → «—»; price 0 with cost → −100%. */
export function posterMarkupPct(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (cost == null || cost === 0) return null;
  if (price == null) return null;
  return (price / cost - 1) * 100;
}

export function posterMarkupText(price: number | null | undefined, cost: number | null | undefined): string {
  const value = posterMarkupPct(price, cost);
  return value == null ? "—" : `${Math.round(value)}%`;
}

export function posterDecimals(value: number, decimals: number) {
  return value.toLocaleString(locale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** List yield is kilograms with 3 decimals (`0,180 кг`), even when the form shows grams. */
export function posterYieldKg(qtyKg: number | null | undefined): string {
  if (qtyKg == null) return "—";
  return `${posterDecimals(qtyKg, 3)} ${T("кг", "kg", "kg")}`;
}

export function posterYieldG(qtyKg: number | null | undefined): string {
  if (qtyKg == null) return "—";
  return `${Math.round(qtyKg * 1000)} ${T("г", "g", "g")}`;
}

/** Screenshot: «26% 0% 0% 0% 0%», or «—» when no loss % is stored. */
export function lossPercentsText(product: LossPcts): string {
  const values = LOSS_METHODS.map((method) => product[`loss_${method}_pct`]);
  if (values.every((value) => value == null)) return "—";
  return values.map((value) => `${Math.round(Number(value ?? 0))}%`).join(" ");
}

export function posterStockQty(qty: number, unit: string | null | undefined): string {
  if (!unit) return posterDecimals(qty, 3);
  const decimals = unit === "pcs" ? 2 : 3;
  const suffix = unit === "pcs" ? T("шт.", "pcs", "cái") : unit === "l" ? T("л", "l", "l") : T("кг", "kg", "kg");
  return `${posterDecimals(qty, decimals)} ${suffix}`;
}

export function nameInitials(name: string) {
  const parts = name
    .replace(/[^\w\u00C0-\u024F]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function isPrepProduct(product: Pick<ErpProduct, "type"> | undefined) {
  return product?.type === "semi_finished";
}

export function dishesUsingProduct(state: ErpState, productId: string) {
  return state.dishes.filter((dish) => !dish.archived_at && dish.lines.some((line) => line.product_id === productId));
}

export function prepsUsingProduct(state: ErpState, productId: string) {
  const active = new Map<string, ErpRecipe>();
  for (const recipe of state.recipes) {
    if (recipe.status !== "active") continue;
    if (!recipe.lines.some((line) => line.product_id === productId)) continue;
    active.set(recipe.product_id, recipe);
  }
  return state.products.filter((product) => product.type === "semi_finished" && !product.archived_at && active.has(product.id));
}
