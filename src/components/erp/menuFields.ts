import { DEFAULT_MENU_PRICE_SOURCE, type CostContext, type MenuPriceSource } from "@/lib/erp/costing";
import { dishCost, menuCostContext } from "@/lib/erp/menu";
import type { ErpCategory, ErpDish, ErpState } from "@/lib/erp/types";

/**
 * Field map for the Menu UI. Agreed with Agent 3:
 * GASTROBAR-menu-logic/docs/erp-menu-api-contract.md
 *
 * Poster tab            → existing source
 * Товары                → erp_products.type = finished (resale; Agent 1 tovary.md). Sale price is not on products yet.
 * Тех. карты            → erp_dishes + erp_dish_lines (sellable menu item; price lives here)
 * Полуфабрикаты         → erp_products.type = semi_finished + erp_recipes
 * Ингредиенты           → erp_products (ingredient/packaging/consumable); classify by category + pack supplier, not type
 * Контроль фудкоста     → dishCost / menuCostContext (`src/lib/erp/menu.ts`)
 * Категории (оба дерева)→ erp_categories (one table — do not invent a second)
 * Точки продаж          → erp_locations (Online Kitchen, Food Truck). Not workshops.
 * Цехи / Prep Kitchen   → future Production module; not this Menu tab
 */
export const MENU_CONTRACT = {
  dishCategoryField: "category_id" as const,
  productCategoryField: "category_id" as const,
  workshopField: null,
  locationField: "location_id" as const,
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

export function visibleCategories(categories: ErpCategory[]) {
  return categories.filter((category) => !category.archived_at && !category.deleted_at);
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
