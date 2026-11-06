import { buildCostContext, costLine, summarize, type CostContext, type CostSummary } from "@/lib/erp/costing";
import type { ErpCategory, ErpDish, ErpState } from "@/lib/erp/types";

/**
 * Field map for the Menu UI. Existing ERP names until Agent 3 publishes
 * GASTROBAR-menu-logic/docs/erp-menu-api-contract.md — swap here, not in each page.
 *
 * Poster tab            → existing source
 * Товары                → erp_dishes
 * Тех. карты            → erp_dishes.lines (composition); prep recipes stay on Полуфабрикаты
 * Полуфабрикаты         → erp_products.type = semi_finished + erp_recipes
 * Ингредиенты           → erp_products.type in ingredient | packaging | consumable
 * Контроль фудкоста     → same dishes + costing.channelResult
 * Категории (оба дерева)→ erp_categories (one table until Agent 3 splits it)
 * Цехи / заведения      → no API yet (stub filters and the Цехи tab)
 */
export const MENU_CONTRACT = {
  dishCategoryField: "category_id" as const,
  productCategoryField: "category_id" as const,
  workshopField: null,
  venueField: null,
  sharedCategories: true,
};

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

/** Poster «Наценка»: (price − cost) / cost. Formula tagged until Agent 1 confirms. Unknown cost stays null. */
export function markupPct(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (price === null || price === undefined || cost === null || cost === undefined || cost === 0) return null;
  return ((price - cost) / cost) * 100;
}
