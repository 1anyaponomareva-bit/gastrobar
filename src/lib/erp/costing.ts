/**
 * Planned costing for recipes and menu dishes. Pure functions over ERP rows.
 *
 * Price basis: inventory cost is net of recoverable input VAT (when input VAT is on),
 * otherwise what was paid. Revenue is the menu price minus output VAT (when output VAT
 * is on). Platform commission is a share of the menu price. Unknown costs are never
 * zero: a calculation with any unknown part is marked incomplete and its totals are null.
 */

export type ErpUnit = "kg" | "l" | "pcs";
export type ErpProductType = "ingredient" | "semi_finished" | "finished" | "packaging" | "consumable";

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

export type CostSource = "receipt" | "manual" | "recipe";

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
};

export function buildCostContext(products: CostProduct[], recipes: CostRecipe[]): CostContext {
  return {
    products: new Map(products.map((product) => [product.id, product])),
    activeRecipes: new Map(recipes.filter((recipe) => recipe.status === "active").map((recipe) => [recipe.product_id, recipe])),
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

/** Cost of `qty` base units of a product with its composition. */
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

  if (product.est_unit_cost === null) return { ...base, issue: "no_price" };
  return {
    ...base,
    unitCost: product.est_unit_cost,
    cost: product.est_unit_cost * qty,
    source: product.est_cost_source ?? "manual",
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
  totalCostPct: number | null;
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

  const netRevenue = price !== null && vatRate !== null ? price / (1 + vatRate / 100) : null;
  const vat = price !== null && netRevenue !== null ? price - netRevenue : null;
  const commission = price !== null && channel.commission_pct !== null ? (price * channel.commission_pct) / 100 : null;
  const ratio = (value: number | null) => (value !== null && netRevenue ? (value / netRevenue) * 100 : null);
  const grossProfit =
    netRevenue !== null && commission !== null && summary.totalCost !== null ? netRevenue - commission - summary.totalCost : null;

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
    totalCostPct: ratio(summary.totalCost),
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
