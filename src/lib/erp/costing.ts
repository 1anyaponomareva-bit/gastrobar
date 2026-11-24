/**
 * Planned costing for recipes and menu dishes. Pure functions over ERP rows.
 *
 * Price basis: inventory cost is net of recoverable input VAT (when input VAT is on),
 * otherwise what was paid. Revenue is the menu price minus output VAT (when output VAT
 * is on). Platform commission is a share of the menu price. Unknown costs are never
 * zero: a calculation with any unknown part is marked incomplete and its totals are null.
 *
 * Tech-card (menu) price sources — pick one, do not mix on a line:
 *   reference      — product.est_unit_cost (last posted receipt net, or a manual card price).
 *                    DEFAULT for tech-cards: stable planned cost, not a live warehouse average.
 *   last_lot       — unit_cost of the newest posted lot (any remaining qty), all warehouses.
 *                    If that lot's cost is unknown → null (never 0, never skip to an older lot).
 *   fifo_remaining — Σ(qty_left × unit_cost) / Σ(qty_left) of remaining lots.
 *                    Any remaining unknown lot, or no remaining qty → null (never 0).
 *
 * Write-off / production posting still uses FIFO in erp_consume. These sources are display
 * and planned food-cost only; they do not change lots or posted documents.
 *
 * Preps (semi_finished / finished with an active recipe) are exploded into ingredients.
 * The prep's own warehouse lots are NOT added on top — that would double-count the same
 * goods as both produced stock and recipe inputs. Set explodeRecipes=false to value a
 * produced prep as one SKU from last_lot / fifo_remaining / reference instead.
 *
 * Line qty is GROSS (taken from stock). Processing losses are sequential on remaining
 * weight, not a sum of percents: usableWeight = purchaseWeight × Π (1 − pct_i/100)
 * in thaw → clean → boil → fry → stew → bake order. Cost of 1 kg usable product is
 * purchaseCost / usableWeight. Line food cost of the take is still purchaseCost of
 * the gross (same as finalCostPerKg × net).
 *
 * Sale / markup / food-cost (VND). `price` is the menu price as shown (gross of output VAT
 * when output VAT is enabled):
 *   vatRate      = dish.vat_rate ?? settings.default_output_vat_rate ?? 8   (0 when output VAT is off)
 *   netRevenue   = price / (1 + vatRate/100)
 *   vat          = price − netRevenue
 *   commission   = price × commission_pct / 100
 *   foodCost     = Σ food lines (packaging/consumable excluded); null if any food line unknown
 *   totalCost    = foodCost + packagingCost; null if any line unknown
 *   foodCostPct  = foodCost / netRevenue × 100
 *   foodCostOnPricePct = foodCost / price × 100   (Poster KB: food cost = cost / sale price)
 *   totalCostPct = totalCost / netRevenue × 100
 *   markupPct    = (netRevenue − totalCost) / totalCost × 100     (null if totalCost is 0 or null)
 *   foodMarkupPct= (netRevenue − foodCost) / foodCost × 100       (null if foodCost is 0 or null)
 *   grossProfit  = netRevenue − commission − totalCost
 *   grossMarginPct = grossProfit / netRevenue × 100
 */

import { productLabel } from "./productName";
import { DEFAULT_VAT_RATE } from "./vat";
export { liveCatalogName, productLabel, productTitle } from "./productName";

export type ErpUnit = "kg" | "l" | "pcs";
export type ErpProductType = "ingredient" | "semi_finished" | "finished" | "packaging" | "consumable";

/** How a tech-card line is priced. FIFO write-off method is unchanged (`erp_consume`). */
export type MenuPriceSource = "last_lot" | "fifo_remaining" | "reference";

/** Default tech-card source: the product card's estimated cost, not remaining-lot FIFO. */
export const DEFAULT_MENU_PRICE_SOURCE: MenuPriceSource = "reference";

export type CostProduct = {
  id: string;
  type: ErpProductType;
  name_en: string;
  name_vn: string;
  base_unit: ErpUnit | null;
  est_unit_cost: number | null;
  est_cost_source: "receipt" | "manual" | null;
};

export type CostRecipe = {
  id: string;
  product_id: string;
  status: "draft" | "active" | "archived";
  yield_qty: number | null;
  lines: { product_id: string | null; qty: number | null }[];
};

export type CostSource = "receipt" | "manual" | "recipe" | "last_lot" | "fifo_remaining" | "reference";

export type ProductCostQuote = {
  product_id: string;
  last_lot: number | null;
  fifo_remaining: number | null;
  reference: number | null;
};

export type CostLine = {
  productId: string;
  name: string;
  unit: ErpUnit | null;
  qty: number;
  packaging: boolean;
  unitCost: number | null;
  cost: number | null;
  source: CostSource | null;
  /** Why the cost is unknown. */
  issue?: "no_price" | "no_recipe_price" | "cycle" | "unresolved";
  /** Composition of a semi-finished product, scaled to this line. */
  children?: CostLine[];
};

export type CostContext = {
  products: Map<string, CostProduct>;
  /** Active recipe per output product. */
  activeRecipes: Map<string, CostRecipe>;
  quotes: Map<string, ProductCostQuote>;
  priceSource: MenuPriceSource;
  /**
   * When true (default), an active recipe with yield_qty is exploded and the parent
   * product's lots are ignored. When false, the parent is valued as one SKU.
   */
  explodeRecipes: boolean;
};

export type ProductCostQuoteInput = {
  product_id: string;
  last_lot?: unknown;
  fifo_remaining?: unknown;
  reference?: unknown;
};

export type CostContextOptions = {
  quotes?: Iterable<ProductCostQuoteInput>;
  priceSource?: MenuPriceSource;
  explodeRecipes?: boolean;
};

/** JSON/numeric from Postgres may be a string; 0 is a known price, never coerced to null. */
export function asMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quotesFromRows(rows: Iterable<ProductCostQuoteInput> | null | undefined): Map<string, ProductCostQuote> {
  const quotes = new Map<string, ProductCostQuote>();
  if (!rows) return quotes;
  for (const row of rows) {
    quotes.set(row.product_id, {
      product_id: row.product_id,
      last_lot: asMoney(row.last_lot),
      fifo_remaining: asMoney(row.fifo_remaining),
      reference: asMoney(row.reference),
    });
  }
  return quotes;
}

export function buildCostContext(products: CostProduct[], recipes: CostRecipe[], options?: CostContextOptions): CostContext {
  // Prefer the active card; if none, use a draft so nested prep SKUs still get a planned cost.
  const activeRecipes = new Map<string, CostRecipe>();
  for (const recipe of recipes) {
    if (recipe.status === "active") activeRecipes.set(recipe.product_id, recipe);
  }
  for (const recipe of recipes) {
    if (recipe.status === "draft" && !activeRecipes.has(recipe.product_id)) {
      activeRecipes.set(recipe.product_id, recipe);
    }
  }
  return {
    products: new Map(
      products.map((product) => [product.id, { ...product, est_unit_cost: asMoney(product.est_unit_cost) }]),
    ),
    activeRecipes,
    quotes: quotesFromRows(options?.quotes),
    priceSource: options?.priceSource ?? DEFAULT_MENU_PRICE_SOURCE,
    explodeRecipes: options?.explodeRecipes !== false,
  };
}

/** Processing methods with a weight loss, as in Poster (thaw/defrost before clean). Line qty is gross (taken from stock). */
export const LOSS_METHODS = ["defrost", "clean", "boil", "fry", "stew", "bake"] as const;
export type LossMethod = (typeof LOSS_METHODS)[number];
export type LossPcts = { [M in LossMethod as `loss_${M}_pct`]?: number | null };

export const lossPct = (product: LossPcts | undefined, method: LossMethod) => Number(product?.[`loss_${method}_pct`] ?? 0);

/**
 * Remaining share of purchase weight after sequential stages (1 = no loss).
 * Each next percent applies to what is left, in thaw → clean → … order.
 * 1 kg, 10% thaw, 20% clean → 0.9 × 0.8 = 0.72, not 1 − 0.10 − 0.20 = 0.70.
 * Unselected or 0% stages multiply by 1.
 */
export const netFactor = (product: LossPcts | undefined, methods: readonly LossMethod[] = []) => {
  const chosen = new Set(methods);
  return LOSS_METHODS.reduce(
    (factor, method) => (chosen.has(method) ? factor * (1 - lossPct(product, method) / 100) : factor),
    1,
  );
};

/** Remaining kg/l after sequential losses: purchaseWeight × Π (1 − pct_i/100). */
export function usableWeight(
  purchaseWeight: number,
  product: LossPcts | undefined,
  methods: readonly LossMethod[] = [],
): number {
  return purchaseWeight * netFactor(product, methods);
}

/**
 * Cost of 1 kg (or 1 l) of usable product.
 * `purchaseCost` is the cost of the purchaseWeight that produced `usable`.
 * Zero or missing usable weight stays null (never divide by zero).
 */
export function finalCostPerKg(purchaseCost: number | null, usable: number): number | null {
  if (purchaseCost === null || !Number.isFinite(purchaseCost) || !(usable > 0)) return null;
  return purchaseCost / usable;
}

/** Purchase unit cost converted to cost per 1 usable unit after the chosen stages. */
export function processedUnitCost(
  purchaseUnitCost: number | null,
  product: LossPcts | undefined,
  methods: readonly LossMethod[] = [],
): number | null {
  return finalCostPerKg(purchaseUnitCost, netFactor(product, methods));
}

export const roundQty = (value: number) => Math.round(value * 1e6) / 1e6;

export const isPackaging = (type: ErpProductType) => type === "packaging" || type === "consumable";

function leafPrice(ctx: CostContext, product: CostProduct): { unitCost: number | null; source: CostSource | null } {
  const quote = ctx.quotes.get(product.id);
  const reference = asMoney(quote?.reference) ?? asMoney(product.est_unit_cost);
  const lastLot = asMoney(quote?.last_lot);
  const fifo = asMoney(quote?.fifo_remaining);
  if (ctx.priceSource === "last_lot") {
    return lastLot == null ? { unitCost: null, source: null } : { unitCost: lastLot, source: "last_lot" };
  }
  if (ctx.priceSource === "fifo_remaining") {
    return fifo == null ? { unitCost: null, source: null } : { unitCost: fifo, source: "fifo_remaining" };
  }
  if (reference != null) return { unitCost: reference, source: product.est_cost_source ?? "manual" };
  if (lastLot != null) return { unitCost: lastLot, source: "last_lot" };
  if (fifo != null) return { unitCost: fifo, source: "fifo_remaining" };
  return { unitCost: null, source: null };
}

/**
 * Cost of `qty` base units of a product with its composition.
 * `qty` is the recipe/dish GROSS amount (stock take), not net after losses.
 * Recipe scale: childQty = line.qty × (requestedQty / yield_qty).
 */
export function costLine(ctx: CostContext, productId: string, qty: number, stack: string[] = []): CostLine {
  const product = ctx.products.get(productId);
  if (!product) {
    return { productId, name: "?", unit: null, qty, packaging: false, unitCost: null, cost: null, source: null, issue: "unresolved" };
  }
  const base: CostLine = {
    productId,
    name: productLabel(product),
    unit: product.base_unit,
    qty,
    packaging: isPackaging(product.type),
    unitCost: null,
    cost: null,
    source: null,
  };
  if (stack.includes(productId)) return { ...base, issue: "cycle" };

  const recipe = ctx.activeRecipes.get(productId);
  const recipeYield = asMoney(recipe?.yield_qty);
  const canExplode = Boolean(recipe && recipeYield && recipeYield > 0);

  const explode = (): CostLine => {
    const scale = qty / (recipeYield as number);
    const children = (recipe as CostRecipe).lines.map((line) => {
      const childQty = asMoney(line.qty);
      return line.product_id && childQty != null
        ? costLine(ctx, line.product_id, childQty * scale, [...stack, productId])
        : { ...base, name: "?", qty: 0, children: undefined, issue: "unresolved" as const };
    });
    let sum = 0;
    let priced = 0;
    let complete = true;
    for (const child of children) {
      if (child.cost === null || child.issue) complete = false;
      if (child.cost === null) continue;
      priced += 1;
      sum += child.cost;
    }
    // Keep the sum of known children so parents (e.g. 2-pack) still show an approximate cost.
    const cost = priced > 0 || complete ? sum : null;
    return {
      ...base,
      children,
      source: "recipe",
      cost,
      unitCost: cost === null || qty === 0 ? null : cost / qty,
      issue: complete ? undefined : "no_recipe_price",
    };
  };

  // Menu / tech-card: explode preps into ingredients (do not also add the prep's own lots).
  if (ctx.explodeRecipes && canExplode) return explode();

  // Prep composition / stock SKU view: prefer card or lot price.
  const quoted = leafPrice(ctx, product);
  if (quoted.unitCost !== null) {
    return {
      ...base,
      unitCost: quoted.unitCost,
      cost: quoted.unitCost * qty,
      source: quoted.source,
    };
  }

  // Nested prep with no card/lot price yet: use its active recipe planned cost.
  if (!ctx.explodeRecipes && canExplode) return explode();

  return { ...base, issue: "no_price" };
}

/** Planned cost of one base unit (per kg / l / pcs). */
export function plannedUnitCost(ctx: CostContext, productId: string): number | null {
  return costLine(ctx, productId, 1).unitCost;
}

/** Gross take for a composition line. 0 is a real amount; empty stays null. Falls back to typed net. */
export function compositionLineQty(line: {
  product_id?: string | null;
  qty?: unknown;
  net_qty?: unknown;
}): number | null {
  if (!line.product_id) return null;
  const qty = asMoney(line.qty);
  if (qty != null) return qty;
  return asMoney(line.net_qty);
}

export type YieldCostEstimate = {
  /** Sum of priced gross lines only. Null when there is nothing to cost. */
  amount: number | null;
  /** False when at least one linked line has qty but no price. */
  complete: boolean;
};

/**
 * Cost of the recipe/dish yield: sum of GROSS line costs (stock take).
 * Cut parts split the same net and are not extra purchases.
 * Unknown prices make the whole yield cost incomplete. Typed 0 is a known cost.
 */
export function compositionYieldCost(
  ctx: CostContext,
  lines: readonly { product_id: string | null | undefined; qty?: unknown; net_qty?: unknown }[],
): number | null {
  const estimate = compositionYieldCostEstimate(ctx, lines);
  return estimate.complete ? estimate.amount : null;
}

/**
 * Same as compositionYieldCost, but keeps the sum of known prices when some lines are unpriced.
 * UI can show that amount in red as an approximate cost.
 */
export function compositionYieldCostEstimate(
  ctx: CostContext,
  lines: readonly { product_id: string | null | undefined; qty?: unknown; net_qty?: unknown }[],
): YieldCostEstimate {
  const ready = lines
    .map((line) => ({ productId: line.product_id, qty: compositionLineQty(line) }))
    .filter((line): line is { productId: string; qty: number } => Boolean(line.productId) && line.qty != null);
  if (!ready.length) return { amount: null, complete: true };
  let sum = 0;
  let priced = 0;
  let complete = true;
  for (const line of ready) {
    const pricedLine = costLine(ctx, line.productId, line.qty);
    if (pricedLine.cost === null || pricedLine.issue) complete = false;
    if (pricedLine.cost === null) continue;
    priced += 1;
    sum += pricedLine.cost;
  }
  if (!priced && !complete) return { amount: 0, complete: false };
  return { amount: sum, complete };
}

/**
 * Value listed components as warehouse SKUs first.
 * If a nested prep has no card/lot price, costLine still falls back to its active recipe.
 */
export function stockCostContext(ctx: CostContext): CostContext {
  return { ...ctx, explodeRecipes: false };
}

/** Prep composition: card/lot prices; nested preps without a SKU price use their active recipe. */
export function prepCompositionCostContext(
  products: CostProduct[],
  recipes: CostRecipe[],
  quotes?: Iterable<ProductCostQuoteInput>,
): CostContext {
  return stockCostContext(buildCostContext(products, recipes, { quotes }));
}

/**
 * Planned cost of one output unit from this card: sum of direct component SKU costs / yield.
 * Nested preps use their stock/reference price, not a second explosion of their own recipe.
 */
export function recipeYieldUnitCost(ctx: CostContext, recipe: CostRecipe): number | null {
  const estimate = recipeYieldUnitCostEstimate(ctx, recipe);
  return estimate.complete ? estimate.amount : null;
}

/** Unit cost that still returns a partial sum when some ingredient prices are missing. */
export function recipeYieldUnitCostEstimate(ctx: CostContext, recipe: CostRecipe): YieldCostEstimate {
  const yieldQty = asMoney(recipe.yield_qty);
  if (yieldQty == null || yieldQty <= 0) return { amount: null, complete: true };
  const total = compositionYieldCostEstimate(stockCostContext(ctx), recipe.lines);
  if (total.amount === null) return total;
  return { amount: total.amount / yieldQty, complete: total.complete };
}

export type CostSummary = {
  lines: CostLine[];
  knownFood: number;
  knownPackaging: number;
  foodCost: number | null;
  packagingCost: number | null;
  totalCost: number | null;
  complete: boolean;
  missing: string[];
};

export function summarize(lines: CostLine[]): CostSummary {
  const missing: string[] = [];
  const collect = (line: CostLine) => {
    if (line.children) line.children.forEach(collect);
    else if (line.cost === null) missing.push(line.name);
  };
  lines.forEach(collect);
  const known = (packaging: boolean) =>
    lines.filter((line) => line.packaging === packaging).reduce((sum, line) => sum + (line.cost ?? 0), 0);
  const groupComplete = (packaging: boolean) => lines.filter((line) => line.packaging === packaging).every((l) => l.cost !== null);
  const foodComplete = groupComplete(false);
  const packagingComplete = groupComplete(true);
  const knownFood = known(false);
  const knownPackaging = known(true);
  return {
    lines,
    knownFood,
    knownPackaging,
    foodCost: foodComplete ? knownFood : null,
    packagingCost: packagingComplete ? knownPackaging : null,
    totalCost: foodComplete && packagingComplete ? knownFood + knownPackaging : null,
    complete: foodComplete && packagingComplete,
    missing: [...new Set(missing)],
  };
}

export type PricingSettings = {
  output_vat_enabled: boolean;
  default_output_vat_rate: number | null;
};

export type ChannelInput = { id: string; name: string; commission_pct: number | null; price: number | null };

export type ChannelResult = {
  id: string;
  name: string;
  price: number | null;
  vatRate: number | null;
  vat: number | null;
  netRevenue: number | null;
  commissionPct: number | null;
  commission: number | null;
  foodCostPct: number | null;
  /** Poster: foodCost / sale price × 100. Distinct from foodCostPct (over netRevenue). */
  foodCostOnPricePct: number | null;
  totalCostPct: number | null;
  markupPct: number | null;
  foodMarkupPct: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
  complete: boolean;
  issues: ("no_price" | "no_vat_rate" | "no_commission" | "incomplete_cost")[];
};

export function channelResult(
  summary: CostSummary,
  channel: ChannelInput,
  settings: PricingSettings,
  dishVatRate: number | null,
): ChannelResult {
  const issues: ChannelResult["issues"] = [];
  const price = channel.price;
  if (price === null) issues.push("no_price");
  let vatRate: number | null = 0;
  if (settings.output_vat_enabled) {
    vatRate = dishVatRate ?? settings.default_output_vat_rate ?? DEFAULT_VAT_RATE;
    if (vatRate === null) issues.push("no_vat_rate");
  }
  if (channel.commission_pct === null) issues.push("no_commission");
  if (!summary.complete) issues.push("incomplete_cost");

  // netRevenue = price / (1 + vatRate/100); vatRate is 0 when output VAT is off.
  const netRevenue = price !== null && vatRate !== null ? price / (1 + vatRate / 100) : null;
  const vat = price !== null && netRevenue !== null ? price - netRevenue : null;
  // commission = price × commission_pct / 100 (share of the menu price, not of netRevenue).
  const commission = price !== null && channel.commission_pct !== null ? (price * channel.commission_pct) / 100 : null;
  const ratio = (value: number | null) => (value !== null && netRevenue ? (value / netRevenue) * 100 : null);
  const grossProfit =
    netRevenue !== null && commission !== null && summary.totalCost !== null ? netRevenue - commission - summary.totalCost : null;
  // markupPct = (netRevenue − totalCost) / totalCost × 100. Unknown and zero cost stay null.
  const markupPct =
    netRevenue !== null && summary.totalCost !== null && summary.totalCost > 0
      ? ((netRevenue - summary.totalCost) / summary.totalCost) * 100
      : null;
  const foodMarkupPct =
    netRevenue !== null && summary.foodCost !== null && summary.foodCost > 0
      ? ((netRevenue - summary.foodCost) / summary.foodCost) * 100
      : null;

  return {
    id: channel.id,
    name: channel.name,
    price,
    vatRate: settings.output_vat_enabled ? vatRate : null,
    vat,
    netRevenue,
    commissionPct: channel.commission_pct,
    commission,
    foodCostPct: ratio(summary.foodCost),
    foodCostOnPricePct:
      summary.foodCost !== null && price !== null && price !== 0 ? (summary.foodCost / price) * 100 : null,
    totalCostPct: ratio(summary.totalCost),
    markupPct,
    foodMarkupPct,
    grossProfit,
    grossMarginPct: ratio(grossProfit),
    complete: issues.length === 0,
    issues,
  };
}

export const roundMoney = (value: number) => Math.round(value);
export const roundPct = (value: number) => Math.round(value * 10) / 10;

export function formatVnd(value: number | null): string {
  return value === null ? "—" : `${roundMoney(value).toLocaleString("en-US")} ₫`;
}
export function formatPct(value: number | null): string {
  return value === null ? "—" : `${roundPct(value).toFixed(1)}%`;
}
export function formatQty(value: number | null, unit?: string | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
}
