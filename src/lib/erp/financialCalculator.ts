/**
 * Phase 6 — unified financial calculator (single source of formulas for ERP).
 * Pure TypeScript; no DB migration. Does not write tax registers or change FIFO.
 * Dish card UI integration is Phase 7; callers should import from here only.
 */

import { advertisingRateForScenario, splitRateWithVat, type VatDeductionStatus } from "./channelFinance";

export type DeductionMode = VatDeductionStatus | "forecast_full" | "forecast_partial";

export type FinancialCalculatorInput = {
  grossSellingPrice: number | null;
  merchantFundedDiscount?: number | null;
  outputVatRate: number | null;
  sellingPriceIncludesVat?: boolean;
  foodCost: number | null;
  packagingCost: number | null;
  /** Platform commission */
  commissionEnabled?: boolean;
  commissionRate?: number | null;
  commissionVatIncluded?: boolean;
  commissionVatRate?: number | null;
  commissionCalcBase?: "gross_sales" | "gross_sales_after_merchant_discounts" | "net_sales" | "net_revenue" | string | null;
  commissionVatDeductionStatus?: DeductionMode | null;
  commissionDeductibleVatPct?: number | null;
  /** Advertising */
  advertisingEnabled?: boolean;
  advertisingScenario?: string | null;
  advertisingRate?: number | null;
  advertisingVatIncluded?: boolean;
  advertisingVatRate?: number | null;
  advertisingCalcBase?: string | null;
  advertisingVatDeductionStatus?: DeductionMode | null;
  advertisingDeductibleVatPct?: number | null;
  advertisingOrganicGrossPct?: number | null;
  advertisingStandardGrossPct?: number | null;
  advertisingFullGrossPct?: number | null;
  /** Extra channel expenses (absolute VND; already net of double-count) */
  additionalPlatformFees?: number | null;
  chargebacks?: number | null;
  otherChannelExpenses?: number | null;
  /** Target margin for recommended price (0–100). */
  targetMarginPct?: number | null;
  /** Override deduction for forecast scenarios without changing stored status. */
  forecastDeduction?: DeductionMode | null;
};

export type FinancialCalculatorResult = {
  grossSellingPrice: number | null;
  merchantFundedDiscount: number;
  taxableSalesAmount: number | null;
  outputVatRate: number | null;
  outputVatAmount: number | null;
  netRevenue: number | null;
  foodCost: number | null;
  packagingCost: number | null;
  totalProductCost: number | null;
  foodCostPct: number | null;
  packagingCostPct: number | null;
  totalProductCostPct: number | null;
  commissionCalcBase: string | null;
  commissionNetRate: number | null;
  commissionGrossRate: number | null;
  commissionNetAmount: number | null;
  commissionVatAmount: number | null;
  commissionGrossAmount: number | null;
  deductibleCommissionVat: number | null;
  nonDeductibleCommissionVat: number | null;
  effectiveCommissionExpense: number | null;
  advertisingScenario: string | null;
  advertisingCalcBase: string | null;
  advertisingNetRate: number | null;
  advertisingGrossRate: number | null;
  advertisingNetAmount: number | null;
  advertisingVatAmount: number | null;
  advertisingGrossAmount: number | null;
  deductibleAdvertisingVat: number | null;
  nonDeductibleAdvertisingVat: number | null;
  effectiveAdvertisingExpense: number | null;
  additionalPlatformFees: number;
  chargebacks: number;
  otherChannelExpenses: number;
  totalChannelExpenses: number | null;
  totalVariableExpenses: number | null;
  /** Contribution margin — not net profit. */
  contributionMargin: number | null;
  contributionMarginPct: number | null;
  recommendedSellingPrice: number | null;
  recommendedActualMarginPct: number | null;
  recommendedUnreachable: boolean;
  estimatedPlatformPayout: number | null;
  deductiblePlatformVat: number | null;
  complete: boolean;
  issues: string[];
};

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
const z = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 0 : v);

function pctOf(part: number | null, base: number | null): number | null {
  if (part == null || base == null || !(base > 0)) return null;
  return (part / base) * 100;
}

function calcBaseAmount(
  base: string | null | undefined,
  gross: number,
  afterDiscount: number,
  netRevenue: number | null,
): number | null {
  switch (base ?? "gross_sales_after_merchant_discounts") {
    case "gross_sales":
      return gross;
    case "net_sales":
    case "net_revenue":
      return netRevenue;
    case "gross_sales_after_merchant_discounts":
    default:
      return afterDiscount;
  }
}

function deductibleVat(
  vatAmount: number | null,
  status: DeductionMode | null | undefined,
  partialPct: number | null | undefined,
  forecast: DeductionMode | null | undefined,
): { deductible: number; nonDeductible: number } {
  if (vatAmount == null) return { deductible: 0, nonDeductible: 0 };
  const mode = forecast ?? status ?? "pending";
  if (mode === "deductible" || mode === "forecast_full") return { deductible: vatAmount, nonDeductible: 0 };
  if (mode === "non_deductible" || mode === "pending") return { deductible: 0, nonDeductible: vatAmount };
  // partial / forecast_partial
  const pct = partialPct == null || !Number.isFinite(partialPct) ? 0 : Math.min(100, Math.max(0, partialPct));
  const ded = (vatAmount * pct) / 100;
  return { deductible: ded, nonDeductible: vatAmount - ded };
}

/**
 * Core calculator. Money kept at high precision; callers may round for display.
 */
export function calculateChannelFinance(input: FinancialCalculatorInput): FinancialCalculatorResult {
  const issues: string[] = [];
  const gross = n(input.grossSellingPrice);
  const discount = Math.max(0, z(input.merchantFundedDiscount));
  const includesVat = input.sellingPriceIncludesVat !== false;
  const vatRate = n(input.outputVatRate) ?? 0;

  if (gross == null) issues.push("no_price");
  if (input.foodCost == null || input.packagingCost == null) issues.push("incomplete_cost");

  const afterDiscount = gross == null ? null : Math.max(0, gross - discount);
  let netRevenue: number | null = null;
  let outputVatAmount: number | null = null;
  let taxable = afterDiscount;

  if (afterDiscount != null) {
    if (includesVat && vatRate > 0) {
      netRevenue = afterDiscount / (1 + vatRate / 100);
      outputVatAmount = afterDiscount - netRevenue;
      taxable = afterDiscount;
    } else {
      netRevenue = afterDiscount;
      outputVatAmount = vatRate > 0 ? afterDiscount * (vatRate / 100) : 0;
      taxable = afterDiscount;
    }
  }

  const foodCost = n(input.foodCost);
  const packagingCost = n(input.packagingCost);
  const totalProductCost =
    foodCost != null && packagingCost != null ? foodCost + packagingCost : foodCost ?? packagingCost;

  // --- Commission ---
  const commissionEnabled = input.commissionEnabled !== false && (input.commissionRate != null || input.commissionEnabled === true);
  let commissionNetRate: number | null = null;
  let commissionGrossRate: number | null = null;
  let commissionNetAmount: number | null = null;
  let commissionVatAmount: number | null = null;
  let commissionGrossAmount: number | null = null;
  let deductibleCommissionVat = 0;
  let nonDeductibleCommissionVat = 0;
  let effectiveCommissionExpense: number | null = null;

  if (input.commissionEnabled && input.commissionRate == null) issues.push("no_commission");

  if (commissionEnabled && input.commissionRate != null && gross != null && afterDiscount != null) {
    const rates = splitRateWithVat(input.commissionRate, input.commissionVatRate ?? 0, Boolean(input.commissionVatIncluded));
    commissionNetRate = rates.net;
    commissionGrossRate = rates.gross;
    const base = calcBaseAmount(input.commissionCalcBase, gross, afterDiscount, netRevenue);
    if (base != null && rates.gross != null && rates.net != null) {
      // Amounts from gross rate on base (when vat included) or net×(1+vat)
      if (input.commissionVatIncluded) {
        commissionGrossAmount = (base * rates.gross) / 100;
        commissionNetAmount = rates.net != null ? (base * rates.net) / 100 : commissionGrossAmount / (1 + (input.commissionVatRate ?? 0) / 100);
        commissionVatAmount = commissionGrossAmount - (commissionNetAmount ?? 0);
      } else {
        commissionNetAmount = (base * (rates.net ?? 0)) / 100;
        commissionVatAmount = commissionNetAmount * ((input.commissionVatRate ?? 0) / 100);
        commissionGrossAmount = commissionNetAmount + commissionVatAmount;
      }
      const split = deductibleVat(
        commissionVatAmount,
        input.commissionVatDeductionStatus,
        input.commissionDeductibleVatPct,
        input.forecastDeduction,
      );
      deductibleCommissionVat = split.deductible;
      nonDeductibleCommissionVat = split.nonDeductible;
      effectiveCommissionExpense = (commissionGrossAmount ?? 0) - deductibleCommissionVat;
    }
  } else if (!input.commissionEnabled) {
    commissionNetAmount = 0;
    commissionVatAmount = 0;
    commissionGrossAmount = 0;
    effectiveCommissionExpense = 0;
  }

  // --- Advertising ---
  const adsRate = advertisingRateForScenario({
    advertising_scenario: input.advertisingScenario,
    advertising_rate: input.advertisingRate,
    advertising_organic_gross_pct: input.advertisingOrganicGrossPct,
    advertising_standard_gross_pct: input.advertisingStandardGrossPct,
    advertising_full_gross_pct: input.advertisingFullGrossPct,
  });
  const advertisingEnabled = Boolean(input.advertisingEnabled);
  if (advertisingEnabled && adsRate == null && input.advertisingScenario !== "organic") issues.push("no_advertising");

  let advertisingNetRate: number | null = null;
  let advertisingGrossRate: number | null = null;
  let advertisingNetAmount: number | null = null;
  let advertisingVatAmount: number | null = null;
  let advertisingGrossAmount: number | null = null;
  let deductibleAdvertisingVat = 0;
  let nonDeductibleAdvertisingVat = 0;
  let effectiveAdvertisingExpense: number | null = null;

  if (advertisingEnabled && adsRate != null && gross != null && afterDiscount != null) {
    const vatIncluded = input.advertisingVatIncluded !== false && (input.advertisingVatIncluded === true || adsRate > 0);
    // Spec: advertising gross rate with VAT included true → treat rate as gross
    const included = Boolean(input.advertisingVatIncluded);
    const rates = splitRateWithVat(adsRate, input.advertisingVatRate ?? 0, included);
    advertisingNetRate = rates.net;
    advertisingGrossRate = rates.gross;
    const base = calcBaseAmount(input.advertisingCalcBase ?? input.commissionCalcBase, gross, afterDiscount, netRevenue);
    if (base != null && rates.gross != null) {
      if (included) {
        advertisingGrossAmount = (base * rates.gross) / 100;
        advertisingNetAmount =
          rates.net != null ? (base * rates.net) / 100 : advertisingGrossAmount / (1 + (input.advertisingVatRate ?? 0) / 100);
        advertisingVatAmount = advertisingGrossAmount - (advertisingNetAmount ?? 0);
      } else {
        advertisingNetAmount = (base * (rates.net ?? 0)) / 100;
        advertisingVatAmount = advertisingNetAmount * ((input.advertisingVatRate ?? 0) / 100);
        advertisingGrossAmount = advertisingNetAmount + advertisingVatAmount;
      }
      const split = deductibleVat(
        advertisingVatAmount,
        input.advertisingVatDeductionStatus,
        input.advertisingDeductibleVatPct,
        input.forecastDeduction,
      );
      deductibleAdvertisingVat = split.deductible;
      nonDeductibleAdvertisingVat = split.nonDeductible;
      effectiveAdvertisingExpense = (advertisingGrossAmount ?? 0) - deductibleAdvertisingVat;
    }
  } else if (!advertisingEnabled) {
    advertisingNetAmount = 0;
    advertisingVatAmount = 0;
    advertisingGrossAmount = 0;
    effectiveAdvertisingExpense = 0;
  }

  const additionalPlatformFees = z(input.additionalPlatformFees);
  const chargebacks = z(input.chargebacks);
  const otherChannelExpenses = z(input.otherChannelExpenses);
  // Merchant-funded discount already reduced taxable/gross base — do not add again as expense.

  const totalChannelExpenses =
    effectiveCommissionExpense == null && effectiveAdvertisingExpense == null
      ? null
      : z(effectiveCommissionExpense) + z(effectiveAdvertisingExpense) + additionalPlatformFees + chargebacks + otherChannelExpenses;

  const totalVariableExpenses =
    totalChannelExpenses == null && totalProductCost == null
      ? null
      : z(totalChannelExpenses) + z(totalProductCost);

  const contributionMargin =
    netRevenue == null || totalChannelExpenses == null || totalProductCost == null
      ? null
      : netRevenue - totalProductCost - totalChannelExpenses;

  const contributionMarginPct = pctOf(contributionMargin, netRevenue);
  const deductiblePlatformVat = deductibleCommissionVat + deductibleAdvertisingVat;

  const estimatedPlatformPayout =
    afterDiscount == null || commissionGrossAmount == null || advertisingGrossAmount == null
      ? null
      : afterDiscount - commissionGrossAmount - advertisingGrossAmount - additionalPlatformFees - chargebacks;

  const recommended = recommendSellingPrice(input, input.targetMarginPct ?? null);

  return {
    grossSellingPrice: gross,
    merchantFundedDiscount: discount,
    taxableSalesAmount: taxable,
    outputVatRate: input.outputVatRate ?? null,
    outputVatAmount,
    netRevenue,
    foodCost,
    packagingCost,
    totalProductCost,
    foodCostPct: pctOf(foodCost, netRevenue),
    packagingCostPct: pctOf(packagingCost, netRevenue),
    totalProductCostPct: pctOf(totalProductCost, netRevenue),
    commissionCalcBase: input.commissionCalcBase ?? null,
    commissionNetRate,
    commissionGrossRate,
    commissionNetAmount,
    commissionVatAmount,
    commissionGrossAmount,
    deductibleCommissionVat: commissionGrossAmount == null ? null : deductibleCommissionVat,
    nonDeductibleCommissionVat: commissionGrossAmount == null ? null : nonDeductibleCommissionVat,
    effectiveCommissionExpense,
    advertisingScenario: input.advertisingScenario ?? null,
    advertisingCalcBase: input.advertisingCalcBase ?? null,
    advertisingNetRate,
    advertisingGrossRate,
    advertisingNetAmount,
    advertisingVatAmount,
    advertisingGrossAmount,
    deductibleAdvertisingVat: advertisingGrossAmount == null ? null : deductibleAdvertisingVat,
    nonDeductibleAdvertisingVat: advertisingGrossAmount == null ? null : nonDeductibleAdvertisingVat,
    effectiveAdvertisingExpense,
    additionalPlatformFees,
    chargebacks,
    otherChannelExpenses,
    totalChannelExpenses,
    totalVariableExpenses,
    contributionMargin,
    contributionMarginPct,
    recommendedSellingPrice: recommended.price,
    recommendedActualMarginPct: recommended.actualMarginPct,
    recommendedUnreachable: recommended.unreachable,
    estimatedPlatformPayout,
    deductiblePlatformVat: commissionGrossAmount == null && advertisingGrossAmount == null ? null : deductiblePlatformVat,
    complete: issues.length === 0 && contributionMargin != null,
    issues,
  };
}

export type MarginTargetKind = "minimum" | "target" | "optimal" | "custom";

/**
 * Resolve margin % from channel targets or an explicit custom value.
 * Does not mutate dish price — caller decides whether to apply the recommendation.
 */
export function resolveMarginTarget(
  kind: MarginTargetKind,
  targets: { min?: number | null; target?: number | null; optimal?: number | null; custom?: number | null },
): number | null {
  if (kind === "minimum") return targets.min ?? null;
  if (kind === "target") return targets.target ?? null;
  if (kind === "optimal") return targets.optimal ?? null;
  return targets.custom ?? null;
}

/**
 * Solve for gross price P (VAT-inclusive) to hit target contribution margin %.
 * Assumes commission/ads % of the same calc base as price-after-discount.
 * Iterative numeric solve with protection against unreachable targets.
 * After rounding, recalculates actual margin. Never auto-writes dish price.
 */
export function recommendSellingPrice(
  input: FinancialCalculatorInput,
  targetMarginPct: number | null,
  options?: { roundTo?: number; maxIter?: number },
): { price: number | null; actualMarginPct: number | null; unreachable: boolean; warning: string | null } {
  if (targetMarginPct == null || !Number.isFinite(targetMarginPct) || targetMarginPct >= 100) {
    return {
      price: null,
      actualMarginPct: null,
      unreachable: targetMarginPct != null && targetMarginPct >= 100,
      warning: targetMarginPct != null && targetMarginPct >= 100 ? "unreachable_target_margin" : null,
    };
  }
  if (input.foodCost == null || input.packagingCost == null) {
    return { price: null, actualMarginPct: null, unreachable: false, warning: "incomplete_cost" };
  }

  const roundTo = options?.roundTo ?? 1000;
  const maxIter = options?.maxIter ?? 40;
  let lo = 1;
  let hi = Math.max(1_000_000, (input.foodCost + input.packagingCost) * 20);
  let best: number | null = null;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const result = calculateChannelFinance({ ...input, grossSellingPrice: mid, targetMarginPct: null });
    const pct = result.contributionMarginPct;
    if (pct == null) {
      hi = mid;
      continue;
    }
    best = mid;
    if (pct < targetMarginPct) lo = mid;
    else hi = mid;
  }

  if (best == null) {
    return { price: null, actualMarginPct: null, unreachable: true, warning: "unreachable_target_margin" };
  }

  // Check ceiling: even huge price might not reach target if commission+ads eat everything
  const probe = calculateChannelFinance({ ...input, grossSellingPrice: hi * 2, targetMarginPct: null });
  if (probe.contributionMarginPct == null || probe.contributionMarginPct < targetMarginPct - 0.01) {
    return {
      price: null,
      actualMarginPct: probe.contributionMarginPct,
      unreachable: true,
      warning: "unreachable_target_margin",
    };
  }

  const rounded = Math.ceil(best / roundTo) * roundTo;
  const actual = calculateChannelFinance({ ...input, grossSellingPrice: rounded, targetMarginPct: null });
  return {
    price: rounded,
    actualMarginPct: actual.contributionMarginPct,
    unreachable: false,
    warning: null,
  };
}

/** Danish Hot Dog control fixture (spec §14). */
export function danishHotDogInput(overrides: Partial<FinancialCalculatorInput> = {}): FinancialCalculatorInput {
  return {
    grossSellingPrice: 109_000,
    merchantFundedDiscount: 0,
    outputVatRate: 8,
    sellingPriceIncludesVat: true,
    foodCost: 24_750,
    packagingCost: 3_152,
    commissionEnabled: true,
    commissionRate: 18.18,
    commissionVatIncluded: false,
    commissionVatRate: 8,
    commissionCalcBase: "gross_sales",
    commissionVatDeductionStatus: "pending",
    advertisingEnabled: true,
    advertisingScenario: "full",
    advertisingRate: 8,
    advertisingVatIncluded: true,
    advertisingVatRate: 8,
    advertisingCalcBase: "gross_sales",
    advertisingFullGrossPct: 8,
    advertisingVatDeductionStatus: "pending",
    additionalPlatformFees: 0,
    chargebacks: 0,
    otherChannelExpenses: 0,
    ...overrides,
  };
}
