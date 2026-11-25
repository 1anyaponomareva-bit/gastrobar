/**
 * Phase 7 — bridge ErpChannel + dish costs → financialCalculator.
 * UI must not reimplement formulas; only pass overrides (ads scenario, VAT simulation).
 */
import { channelFinanceIncomplete } from "./channelFinance";
import {
  calculateChannelFinance,
  recommendSellingPrice,
  resolveMarginTarget,
  type DeductionMode,
  type FinancialCalculatorInput,
  type FinancialCalculatorResult,
  type MarginTargetKind,
} from "./financialCalculator";
import type { ErpChannel, ErpSettings, ErpVatException } from "./types";
import { defaultOutputVatRate, normalizeVatDirection, normalizeVatScope, exceptionActiveOn } from "./vat";

export type ChannelCalcMode = "modern" | "legacy" | "incomplete";

/** UI-only VAT simulation; never writes tax registers or channel settings. */
export type VatSimulationMode = "current" | "full" | "partial" | "none";

export type MarginBand = "critical" | "acceptable" | "good" | "excellent";

export type DishChannelOverrides = {
  advertisingScenario?: string | null;
  vatSimulation?: VatSimulationMode;
  partialDeductibleVatPct?: number | null;
  merchantFundedDiscount?: number | null;
};

function isMarketplaceChannel(channel: Pick<ErpChannel, "code" | "name">): boolean {
  const hay = `${channel.code} ${channel.name}`.toLowerCase();
  return /grab|shopee|gofood|baemin|foodpanda|delivery/.test(hay);
}

function hasFinanceSchema(channel: ErpChannel): boolean {
  return (
    channel.commission_enabled !== undefined &&
    channel.commission_enabled !== null &&
    typeof channel.commission_enabled === "boolean"
  );
}

/** Decide modern calculator vs legacy commission_pct vs incomplete. Never mix legacy with ads. */
export function channelCalcMode(channel: ErpChannel): ChannelCalcMode {
  if (!hasFinanceSchema(channel)) {
    return channel.commission_pct != null ? "legacy" : "incomplete";
  }

  const issues = channelFinanceIncomplete(channel);
  if (issues.length) return "incomplete";

  // Marketplace without commission/ads rates (e.g. Shopee seed) → incomplete, not legacy.
  if (
    isMarketplaceChannel(channel) &&
    !channel.commission_enabled &&
    channel.commission_rate == null &&
    !channel.advertising_enabled
  ) {
    return "incomplete";
  }

  return "modern";
}

/**
 * Output VAT for dish×channel (Release 1 final):
 * 1) Individual Output VAT Exception (dish scope)
 * 2) Explicit individual dish.vat_rate — ONLY when it differs from the global default
 *    (auto-assigned 8%/global baseline is ignored so it cannot override category/channel)
 * 3) Category Output VAT Exception
 * 4) Sales Channel output_vat_rate
 * 5) Global default_output_vat_rate
 *
 * Single individual source: prefer erp_vat_exceptions(dish); dish.vat_rate is a legacy
 * alias for the same priority when it is clearly not the auto baseline.
 * Input/purchase VAT never drives dish output VAT.
 */
export function resolveDishOutputVatRate(opts: {
  settings: Pick<ErpSettings, "output_vat_enabled" | "default_output_vat_rate">;
  exceptions?: ErpVatException[] | null;
  channel?: Pick<ErpChannel, "output_vat_rate"> | null;
  dishId?: string | null;
  categoryId?: string | null;
  dishVatRate?: number | null;
  asOf?: string | Date | null;
}): number {
  if (!opts.settings.output_vat_enabled) return 0;
  const global = defaultOutputVatRate(opts.settings);
  const rows = (opts.exceptions ?? []).filter(
    (row) => normalizeVatDirection(row) === "output" && exceptionActiveOn(row, opts.asOf),
  );
  if (opts.dishId) {
    const dish = rows.find((row) => normalizeVatScope(row) === "dish" && row.dish_id === opts.dishId);
    if (dish && dish.vat_rate != null) return Number(dish.vat_rate);
  }
  // Legacy dish.vat_rate: ignore when equal to global (typical auto-seed 8%).
  if (
    opts.dishVatRate != null &&
    Number.isFinite(Number(opts.dishVatRate)) &&
    Number(opts.dishVatRate) !== global
  ) {
    return Number(opts.dishVatRate);
  }
  if (opts.categoryId) {
    const cat = rows.find((row) => normalizeVatScope(row) === "category" && row.category_id === opts.categoryId);
    if (cat && cat.vat_rate != null) return Number(cat.vat_rate);
  }
  if (opts.channel?.output_vat_rate != null && Number.isFinite(Number(opts.channel.output_vat_rate))) {
    return Number(opts.channel.output_vat_rate);
  }
  return global;
}

function forecastFromSim(sim: VatSimulationMode | undefined): DeductionMode | null {
  if (!sim || sim === "current") return null;
  if (sim === "full") return "forecast_full";
  if (sim === "none") return "non_deductible";
  return "forecast_partial";
}

/** Build calculator input for a channel. Overrides are dish-card local only. */
export function buildDishChannelFinanceInput(opts: {
  channel: ErpChannel;
  grossSellingPrice: number | null;
  foodCost: number | null;
  packagingCost: number | null;
  outputVatRate: number;
  mode: ChannelCalcMode;
  overrides?: DishChannelOverrides;
}): FinancialCalculatorInput | null {
  const { channel, overrides } = opts;
  if (opts.mode === "incomplete") return null;

  if (opts.mode === "legacy") {
    return {
      grossSellingPrice: opts.grossSellingPrice,
      merchantFundedDiscount: overrides?.merchantFundedDiscount ?? 0,
      outputVatRate: opts.outputVatRate,
      sellingPriceIncludesVat: true,
      foodCost: opts.foodCost,
      packagingCost: opts.packagingCost,
      commissionEnabled: channel.commission_pct != null && channel.commission_pct !== 0,
      commissionRate: channel.commission_pct,
      commissionVatIncluded: true,
      commissionVatRate: 0,
      commissionCalcBase: "gross_sales",
      commissionVatDeductionStatus: "pending",
      advertisingEnabled: false,
    };
  }

  const scenario = overrides?.advertisingScenario ?? channel.advertising_scenario ?? "custom";
  const adsEnabled = Boolean(channel.advertising_enabled);

  return {
    grossSellingPrice: opts.grossSellingPrice,
    merchantFundedDiscount: overrides?.merchantFundedDiscount ?? 0,
    outputVatRate: opts.outputVatRate,
    sellingPriceIncludesVat: channel.selling_price_includes_vat !== false,
    foodCost: opts.foodCost,
    packagingCost: opts.packagingCost,
    commissionEnabled: Boolean(channel.commission_enabled),
    commissionRate: channel.commission_rate,
    commissionVatIncluded: Boolean(channel.commission_vat_included),
    commissionVatRate: channel.commission_vat_rate ?? 8,
    commissionCalcBase: channel.commission_calc_base ?? "gross_sales_after_merchant_discounts",
    commissionVatDeductionStatus: (channel.commission_vat_deduction_status as DeductionMode) ?? "pending",
    commissionDeductibleVatPct:
      overrides?.vatSimulation === "partial"
        ? (overrides.partialDeductibleVatPct ?? channel.commission_deductible_vat_pct ?? 50)
        : channel.commission_deductible_vat_pct,
    advertisingEnabled: adsEnabled,
    advertisingScenario: scenario,
    advertisingRate: channel.advertising_rate,
    advertisingVatIncluded: Boolean(channel.advertising_vat_included),
    advertisingVatRate: channel.advertising_vat_rate ?? 8,
    advertisingCalcBase: channel.advertising_calc_base ?? channel.commission_calc_base ?? "gross_sales_after_merchant_discounts",
    advertisingVatDeductionStatus: (channel.advertising_vat_deduction_status as DeductionMode) ?? "pending",
    advertisingDeductibleVatPct:
      overrides?.vatSimulation === "partial"
        ? (overrides.partialDeductibleVatPct ?? channel.advertising_deductible_vat_pct ?? 50)
        : channel.advertising_deductible_vat_pct,
    advertisingOrganicGrossPct: channel.advertising_organic_gross_pct,
    advertisingStandardGrossPct: channel.advertising_standard_gross_pct,
    advertisingFullGrossPct: channel.advertising_full_gross_pct,
    forecastDeduction: forecastFromSim(overrides?.vatSimulation),
  };
}

export type DishChannelFinanceView = {
  channel: ErpChannel;
  mode: ChannelCalcMode;
  preliminary: boolean;
  simulation: boolean;
  sellingPrice: number | null;
  outputVatRate: number;
  result: FinancialCalculatorResult | null;
  input: FinancialCalculatorInput | null;
  band: MarginBand | null;
};

export function marginBandForChannel(
  contributionMarginPct: number | null | undefined,
  channel: Pick<ErpChannel, "min_margin_pct" | "target_margin_pct" | "optimal_margin_pct">,
): MarginBand | null {
  if (contributionMarginPct == null || !Number.isFinite(contributionMarginPct)) return null;
  const min = channel.min_margin_pct;
  const target = channel.target_margin_pct;
  const optimal = channel.optimal_margin_pct;
  if (min != null && contributionMarginPct < min) return "critical";
  if (target != null && contributionMarginPct < target) return "acceptable";
  if (optimal != null && contributionMarginPct < optimal) return "good";
  if (optimal != null && contributionMarginPct >= optimal) return "excellent";
  if (target != null && contributionMarginPct >= target) return "good";
  if (min != null && contributionMarginPct >= min) return "acceptable";
  return null;
}

export function computeDishChannelFinance(opts: {
  channel: ErpChannel;
  grossSellingPrice: number | null;
  foodCost: number | null;
  packagingCost: number | null;
  outputVatRate: number;
  overrides?: DishChannelOverrides;
}): DishChannelFinanceView {
  const mode = channelCalcMode(opts.channel);
  const input = buildDishChannelFinanceInput({ ...opts, mode });
  const result = input ? calculateChannelFinance(input) : null;
  const sim = opts.overrides?.vatSimulation;
  const simulation = Boolean(sim && sim !== "current");
  return {
    channel: opts.channel,
    mode,
    preliminary: Boolean(opts.channel.finance_preliminary),
    simulation,
    sellingPrice: opts.grossSellingPrice,
    outputVatRate: opts.outputVatRate,
    result,
    input,
    band: result?.complete ? marginBandForChannel(result.contributionMarginPct, opts.channel) : null,
  };
}

export function recommendForChannel(
  view: DishChannelFinanceView,
  kind: MarginTargetKind,
  customMarginPct: number | null,
  roundTo: number,
): ReturnType<typeof recommendSellingPrice> {
  if (!view.input || view.mode === "incomplete") {
    return { price: null, actualMarginPct: null, unreachable: false, warning: "incomplete" };
  }
  const target = resolveMarginTarget(kind, {
    min: view.channel.min_margin_pct,
    target: view.channel.target_margin_pct,
    optimal: view.channel.optimal_margin_pct,
    custom: customMarginPct,
  });
  return recommendSellingPrice(view.input, target, { roundTo });
}

export function advertisingScenarioOptions(channel: ErpChannel): { value: string; rate: number | null }[] {
  return [
    { value: "organic", rate: channel.advertising_organic_gross_pct ?? 0 },
    { value: "standard", rate: channel.advertising_standard_gross_pct ?? null },
    { value: "full", rate: channel.advertising_full_gross_pct ?? null },
    { value: "custom", rate: channel.advertising_rate ?? null },
  ];
}
