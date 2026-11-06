import { DEFAULT_MENU_PRICE_SOURCE, type CostContext, type MenuPriceSource } from "@/lib/erp/costing";
import { dishCost, menuCostContext } from "@/lib/erp/menu";
import type { ErpCategory, ErpDish, ErpState } from "@/lib/erp/types";

/**
 * Field map for the Menu UI. Agreed with Agent 3:
 * GASTROBAR-menu-logic/docs/erp-menu-api-contract.md
 *
 * Poster tab            → existing source
 * Товары                → erp_products.type = finished (resale). sale_price + venue_prices on the product.
 * Тех. карты            → erp_dishes + erp_dish_lines + venue_prices (sellable menu item)
 * Полуфабрикаты         → erp_products.type = semi_finished + erp_recipes (no workshop / venue / POS category)
 * Ингредиенты           → erp_products.type = ingredient; category = ingredient_category_id
 * Контроль фудкоста     → dishCost / goodsCost / menuCostContext (`src/lib/erp/menu.ts`)
 * Категории товаров     → erp_categories (POS tree, parent_id)
 * Категории ингредиентов→ erp_ingredient_categories (not POS)
 * Цехи                  → state.workshops; card field workshop_id; null = «Без цеха»
 * Заведения             → state.venues; card field venue_prices[]
 */
export const MENU_CONTRACT = {
  dishCategoryField: "category_id" as const,
  productCategoryField: "category_id" as const,
  ingredientCategoryField: "ingredient_category_id" as const,
  workshopField: "workshop_id" as const,
  venuePricesField: "venue_prices" as const,
  sharedCategories: false,
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
