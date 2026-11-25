/**
 * Menu/tech-card helpers on top of costing.ts. Ingredients are always erp_products
 * (type ingredient / semi_finished / finished / packaging / consumable). There is
 * no second ingredients catalog.
 */
import {
  buildCostContext,
  channelResult,
  compositionLineQty,
  costLine,
  DEFAULT_MENU_PRICE_SOURCE,
  summarize,
  type ChannelResult,
  type CostContext,
  type CostProduct,
  type CostRecipe,
  type CostSummary,
  type MenuPriceSource,
  type PricingSettings,
  type ProductCostQuoteInput,
} from "./costing";
import {
  recipeCostSourceToMenuPriceSource,
  resolveRecipeCostSource,
  type RecipeCostSourcePolicy,
} from "./recipeCosting";
import type { ErpChannel, ErpDish, ErpRecipe, ErpSettings } from "./types";

export { DEFAULT_MENU_PRICE_SOURCE, type MenuPriceSource };
export { resolveRecipeCostSource, recipeCostSourceToMenuPriceSource, type RecipeCostSourcePolicy };

export function menuCostContext(
  state: {
    products: CostProduct[];
    recipes: CostRecipe[];
    costSources?: Iterable<ProductCostQuoteInput>;
    settings?: Pick<ErpSettings, "recipe_cost_source"> | null;
  },
  priceSource?: MenuPriceSource,
  explodeRecipes = true,
): CostContext {
  const resolved =
    priceSource ??
    recipeCostSourceToMenuPriceSource(resolveRecipeCostSource(state.settings ?? null));
  return buildCostContext(state.products, state.recipes, {
    quotes: state.costSources,
    priceSource: resolved,
    explodeRecipes,
  });
}

export type DishCost = {
  summary: CostSummary;
  channels: ChannelResult[];
  main: ChannelResult | null;
};

export function dishCost(
  ctx: CostContext,
  dish: Pick<ErpDish, "lines" | "sale_price" | "vat_rate" | "channel_prices">,
  settings: PricingSettings,
  channels: ErpChannel[],
): DishCost {
  const lines = dish.lines
    .filter((line) => line.product_id && compositionLineQty(line) != null)
    .map((line) => costLine(ctx, line.product_id as string, compositionLineQty(line) as number));
  const summary = summarize(lines);
  const results = channels
    .filter((channel) => !channel.archived_at)
    .map((channel) =>
      channelResult(
        summary,
        {
          id: channel.id,
          name: channel.name,
          commission_pct: channel.commission_pct,
          price: dish.channel_prices.find((price) => price.channel_id === channel.id)?.sale_price ?? dish.sale_price,
        },
        settings,
        dish.vat_rate,
      ),
    );
  const directId = channels.find((channel) => channel.code === "direct")?.id;
  return { summary, channels: results, main: results.find((channel) => channel.id === directId) ?? results[0] ?? null };
}

/** Recipes that output this product, newest version first. History of a prep card. */
export function recipeHistory(recipes: ErpRecipe[], productId: string): ErpRecipe[] {
  return recipes.filter((recipe) => recipe.product_id === productId).sort((a, b) => b.version - a.version);
}
