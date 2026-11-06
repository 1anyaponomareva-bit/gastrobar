/**
 * Menu/tech-card helpers on top of costing.ts. Ingredients are always erp_products
 * (type ingredient / semi_finished / finished / packaging / consumable). There is
 * no second ingredients catalog.
 */
import {
  asMoney,
  buildCostContext,
  channelResult,
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
import type {
  ErpChannel,
  ErpDish,
  ErpProduct,
  ErpRecipe,
  ErpStockRow,
  ErpVenuePrice,
} from "./types";

export { DEFAULT_MENU_PRICE_SOURCE, type MenuPriceSource };

export function menuCostContext(
  state: { products: CostProduct[]; recipes: CostRecipe[]; costSources?: Iterable<ProductCostQuoteInput> },
  priceSource: MenuPriceSource = DEFAULT_MENU_PRICE_SOURCE,
  explodeRecipes = true,
): CostContext {
  return buildCostContext(state.products, state.recipes, {
    quotes: state.costSources,
    priceSource,
    explodeRecipes,
  });
}

export type DishCost = {
  summary: CostSummary;
  channels: ChannelResult[];
  main: ChannelResult | null;
};

export type VenueOffer = { visible: boolean; price: number | null };

/**
 * Empty `venue_prices` = visible everywhere at the card price (existing dishes/goods).
 * Once any venue row exists, missing venue ids are hidden (explicit availability).
 */
export function venueOffer(
  card: { sale_price?: number | null; venue_prices?: ErpVenuePrice[] },
  venueId?: string | null,
): VenueOffer {
  if (!venueId) return { visible: true, price: asMoney(card.sale_price) };
  const rows = card.venue_prices ?? [];
  if (rows.length === 0) return { visible: true, price: asMoney(card.sale_price) };
  const row = rows.find((item) => item.venue_id === venueId);
  if (!row) return { visible: false, price: null };
  return { visible: row.visible, price: asMoney(row.sale_price) ?? asMoney(card.sale_price) };
}

export function visibleAtVenue<T extends { venue_prices?: ErpVenuePrice[] }>(items: T[], venueId?: string | null): T[] {
  if (!venueId) return items;
  return items.filter((item) => venueOffer(item, venueId).visible);
}

export function dishCost(
  ctx: CostContext,
  dish: Pick<ErpDish, "lines" | "sale_price" | "vat_rate" | "channel_prices"> & { venue_prices?: ErpVenuePrice[] },
  settings: PricingSettings,
  channels: ErpChannel[],
  venueId?: string | null,
): DishCost {
  const lines = dish.lines.filter((line) => line.product_id && line.qty).map((line) => costLine(ctx, line.product_id, line.qty));
  const summary = summarize(lines);
  const cardPrice = venueOffer(dish, venueId).price;
  const results = channels
    .filter((channel) => !channel.archived_at)
    .map((channel) =>
      channelResult(
        summary,
        {
          id: channel.id,
          name: channel.name,
          commission_pct: channel.commission_pct,
          price: dish.channel_prices.find((price) => price.channel_id === channel.id)?.sale_price ?? cardPrice,
        },
        settings,
        dish.vat_rate,
      ),
    );
  const directId = channels.find((channel) => channel.code === "direct")?.id;
  return { summary, channels: results, main: results.find((channel) => channel.id === directId) ?? results[0] ?? null };
}

/** Poster Товары: resale SKU, never explode a recipe even if type=finished has one. */
export function goodsCost(
  ctx: CostContext,
  product: Pick<ErpProduct, "id" | "sale_price" | "vat_rate" | "venue_prices">,
  settings: PricingSettings,
  channels: ErpChannel[],
  venueId?: string | null,
): DishCost {
  const asSku: CostContext = { ...ctx, explodeRecipes: false };
  const summary = summarize([costLine(asSku, product.id, 1)]);
  const price = venueOffer({ sale_price: product.sale_price ?? null, venue_prices: product.venue_prices }, venueId).price;
  const results = channels
    .filter((channel) => !channel.archived_at)
    .map((channel) =>
      channelResult(
        summary,
        { id: channel.id, name: channel.name, commission_pct: channel.commission_pct, price },
        settings,
        product.vat_rate ?? null,
      ),
    );
  const directId = channels.find((channel) => channel.code === "direct")?.id;
  return { summary, channels: results, main: results.find((channel) => channel.id === directId) ?? results[0] ?? null };
}

export function catalogUsage(
  state: { dishes: ErpDish[]; recipes: ErpRecipe[] },
  productId: string,
): { dishes: ErpDish[]; recipes: ErpRecipe[] } {
  return {
    dishes: state.dishes.filter((dish) => dish.lines.some((line) => line.product_id === productId)),
    recipes: state.recipes.filter((recipe) => recipe.lines.some((line) => line.product_id === productId)),
  };
}

/** Poster ingredient-category columns: count + remaining-stock value. Unknown cost stays null. */
export function ingredientCategoryStats(
  categoryId: string,
  products: Pick<ErpProduct, "id" | "ingredient_category_id" | "archived_at">[],
  stock: ErpStockRow[],
): { ingredientCount: number; remainingValue: number | null } {
  const ids = new Set(
    products.filter((product) => product.ingredient_category_id === categoryId && !product.archived_at).map((product) => product.id),
  );
  const rows = stock.filter((row) => ids.has(row.product_id));
  const complete = rows.every((row) => row.cost_known);
  return {
    ingredientCount: ids.size,
    remainingValue: complete ? rows.reduce((sum, row) => sum + (row.known_value ?? 0), 0) : null,
  };
}

/** Recipes that output this product, newest version first. History of a prep card. */
export function recipeHistory(recipes: ErpRecipe[], productId: string): ErpRecipe[] {
  return recipes.filter((recipe) => recipe.product_id === productId).sort((a, b) => b.version - a.version);
}
