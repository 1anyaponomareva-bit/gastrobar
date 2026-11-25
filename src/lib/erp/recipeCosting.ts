/**
 * Phase 8F — Recipe costing & financial integration helpers.
 *
 * Extends existing costing.ts / financialCalculator.ts / dishChannelFinance.ts.
 * Does NOT replace FIFO consume, historical sales cost, or P&L.
 *
 * Forecast (tech-card) cost ≠ actual consumption cost from posted FIFO allocations.
 */

import {
  asMoney,
  buildCostContext,
  costLine,
  DEFAULT_MENU_PRICE_SOURCE,
  finalCostPerKg,
  isPackaging,
  summarize,
  type CostLine,
  type CostProduct,
  type CostRecipe,
  type CostSummary,
  type MenuPriceSource,
  type ProductCostQuoteInput,
} from "./costing";
import { computeDishChannelFinance, type DishChannelOverrides } from "./dishChannelFinance";
import type { ErpChannel, ErpDish, ErpSettings } from "./types";

/** Centralized tech-card cost policy (settings.recipe_cost_source). */
export type RecipeCostSourcePolicy =
  | "manual_estimated"
  | "last_purchase"
  | "weighted_average"
  | "estimated_fifo";

export const DEFAULT_RECIPE_COST_SOURCE: RecipeCostSourcePolicy = "manual_estimated";

export const RECIPE_COST_SOURCE_LABELS: Record<RecipeCostSourcePolicy, string> = {
  manual_estimated: "Manual Estimated Cost",
  last_purchase: "Last Purchase Cost",
  weighted_average: "Weighted Average Inventory Cost",
  estimated_fifo: "Estimated FIFO Consumption Cost",
};

/** Map settings policy → existing MenuPriceSource used by costing.ts. */
export function recipeCostSourceToMenuPriceSource(policy: RecipeCostSourcePolicy | null | undefined): MenuPriceSource {
  switch (policy) {
    case "last_purchase":
      return "last_lot";
    case "weighted_average":
    case "estimated_fifo":
      return "fifo_remaining";
    case "manual_estimated":
    default:
      return DEFAULT_MENU_PRICE_SOURCE; // reference
  }
}

export function menuPriceSourceToRecipeCostSource(source: MenuPriceSource): RecipeCostSourcePolicy {
  switch (source) {
    case "last_lot":
      return "last_purchase";
    case "fifo_remaining":
      return "estimated_fifo";
    case "reference":
    default:
      return "manual_estimated";
  }
}

export function resolveRecipeCostSource(settings?: Pick<ErpSettings, "recipe_cost_source"> | null): RecipeCostSourcePolicy {
  const raw = settings?.recipe_cost_source;
  if (raw === "manual_estimated" || raw === "last_purchase" || raw === "weighted_average" || raw === "estimated_fifo") {
    return raw;
  }
  return DEFAULT_RECIPE_COST_SOURCE;
}

/** Cost conversion / completeness warnings (Phase 8F §13). */
export type RecipeCostWarning =
  | "missing_ingredient_cost"
  | "missing_unit_conversion"
  | "missing_usable_yield"
  | "pending_input_vat"
  | "incomplete_production_cost"
  | "outdated_estimated_cost"
  | "missing_channel_settings"
  | "below_minimum_margin"
  | "cost_conversion_incomplete"
  | "cycle_detected";

export type RecipeUnit = "kg" | "g" | "l" | "ml" | "pcs" | "pack" | "jar" | "box";

export type UnitConversionResult = {
  qtyInTarget: number | null;
  complete: boolean;
  warning: RecipeCostWarning | null;
};

/**
 * Convert quantity between compatible units.
 * Never converts volume ↔ mass without explicit density (returns incomplete).
 */
export function convertRecipeQty(
  qty: number,
  from: RecipeUnit,
  to: RecipeUnit,
  opts?: { weightPerPieceKg?: number | null; densityKgPerL?: number | null; packSize?: number | null },
): UnitConversionResult {
  if (!Number.isFinite(qty)) return { qtyInTarget: null, complete: false, warning: "cost_conversion_incomplete" };
  if (from === to) return { qtyInTarget: qty, complete: true, warning: null };

  const mass: Record<string, number> = { kg: 1, g: 0.001 };
  const vol: Record<string, number> = { l: 1, ml: 0.001 };

  if (from in mass && to in mass) {
    return { qtyInTarget: (qty * mass[from]) / mass[to], complete: true, warning: null };
  }
  if (from in vol && to in vol) {
    return { qtyInTarget: (qty * vol[from]) / vol[to], complete: true, warning: null };
  }

  // pcs ↔ mass when weight known
  if ((from === "pcs" || from === "jar") && to in mass) {
    const w = opts?.weightPerPieceKg;
    if (w == null || !(w > 0)) return { qtyInTarget: null, complete: false, warning: "missing_unit_conversion" };
    return { qtyInTarget: (qty * w) / mass[to], complete: true, warning: null };
  }
  if (from in mass && (to === "pcs" || to === "jar")) {
    const w = opts?.weightPerPieceKg;
    if (w == null || !(w > 0)) return { qtyInTarget: null, complete: false, warning: "missing_unit_conversion" };
    return { qtyInTarget: (qty * mass[from]) / w, complete: true, warning: null };
  }

  // pack/box ↔ pcs
  if ((from === "pack" || from === "box") && to === "pcs") {
    const n = opts?.packSize;
    if (n == null || !(n > 0)) return { qtyInTarget: null, complete: false, warning: "missing_unit_conversion" };
    return { qtyInTarget: qty * n, complete: true, warning: null };
  }
  if (from === "pcs" && (to === "pack" || to === "box")) {
    const n = opts?.packSize;
    if (n == null || !(n > 0)) return { qtyInTarget: null, complete: false, warning: "missing_unit_conversion" };
    return { qtyInTarget: qty / n, complete: true, warning: null };
  }

  // volume ↔ mass only with density
  if ((from in mass && to in vol) || (from in vol && to in mass)) {
    const d = opts?.densityKgPerL;
    if (d == null || !(d > 0)) return { qtyInTarget: null, complete: false, warning: "cost_conversion_incomplete" };
    if (from in mass && to in vol) {
      const kg = qty * mass[from];
      const liters = kg / d;
      return { qtyInTarget: liters / vol[to], complete: true, warning: null };
    }
    const liters = qty * vol[from];
    const kg = liters * d;
    return { qtyInTarget: kg / mass[to], complete: true, warning: null };
  }

  return { qtyInTarget: null, complete: false, warning: "cost_conversion_incomplete" };
}

export type UsablePackMetrics = {
  grossContentKg: number;
  netUsableKg: number;
  lossPercentage: number;
  usableYieldPercentage: number;
};

/** Jar/pack usable yield from gross content vs net usable weight. */
export function usablePackMetrics(grossContentKg: number, netUsableKg: number): UsablePackMetrics | null {
  if (!(grossContentKg > 0) || !(netUsableKg >= 0) || netUsableKg > grossContentKg) return null;
  const usableYieldPercentage = (netUsableKg / grossContentKg) * 100;
  return {
    grossContentKg,
    netUsableKg,
    lossPercentage: 100 - usableYieldPercentage,
    usableYieldPercentage,
  };
}

/**
 * Recipe cost from a purchase pack when the tech-card consumes usable weight.
 * Does NOT apply loss a second time: cost is purchase / net usable × recipe usable qty.
 */
export function recipeCostFromUsablePack(opts: {
  purchaseUnitCost: number | null;
  netUsableKg: number | null;
  recipeUsableKg: number;
}): { inventoryConsumptionUnits: number | null; costPerUsableKg: number | null; recipeCost: number | null; warning: RecipeCostWarning | null } {
  const purchase = asMoney(opts.purchaseUnitCost);
  const net = asMoney(opts.netUsableKg);
  if (purchase == null) return { inventoryConsumptionUnits: null, costPerUsableKg: null, recipeCost: null, warning: "missing_ingredient_cost" };
  if (net == null || !(net > 0)) {
    return { inventoryConsumptionUnits: null, costPerUsableKg: null, recipeCost: null, warning: "missing_usable_yield" };
  }
  const costPerUsableKg = finalCostPerKg(purchase, net);
  const inventoryConsumptionUnits = opts.recipeUsableKg / net;
  const recipeCost = costPerUsableKg == null ? null : costPerUsableKg * opts.recipeUsableKg;
  return { inventoryConsumptionUnits, costPerUsableKg, recipeCost, warning: null };
}

/** Cost of recipe qty in grams for a kg-based ingredient. */
export function recipeCostFromKg(opts: {
  unitCostPerKg: number | null;
  recipeGrams: number;
}): number | null {
  const unit = asMoney(opts.unitCostPerKg);
  if (unit == null) return null;
  return unit * (opts.recipeGrams / 1000);
}

/** Cost of one piece when purchase is per kg and weight per piece is known. */
export function pieceCostFromKg(opts: {
  unitCostPerKg: number | null;
  weightPerPieceKg: number | null;
}): number | null {
  const unit = asMoney(opts.unitCostPerKg);
  const w = asMoney(opts.weightPerPieceKg);
  if (unit == null || w == null || !(w > 0)) return null;
  return unit * w;
}

export type VatCostVariant = "full_deduction" | "pending_or_non_deductible" | "partial";

/** Effective unit cost under input-VAT deduction mode (forecast). */
export function effectiveUnitCostForVat(opts: {
  netUnitCost: number;
  vatRatePct: number;
  mode: VatCostVariant;
  partialDeductiblePct?: number;
}): number {
  const vat = opts.netUnitCost * (opts.vatRatePct / 100);
  if (opts.mode === "full_deduction") return opts.netUnitCost;
  if (opts.mode === "pending_or_non_deductible") return opts.netUnitCost + vat;
  const deductibleShare = Math.min(100, Math.max(0, opts.partialDeductiblePct ?? 50)) / 100;
  return opts.netUnitCost + vat * (1 - deductibleShare);
}

export type IngredientCostCard = {
  purchaseUnit: string | null;
  inventoryUnit: string | null;
  recipeUnit: string | null;
  grossWeightKg: number | null;
  netUsableWeightKg: number | null;
  weightPerPieceKg: number | null;
  lossPercentage: number | null;
  usableYieldPercentage: number | null;
  purchasePriceNet: number | null;
  purchaseVat: number | null;
  purchasePriceGross: number | null;
  vatDeductionStatus: string | null;
  effectiveInventoryCost: number | null;
  estimatedRecipeUnitCost: number | null;
  costSource: string | null;
  lastCostUpdate: string | null;
  warnings: RecipeCostWarning[];
};

export function buildIngredientCostCard(opts: {
  baseUnit: string | null;
  unitWeightKg?: number | null;
  unitNetWeightKg?: number | null;
  estUnitCost?: number | null;
  estCostSource?: string | null;
  estCostAt?: string | null;
  purchaseVatRate?: number | null;
  vatDeductionStatus?: string | null;
  effectiveInventoryUnitCost?: number | null;
  purchaseUnitLabel?: string | null;
}): IngredientCostCard {
  const gross = asMoney(opts.unitWeightKg);
  const net = asMoney(opts.unitNetWeightKg) ?? gross;
  const metrics = gross != null && net != null ? usablePackMetrics(gross, net) : null;
  const netPrice = asMoney(opts.estUnitCost);
  const vatRate = asMoney(opts.purchaseVatRate) ?? 0;
  const vat = netPrice == null ? null : netPrice * (vatRate / 100);
  const grossPrice = netPrice == null || vat == null ? null : netPrice + vat;
  const effective = asMoney(opts.effectiveInventoryUnitCost) ?? netPrice;
  const warnings: RecipeCostWarning[] = [];
  if (effective == null) warnings.push("missing_ingredient_cost");
  if (opts.baseUnit === "pcs" && (gross == null || !(gross > 0))) warnings.push("missing_unit_conversion");
  if (metrics && metrics.netUsableKg <= 0) warnings.push("missing_usable_yield");
  if (opts.vatDeductionStatus === "pending") warnings.push("pending_input_vat");

  return {
    purchaseUnit: opts.purchaseUnitLabel ?? opts.baseUnit,
    inventoryUnit: opts.baseUnit,
    recipeUnit: opts.baseUnit,
    grossWeightKg: gross,
    netUsableWeightKg: net,
    weightPerPieceKg: opts.baseUnit === "pcs" ? gross : null,
    lossPercentage: metrics?.lossPercentage ?? null,
    usableYieldPercentage: metrics?.usableYieldPercentage ?? null,
    purchasePriceNet: netPrice,
    purchaseVat: vat,
    purchasePriceGross: grossPrice,
    vatDeductionStatus: opts.vatDeductionStatus ?? null,
    effectiveInventoryCost: effective,
    estimatedRecipeUnitCost: effective,
    costSource: opts.estCostSource ?? null,
    lastCostUpdate: opts.estCostAt ?? null,
    warnings,
  };
}

export type RecipeLineCostView = {
  productId: string;
  name: string;
  recipeQuantity: number;
  recipeUnit: string | null;
  grossConsumption: number;
  netConsumption: number | null;
  lossPercentage: number | null;
  inventoryConsumptionQuantity: number;
  effectiveUnitCost: number | null;
  ingredientCost: number | null;
  costSource: string | null;
  vatStatus: string | null;
  packaging: boolean;
  issue?: CostLine["issue"];
  warnings: RecipeCostWarning[];
};

export function recipeLineCostView(
  line: CostLine,
  opts?: { netQty?: number | null; vatStatus?: string | null },
): RecipeLineCostView {
  const warnings: RecipeCostWarning[] = [];
  if (line.cost === null || line.issue === "no_price") warnings.push("missing_ingredient_cost");
  if (line.issue === "cycle") warnings.push("cycle_detected");
  if (opts?.vatStatus === "pending") warnings.push("pending_input_vat");
  const net = asMoney(opts?.netQty);
  const loss =
    net != null && line.qty > 0 && net <= line.qty ? ((line.qty - net) / line.qty) * 100 : null;
  return {
    productId: line.productId,
    name: line.name,
    recipeQuantity: line.qty,
    recipeUnit: line.unit,
    grossConsumption: line.qty,
    netConsumption: net,
    lossPercentage: loss,
    inventoryConsumptionQuantity: line.qty,
    effectiveUnitCost: line.unitCost,
    ingredientCost: line.cost,
    costSource: line.source,
    vatStatus: opts?.vatStatus ?? null,
    packaging: line.packaging,
    issue: line.issue,
    warnings,
  };
}

export type DishRecipeCostBlock = {
  foodCost: number | null;
  packagingCost: number | null;
  totalProductCost: number | null;
  costSource: RecipeCostSourcePolicy;
  lastCalculation: string;
  costCompleteness: "complete" | "partial" | "unknown";
  warnings: RecipeCostWarning[];
  lines: RecipeLineCostView[];
  summary: CostSummary;
};

export function buildDishRecipeCostBlock(opts: {
  summary: CostSummary;
  policy: RecipeCostSourcePolicy;
  lineViews?: RecipeLineCostView[];
  pendingVatProductIds?: Set<string>;
}): DishRecipeCostBlock {
  const warnings: RecipeCostWarning[] = [];
  if (!opts.summary.complete) warnings.push("missing_ingredient_cost");
  if (opts.pendingVatProductIds?.size) warnings.push("pending_input_vat");
  for (const line of opts.summary.lines) {
    if (line.issue === "cycle") warnings.push("cycle_detected");
  }
  const completeness: DishRecipeCostBlock["costCompleteness"] = opts.summary.complete
    ? "complete"
    : opts.summary.knownFood > 0 || opts.summary.knownPackaging > 0
      ? "partial"
      : "unknown";
  return {
    foodCost: opts.summary.foodCost,
    packagingCost: opts.summary.packagingCost,
    totalProductCost: opts.summary.totalCost,
    costSource: opts.policy,
    lastCalculation: new Date().toISOString(),
    costCompleteness: completeness,
    warnings: [...new Set(warnings)],
    lines: opts.lineViews ?? opts.summary.lines.map((l) => recipeLineCostView(l)),
    summary: opts.summary,
  };
}

/** Production unit cost = allocated production cost / usable output. */
export function productionUnitCost(allocatedProductionCost: number | null, usableOutput: number | null): number | null {
  const cost = asMoney(allocatedProductionCost);
  const out = asMoney(usableOutput);
  if (cost == null || out == null || !(out > 0)) return null;
  return cost / out;
}

/**
 * Allocate shared production cost across multiple outputs by coefficients.
 * Coefficients are normalized; zero/negative coeffs get 0.
 */
export function allocateProductionCost(
  totalCost: number,
  outputs: { id: string; coefficient: number; usableQty: number }[],
): { id: string; allocatedCost: number; unitCost: number | null }[] {
  const positive = outputs.map((o) => ({ ...o, coefficient: Math.max(0, o.coefficient) }));
  const sum = positive.reduce((s, o) => s + o.coefficient, 0);
  return positive.map((o) => {
    const allocatedCost = sum > 0 ? (totalCost * o.coefficient) / sum : 0;
    return {
      id: o.id,
      allocatedCost,
      unitCost: o.usableQty > 0 ? allocatedCost / o.usableQty : null,
    };
  });
}

/** Build reverse dependency edges: ingredient/product → recipes that consume it. */
export function recipeConsumerMap(recipes: CostRecipe[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const recipe of recipes) {
    if (recipe.status === "archived") continue;
    for (const line of recipe.lines) {
      if (!line.product_id) continue;
      let set = map.get(line.product_id);
      if (!set) {
        set = new Set();
        map.set(line.product_id, set);
      }
      set.add(recipe.product_id);
    }
  }
  return map;
}

/** Detect cycles among tech-card explosions (product → nested prep → … → product). */
export function detectRecipeCycles(recipes: CostRecipe[]): string[][] {
  const active = new Map<string, CostRecipe>();
  for (const r of recipes) {
    if (r.status === "active") active.set(r.product_id, r);
  }
  for (const r of recipes) {
    if (r.status === "draft" && !active.has(r.product_id)) active.set(r.product_id, r);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const idx = stack.indexOf(id);
      if (idx >= 0) cycles.push(stack.slice(idx).concat(id));
      return;
    }
    visiting.add(id);
    stack.push(id);
    const recipe = active.get(id);
    if (recipe) {
      for (const line of recipe.lines) {
        if (line.product_id && active.has(line.product_id)) dfs(line.product_id);
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of active.keys()) dfs(id);
  return cycles;
}

/**
 * Products whose forecast cost may change when `changedProductId` cost/recipe changes.
 * Walks consumers transitively; stops on cycles.
 */
export function affectedProductsByCostChange(
  recipes: CostRecipe[],
  changedProductId: string,
  maxDepth = 32,
): string[] {
  const consumers = recipeConsumerMap(recipes);
  const out: string[] = [];
  const seen = new Set<string>([changedProductId]);
  let frontier = [changedProductId];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parent of consumers.get(id) ?? []) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        out.push(parent);
        next.push(parent);
      }
    }
    frontier = next;
    depth += 1;
  }
  return out;
}

export function affectedDishesByProduct(
  dishes: Pick<ErpDish, "id" | "lines" | "archived_at">[],
  recipes: CostRecipe[],
  changedProductId: string,
): string[] {
  const affected = new Set(affectedProductsByCostChange(recipes, changedProductId));
  affected.add(changedProductId);
  return dishes
    .filter((d) => !d.archived_at)
    .filter((d) => d.lines.some((l) => l.product_id && affected.has(l.product_id)))
    .map((d) => d.id);
}

export type DishCostHistoryEntry = {
  previousCost: number | null;
  currentCost: number | null;
  costDifference: number | null;
  costDifferencePercentage: number | null;
  changedIngredients: string[];
  changeReason: string | null;
  calculationDate: string;
  costSource: string | null;
};

export function compareDishCostSnapshots(opts: {
  previousTotal: number | null;
  currentTotal: number | null;
  previousLines?: { name: string; cost: number | null }[];
  currentLines?: { name: string; cost: number | null }[];
  changeReason?: string | null;
  costSource?: string | null;
  calculationDate?: string;
}): DishCostHistoryEntry {
  const prev = asMoney(opts.previousTotal);
  const curr = asMoney(opts.currentTotal);
  const diff = prev != null && curr != null ? curr - prev : null;
  const pct = diff != null && prev != null && prev !== 0 ? (diff / prev) * 100 : null;
  const changed: string[] = [];
  if (opts.previousLines && opts.currentLines) {
    const prevMap = new Map(opts.previousLines.map((l) => [l.name, l.cost]));
    for (const line of opts.currentLines) {
      const before = prevMap.get(line.name);
      if (before !== line.cost) changed.push(line.name);
    }
  }
  return {
    previousCost: prev,
    currentCost: curr,
    costDifference: diff,
    costDifferencePercentage: pct,
    changedIngredients: changed,
    changeReason: opts.changeReason ?? null,
    calculationDate: opts.calculationDate ?? new Date().toISOString(),
    costSource: opts.costSource ?? null,
  };
}

export type MarginImpactRow = {
  dishId: string;
  dishName: string;
  channelId: string;
  channelName: string;
  previousMarginPct: number | null;
  currentMarginPct: number | null;
  marginDropped: boolean;
  belowMinimum: boolean;
  recommendedPriceIncreased: boolean;
  costUnreliable: boolean;
  previousRecommendedPrice: number | null;
  currentRecommendedPrice: number | null;
};

/**
 * Scan dishes whose ingredient cost change hurts channel margin.
 * Never mutates sale prices.
 */
export function scanMarginImpact(opts: {
  dishes: {
    id: string;
    name: string;
    salePrice: number | null;
    channelPrices: { channel_id: string; sale_price: number | null }[];
    previousFoodCost: number | null;
    previousPackagingCost: number | null;
    currentFoodCost: number | null;
    currentPackagingCost: number | null;
    costComplete: boolean;
  }[];
  channels: ErpChannel[];
  /** Effective output VAT % for the dish (already resolved). */
  outputVatRate: number;
  overrides?: DishChannelOverrides;
}): MarginImpactRow[] {
  const rows: MarginImpactRow[] = [];
  for (const dish of opts.dishes) {
    for (const channel of opts.channels) {
      if (channel.archived_at) continue;
      const price =
        dish.channelPrices.find((p) => p.channel_id === channel.id)?.sale_price ?? dish.salePrice;
      const prev = computeDishChannelFinance({
        channel,
        grossSellingPrice: price,
        foodCost: dish.previousFoodCost,
        packagingCost: dish.previousPackagingCost,
        outputVatRate: opts.outputVatRate,
        overrides: opts.overrides,
      });
      const curr = computeDishChannelFinance({
        channel,
        grossSellingPrice: price,
        foodCost: dish.currentFoodCost,
        packagingCost: dish.currentPackagingCost,
        outputVatRate: opts.outputVatRate,
        overrides: opts.overrides,
      });
      const prevPct = prev.result?.contributionMarginPct ?? null;
      const currPct = curr.result?.contributionMarginPct ?? null;
      const min = channel.min_margin_pct ?? null;
      const prevRec = prev.result?.recommendedSellingPrice ?? null;
      const currRec = curr.result?.recommendedSellingPrice ?? null;
      const marginDropped = prevPct != null && currPct != null && currPct < prevPct - 0.01;
      const belowMinimum = min != null && currPct != null && currPct < min;
      const recommendedPriceIncreased = prevRec != null && currRec != null && currRec > prevRec + 0.5;
      const costUnreliable = !dish.costComplete;
      if (marginDropped || belowMinimum || recommendedPriceIncreased || costUnreliable) {
        rows.push({
          dishId: dish.id,
          dishName: dish.name,
          channelId: channel.id,
          channelName: channel.name,
          previousMarginPct: prevPct,
          currentMarginPct: currPct,
          marginDropped,
          belowMinimum,
          recommendedPriceIncreased,
          costUnreliable,
          previousRecommendedPrice: prevRec,
          currentRecommendedPrice: currRec,
        });
      }
    }
  }
  return rows;
}

/** Convenience: build dish summary under settings recipe cost policy. */
export function dishSummaryForPolicy(
  products: CostProduct[],
  recipes: CostRecipe[],
  dishLines: { product_id: string | null; qty?: unknown; net_qty?: unknown }[],
  policy: RecipeCostSourcePolicy,
  quotes?: Iterable<ProductCostQuoteInput>,
): CostSummary {
  const ctx = buildCostContext(products, recipes, {
    quotes,
    priceSource: recipeCostSourceToMenuPriceSource(policy),
    explodeRecipes: true,
  });
  const lines = dishLines
    .filter((l) => l.product_id && asMoney(l.qty ?? l.net_qty) != null)
    .map((l) => costLine(ctx, l.product_id as string, asMoney(l.qty ?? l.net_qty) as number));
  return summarize(lines);
}

export function isPackagingProduct(type: CostProduct["type"]) {
  return isPackaging(type);
}

// ---------------------------------------------------------------------------
// Control fixtures (Phase 8F §14–16) — pure expected numbers for tests / docs
// ---------------------------------------------------------------------------

export const CONTROL_PICKLED_CUCUMBERS = {
  purchaseUnit: "jar" as const,
  netPrice: 24_000,
  vatRate: 8,
  grossPrice: 25_920,
  grossContentKg: 0.515,
  netUsableKg: 0.25,
  recipeUsableKg: 0.025,
  expected: {
    recipeConsumptionJars: 0.1,
    lossPercentage: 51.45631067961165,
    usableYieldPercentage: 48.54368932038835,
    fullDeduction: { costPerUsableKg: 96_000, recipeCost: 2_400 },
    pending: { costPerUsableKg: 103_680, recipeCost: 2_592 },
  },
} as const;

export const CONTROL_YELLOW_MUSTARD = {
  netUnitCostPerKg: 81_250,
  grossUnitCostPerKg: 87_750,
  recipeGrams: 15,
  expected: {
    fullDeduction: 1_218.75,
    pending: 1_316.25,
    partial50: 1_267.5,
  },
} as const;

export const CONTROL_PORK_HOT_DOG = {
  netPerKg: 153_000,
  grossPerKg: 165_240,
  weightPerPieceKg: 0.05,
  expected: {
    fullDeductionPerPiece: 7_650,
    pendingPerPiece: 8_262,
  },
} as const;

/** Historical Danish Hot Dog control total from Release 1 (food + pack). */
export const DANISH_HOT_DOG_LEGACY_TOTAL = 27_902.06;
export const DANISH_HOT_DOG_LEGACY_FOOD = 24_750;
export const DANISH_HOT_DOG_LEGACY_PACK = 3_152;
