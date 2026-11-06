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
 * There is no 4th source «all deliveries average». Poster KB remaining-stock average
 * (стоимость остатка / количество) is `fifo_remaining`. Poster «нет поставок → 0» is
 * rejected: unknown stays null.
 *
 * Preps (semi_finished / finished with an active recipe) are exploded into ingredients.
 * The prep's own warehouse lots are NOT added on top — that would double-count the same
 * goods as both produced stock and recipe inputs. Set explodeRecipes=false to value a
 * produced prep as one SKU from last_lot / fifo_remaining / reference instead.
 *
 * Line qty is GROSS (taken from stock). Processing losses change net weight, not cost:
 * you pay for what left the warehouse. Cost = unitCost × gross qty.
 *
 * Sale / markup / food-cost (VND). `price` is the menu price as shown (gross of output VAT
 * when output VAT is enabled):
 *   vatRate      = dish.vat_rate ?? settings.default_output_vat_rate   (0 when output VAT is off)
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
  return {
    products: new Map(products.map((product) => [product.id, product])),
    activeRecipes: new Map(recipes.filter((recipe) => recipe.status === "active").map((recipe) => [recipe.product_id, recipe])),
    quotes: quotesFromRows(options?.quotes),
    priceSource: options?.priceSource ?? DEFAULT_MENU_PRICE_SOURCE,
    explodeRecipes: options?.explodeRecipes !== false,
  };
}

/** Processing methods with a weight loss, as in Poster. Line qty is gross (taken from stock). */
export const LOSS_METHODS = ["clean", "boil", "fry", "stew", "bake"] as const;
export type LossMethod = (typeof LOSS_METHODS)[number];
export type LossPcts = { [M in LossMethod as `loss_${M}_pct`]?: number | null };

export const lossPct = (product: LossPcts | undefined, method: LossMethod) => Number(product?.[`loss_${method}_pct`] ?? 0);

/** Share of the gross weight left after all chosen methods (1 = no loss). */
export const netFactor = (product: LossPcts | undefined, methods: readonly LossMethod[] = []) =>
  methods.reduce((factor, method) => factor * (1 - lossPct(product, method) / 100), 1);

export const roundQty = (value: number) => Math.round(value * 1e6) / 1e6;

export const isPackaging = (type: ErpProductType) => type === "packaging" || type === "consumable";

export const productLabel = (product: Pick<CostProduct, "name_en" | "name_vn">) =>
  product.name_vn && product.name_vn !== product.name_en ? `${product.name_en} / ${product.name_vn}` : product.name_en;

/** Name with the brand: items that differ only by brand are separate products. */
export const productTitle = (product: Pick<CostProduct, "name_en" | "name_vn"> & { brand?: string | null }) =>
  product.brand?.trim() ? `${productLabel(product)} · ${product.brand.trim()}` : productLabel(product);

function leafPrice(ctx: CostContext, product: CostProduct): { unitCost: number | null; source: CostSource | null } {
  const quote = ctx.quotes.get(product.id);
  if (ctx.priceSource === "last_lot") {
    const unitCost = quote ? asMoney(quote.last_lot) : null;
    return { unitCost, source: unitCost === null ? null : "last_lot" };
  }
  if (ctx.priceSource === "fifo_remaining") {
    const unitCost = quote ? asMoney(quote.fifo_remaining) : null;
    return { unitCost, source: unitCost === null ? null : "fifo_remaining" };
  }
  const unitCost = quote ? asMoney(quote.reference) : asMoney(product.est_unit_cost);
  if (unitCost === null) return { unitCost: null, source: null };
  return { unitCost, source: product.est_cost_source ?? "manual" };
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

  const recipe = ctx.explodeRecipes ? ctx.activeRecipes.get(productId) : undefined;
  if (recipe && recipe.yield_qty) {
    const scale = qty / recipe.yield_qty;
    const children = recipe.lines.map((line) =>
      line.product_id && line.qty
        ? costLine(ctx, line.product_id, line.qty * scale, [...stack, productId])
        : { ...base, name: "?", qty: 0, children: undefined, issue: "unresolved" as const },
    );
    const known = children.every((child) => child.cost !== null);
    const cost = known ? children.reduce((sum, child) => sum + (child.cost ?? 0), 0) : null;
    return {
      ...base,
      children,
      source: "recipe",
      cost,
      unitCost: cost === null || qty === 0 ? null : cost / qty,
      issue: known ? undefined : "no_recipe_price",
    };
  }

  const quoted = leafPrice(ctx, product);
  if (quoted.unitCost === null) return { ...base, issue: "no_price" };
  return {
    ...base,
    unitCost: quoted.unitCost,
    cost: quoted.unitCost * qty,
    source: quoted.source,
  };
}

/** Planned cost of one base unit (per kg / l / pcs). */
export function plannedUnitCost(ctx: CostContext, productId: string): number | null {
  return costLine(ctx, productId, 1).unitCost;
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
    vatRate = dishVatRate ?? settings.default_output_vat_rate;
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
