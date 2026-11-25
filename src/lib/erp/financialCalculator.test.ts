import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateChannelFinance,
  danishHotDogInput,
  recommendSellingPrice,
} from "./financialCalculator";

const close = (actual: number | null | undefined, expected: number, eps = 0.05) => {
  assert.ok(actual != null, `expected ${expected}, got null`);
  assert.ok(Math.abs(actual! - expected) <= eps, `expected ${expected}, got ${actual}`);
};

test("Danish Hot Dog Scenario A — full VAT deduction → ~44.72%", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "deductible",
      advertisingVatDeductionStatus: "deductible",
      forecastDeduction: "forecast_full",
    }),
  );
  close(r.netRevenue, 100_925.93, 0.1);
  close(r.outputVatAmount, 8_074.07, 0.1);
  close(r.commissionNetAmount, 19_816.2, 0.1);
  close(r.commissionVatAmount, 1_585.3, 0.1);
  close(r.commissionGrossAmount, 21_401.5, 0.1);
  close(r.advertisingGrossAmount, 8_720, 0.1);
  close(r.advertisingNetAmount, 8_074.07, 0.1);
  close(r.advertisingVatAmount, 645.93, 0.1);
  close(r.deductiblePlatformVat, 2_231.22, 0.15);
  close(r.contributionMargin, 45_133.65, 0.5);
  close(r.contributionMarginPct, 44.72, 0.05);
});

test("Danish Hot Dog Scenario B — pending / no deduction → ~42.51%", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "pending",
      advertisingVatDeductionStatus: "pending",
    }),
  );
  close(r.netRevenue, 100_925.93, 0.1);
  close(r.effectiveCommissionExpense, 21_401.5, 0.1);
  close(r.effectiveAdvertisingExpense, 8_720, 0.1);
  close(r.totalProductCost, 27_902, 0.01);
  close(r.contributionMargin, 42_902.43, 0.5);
  close(r.contributionMarginPct, 42.51, 0.05);
});

test("Direct: no commission, no ads", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      commissionEnabled: false,
      advertisingEnabled: false,
      commissionRate: null,
      advertisingRate: null,
    }),
  );
  close(r.effectiveCommissionExpense, 0);
  close(r.effectiveAdvertisingExpense, 0);
  close(r.contributionMargin, 100_925.93 - 27_902, 0.5);
  assert.equal(r.complete, true);
});

test("Grab Organic 0% advertising", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      advertisingScenario: "organic",
      advertisingOrganicGrossPct: 0,
      advertisingVatDeductionStatus: "pending",
      commissionVatDeductionStatus: "pending",
    }),
  );
  close(r.advertisingGrossAmount, 0, 0.01);
  close(r.effectiveAdvertisingExpense, 0, 0.01);
});

test("Grab Standard 7% advertising (VAT included)", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      advertisingScenario: "standard",
      advertisingStandardGrossPct: 7,
      advertisingVatIncluded: true,
      advertisingVatRate: 8,
      commissionVatDeductionStatus: "pending",
      advertisingVatDeductionStatus: "pending",
    }),
  );
  close(r.advertisingGrossAmount, 109_000 * 0.07, 0.1);
});

test("Shopee missing commission marks incomplete", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      commissionEnabled: true,
      commissionRate: null,
      advertisingEnabled: false,
    }),
  );
  assert.ok(r.issues.includes("no_commission"));
  assert.equal(r.complete, false);
});

test("zero price is incomplete", () => {
  const r = calculateChannelFinance(danishHotDogInput({ grossSellingPrice: null }));
  assert.ok(r.issues.includes("no_price"));
});

test("legacy-compatible: commission disabled uses zero expense", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({ commissionEnabled: false, advertisingEnabled: false }),
  );
  assert.equal(r.effectiveCommissionExpense, 0);
});

test("recommended price recalculates actual margin after rounding", () => {
  const input = danishHotDogInput({
    commissionVatDeductionStatus: "pending",
    advertisingVatDeductionStatus: "pending",
  });
  const rec = recommendSellingPrice(input, 45);
  assert.ok(rec.price != null);
  assert.ok(rec.price! % 1000 === 0);
  assert.equal(rec.unreachable, false);
  assert.ok(rec.actualMarginPct != null && rec.actualMarginPct >= 44.5);
});

test("unreachable target margin >= 100", () => {
  const rec = recommendSellingPrice(danishHotDogInput(), 100);
  assert.equal(rec.unreachable, true);
});

test("Grab Full 8% advertising", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      advertisingScenario: "full",
      advertisingFullGrossPct: 8,
      advertisingVatIncluded: true,
      commissionVatDeductionStatus: "pending",
      advertisingVatDeductionStatus: "pending",
    }),
  );
  close(r.advertisingGrossAmount, 8_720, 0.1);
});

test("partial VAT deduction 50%", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "partial",
      commissionDeductibleVatPct: 50,
      advertisingVatDeductionStatus: "partial",
      advertisingDeductibleVatPct: 50,
      forecastDeduction: null,
    }),
  );
  close(r.deductibleCommissionVat!, 1_585.3 / 2, 0.2);
  close(r.deductibleAdvertisingVat!, 645.93 / 2, 0.2);
  assert.ok(r.contributionMargin! > 42_902 && r.contributionMargin! < 45_134);
});

test("non-deductible VAT matches pending expenses", () => {
  const pending = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "pending",
      advertisingVatDeductionStatus: "pending",
    }),
  );
  const none = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "non_deductible",
      advertisingVatDeductionStatus: "non_deductible",
    }),
  );
  close(none.contributionMargin!, pending.contributionMargin!, 0.01);
  close(none.effectiveCommissionExpense!, pending.effectiveCommissionExpense!, 0.01);
});

test("commission VAT included vs excluded", () => {
  const netMode = calculateChannelFinance(
    danishHotDogInput({
      commissionVatIncluded: false,
      commissionRate: 18.18,
      commissionVatDeductionStatus: "pending",
      advertisingEnabled: false,
    }),
  );
  const grossMode = calculateChannelFinance(
    danishHotDogInput({
      commissionVatIncluded: true,
      commissionRate: 19.6344, // ≈ 18.18 * 1.08
      commissionVatDeductionStatus: "pending",
      advertisingEnabled: false,
    }),
  );
  close(netMode.commissionGrossAmount!, grossMode.commissionGrossAmount!, 1);
});

test("commission base net_revenue differs from gross_sales", () => {
  const onGross = calculateChannelFinance(
    danishHotDogInput({
      commissionCalcBase: "gross_sales",
      advertisingEnabled: false,
      commissionVatDeductionStatus: "pending",
    }),
  );
  const onNet = calculateChannelFinance(
    danishHotDogInput({
      commissionCalcBase: "net_revenue",
      advertisingEnabled: false,
      commissionVatDeductionStatus: "pending",
    }),
  );
  assert.ok(onNet.commissionGrossAmount! < onGross.commissionGrossAmount!);
});

test("merchant-funded discount reduces net revenue once", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      merchantFundedDiscount: 9_000,
      commissionEnabled: false,
      advertisingEnabled: false,
    }),
  );
  close(r.netRevenue!, 100_000 / 1.08, 0.5);
  // Discount must not also appear as channel expense
  close(r.totalChannelExpenses!, 0, 0.01);
});

test("negative contribution margin when costs exceed revenue", () => {
  const r = calculateChannelFinance(
    danishHotDogInput({
      foodCost: 80_000,
      packagingCost: 20_000,
      commissionVatDeductionStatus: "pending",
      advertisingVatDeductionStatus: "pending",
    }),
  );
  assert.ok(r.contributionMargin! < 0);
});

test("no double-count of deductible VAT in expenses", () => {
  const full = calculateChannelFinance(
    danishHotDogInput({
      commissionVatDeductionStatus: "deductible",
      advertisingVatDeductionStatus: "deductible",
      forecastDeduction: "forecast_full",
    }),
  );
  // Effective = gross − deductible VAT; CM uses effective only once
  close(
    full.contributionMargin!,
    full.netRevenue! -
      full.totalProductCost! -
      full.effectiveCommissionExpense! -
      full.effectiveAdvertisingExpense!,
    0.01,
  );
  close(full.deductiblePlatformVat!, 2_231.22, 0.15);
});
