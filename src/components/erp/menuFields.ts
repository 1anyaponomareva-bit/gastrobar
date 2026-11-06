import { buildCostContext, channelResult, costLine, summarize, type CostContext, type CostSummary } from "@/lib/erp/costing";
import type { ErpCategory, ErpDish, ErpState } from "@/lib/erp/types";

/**
 * Field map for the Menu UI. Agreed with Agent 3:
 * GASTROBAR-menu-logic/docs/erp-menu-api-contract.md
 *
 * Poster tab            → existing source
 * Товары                → erp_dishes (not erp_products type=finished)
 * Тех. карты            → erp_dishes.lines; prep recipes stay on Полуфабрикаты
 * Полуфабрикаты         → erp_products.type = semi_finished + erp_recipes
 * Ингредиенты           → erp_products.type = ingredient (packaging/consumable via type filter)
 * Контроль фудкоста     → dishes + costing.channelResult
 * Категории (оба дерева)→ erp_categories (one table — do not invent a second)
 * Цехи                  → no table; not warehouses
 * Заведения             → not 1:1 with workshops; no API yet
 *
 * `@/lib/erp/menu` is Agent 3's tree — this UI computes from costing.ts until that module is on main.
 */
export const MENU_CONTRACT = {
  dishCategoryField: "category_id" as const,
  productCategoryField: "category_id" as const,
  workshopField: null,
  venueField: null,
  sharedCategories: true,
};

/** Poster list filter «Заведение» — radio, cannot clear. Selecting does nothing until Agent 3 adds availability. */
export const POSTER_VENUES = [
  { id: "GASTROBAR", label: "GASTROBAR" },
  { id: "FOODTRUCK", label: "FOODTRUCK" },
  { id: "PREP KITCHEN", label: "PREP KITCHEN" },
  { id: "ONLINE KITCHEN", label: "ONLINE KITCHEN" },
] as const;

export const INGREDIENT_TYPES = ["ingredient", "packaging", "consumable"] as const;

export function dishTitle(dish: Pick<ErpDish, "name_en" | "name_vn">) {
  return dish.name_vn && dish.name_vn !== dish.name_en ? `${dish.name_en} / ${dish.name_vn}` : dish.name_en;
}

export function categoryLabel(category: ErpCategory | undefined) {
  if (!category) return "—";
  return category.name_vn && category.name_vn !== category.name_en ? `${category.name_en} / ${category.name_vn}` : category.name_en;
}

export function costContextOf(state: ErpState): CostContext {
  return buildCostContext(state.products, state.recipes);
}

export function dishSummary(ctx: CostContext, dish: ErpDish): CostSummary {
  const lines = dish.lines.filter((line) => line.product_id && line.qty).map((line) => costLine(ctx, line.product_id, line.qty));
  return summarize(lines);
}

/** Agent 3 contract: markupPct = (netRevenue − totalCost) / totalCost × 100. Unknown stays null. */
export function markupPct(netRevenue: number | null | undefined, cost: number | null | undefined): number | null {
  if (netRevenue === null || netRevenue === undefined || cost === null || cost === undefined || cost === 0) return null;
  return ((netRevenue - cost) / cost) * 100;
}

/** Poster KB: food cost = себестоимость / цена × 100. Unknown stays null. */
export function foodCostOnPricePct(foodCost: number | null | undefined, price: number | null | undefined): number | null {
  if (foodCost === null || foodCost === undefined || price === null || price === undefined || price === 0) return null;
  return (foodCost / price) * 100;
}

export function dishEconomics(state: ErpState, ctx: CostContext, dish: ErpDish) {
  const summary = dishSummary(ctx, dish);
  const direct = state.channels.find((c) => c.code === "direct") ?? state.channels.filter((c) => !c.archived_at)[0];
  const channel = direct
    ? channelResult(summary, { id: direct.id, name: direct.name, commission_pct: direct.commission_pct, price: dish.sale_price }, state.settings, dish.vat_rate)
    : null;
  return {
    summary,
    channel,
    channelName: direct?.name ?? "—",
    cost: summary.totalCost,
    markup: markupPct(channel?.netRevenue, summary.totalCost),
    foodOnPrice: foodCostOnPricePct(summary.foodCost, dish.sale_price),
    foodCostPct: channel?.foodCostPct ?? null,
    margin: channel?.grossMarginPct ?? null,
  };
}
