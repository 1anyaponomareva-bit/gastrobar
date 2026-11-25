import assert from "node:assert/strict";
import { test } from "node:test";
import {
  channelCalcMode,
  computeDishChannelFinance,
  marginBandForChannel,
  resolveDishOutputVatRate,
} from "./dishChannelFinance";
import { classifyDishVatField, effectiveOutputVatRate } from "./vat";
import type { ErpChannel } from "./types";

const grab = (over: Partial<ErpChannel> = {}): ErpChannel =>
  ({
    id: "g",
    code: "grab-food",
    name: "Grab Food",
    commission_pct: 28,
    legacy_commission_pct: 28,
    sort: 1,
    commission_enabled: true,
    commission_rate: 18.18,
    commission_vat_included: false,
    commission_vat_rate: 8,
    commission_calc_base: "gross_sales",
    commission_vat_deduction_status: "pending",
    advertising_enabled: true,
    advertising_scenario: "full",
    advertising_rate: 8,
    advertising_vat_included: true,
    advertising_vat_rate: 8,
    advertising_calc_base: "gross_sales",
    advertising_vat_deduction_status: "pending",
    advertising_organic_gross_pct: 0,
    advertising_standard_gross_pct: 7,
    advertising_full_gross_pct: 8,
    finance_preliminary: true,
    output_vat_rate: 8,
    selling_price_includes_vat: true,
    min_margin_pct: 40,
    target_margin_pct: 45,
    optimal_margin_pct: 50,
    ...over,
  }) as ErpChannel;

test("Danish Hot Dog via dish adapter — pending ~42.51%", () => {
  const view = computeDishChannelFinance({
    channel: grab(),
    grossSellingPrice: 109_000,
    foodCost: 24_750,
    packagingCost: 3_152,
    outputVatRate: 8,
  });
  assert.equal(view.mode, "modern");
  assert.ok(view.result);
  assert.ok(Math.abs(view.result!.contributionMargin! - 42_902.43) < 0.5);
  assert.ok(Math.abs(view.result!.contributionMarginPct! - 42.51) < 0.05);
});

test("Danish Hot Dog full VAT simulation — ~44.72%", () => {
  const view = computeDishChannelFinance({
    channel: grab(),
    grossSellingPrice: 109_000,
    foodCost: 24_750,
    packagingCost: 3_152,
    outputVatRate: 8,
    overrides: { vatSimulation: "full" },
  });
  assert.equal(view.simulation, true);
  assert.ok(Math.abs(view.result!.contributionMargin! - 45_133.65) < 0.5);
  assert.ok(Math.abs(view.result!.contributionMarginPct! - 44.72) < 0.05);
});

test("Shopee without rates is incomplete", () => {
  const mode = channelCalcMode(
    grab({
      code: "shopee-food-2",
      name: "Shopee Food",
      commission_enabled: false,
      commission_rate: null,
      commission_pct: null,
      advertising_enabled: false,
      advertising_rate: null,
      advertising_scenario: "custom",
      finance_preliminary: true,
    }),
  );
  assert.equal(mode, "incomplete");
});

test("Direct modern with zero commission", () => {
  const mode = channelCalcMode(
    grab({
      code: "direct",
      name: "Direct",
      commission_enabled: false,
      commission_rate: 0,
      commission_pct: 0,
      advertising_enabled: false,
      advertising_scenario: "organic",
      advertising_organic_gross_pct: 0,
      finance_preliminary: false,
    }),
  );
  assert.equal(mode, "modern");
});

test("legacy when finance schema missing", () => {
  const mode = channelCalcMode({
    id: "x",
    code: "old",
    name: "Old",
    commission_pct: 20,
    sort: 1,
  } as ErpChannel);
  assert.equal(mode, "legacy");
});

test("output VAT: channel before global", () => {
  const rate = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
    exceptions: [],
    channel: { output_vat_rate: 8 },
  });
  assert.equal(rate, 8);
});

test("output VAT: dish exception wins over channel", () => {
  const rate = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
    exceptions: [{ id: "1", dish_id: "d1", vat_rate: 5, direction: "output", scope_kind: "dish" } as never],
    channel: { output_vat_rate: 8 },
    dishId: "d1",
  });
  assert.equal(rate, 5);
});

test("output VAT: legacy dish.vat_rate never overrides category/channel", () => {
  const rate = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 8 },
    exceptions: [{ id: "1", category_id: "c1", vat_rate: 0, direction: "output", scope_kind: "category" } as never],
    channel: { output_vat_rate: 8 },
    categoryId: "c1",
    dishVatRate: 5,
  });
  assert.equal(rate, 0);
});

test("output VAT: global 8→10 inherits even when legacy dish.vat_rate stays 8", () => {
  const before = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 8 },
    exceptions: [],
    channel: null,
    dishVatRate: 8,
  });
  assert.equal(before, 8);
  const after = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
    exceptions: [],
    channel: null,
    dishVatRate: 8, // stale auto-seed — must NOT become an individual exception
  });
  assert.equal(after, 10);
});

test("output VAT: dish Output exception survives global change", () => {
  const ex = [{ id: "1", dish_id: "d1", vat_rate: 0, direction: "output", scope_kind: "dish" }] as never[];
  const at8 = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 8 },
    exceptions: ex,
    channel: { output_vat_rate: 8 },
    dishId: "d1",
    dishVatRate: 8,
  });
  const at10 = resolveDishOutputVatRate({
    settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
    exceptions: ex,
    channel: { output_vat_rate: 10 },
    dishId: "d1",
    dishVatRate: 8,
  });
  assert.equal(at8, 0);
  assert.equal(at10, 0);
});

test("output VAT: category exception then channel then global", () => {
  assert.equal(
    resolveDishOutputVatRate({
      settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
      exceptions: [],
      channel: { output_vat_rate: 8 },
    }),
    8,
  );
  assert.equal(
    resolveDishOutputVatRate({
      settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
      exceptions: [{ id: "1", category_id: "c1", vat_rate: 5, direction: "output", scope_kind: "category" } as never],
      channel: { output_vat_rate: 8 },
      categoryId: "c1",
    }),
    5,
  );
});

test("classifyDishVatField: inherited vs legacy_field vs explicit_override", () => {
  assert.equal(classifyDishVatField({ dishVatRate: 8, globalDefault: 8, hasDishOutputException: false }), "inherited");
  assert.equal(classifyDishVatField({ dishVatRate: null, globalDefault: 8, hasDishOutputException: false }), "inherited");
  assert.equal(classifyDishVatField({ dishVatRate: 8, globalDefault: 10, hasDishOutputException: false }), "legacy_field");
  assert.equal(classifyDishVatField({ dishVatRate: 0, globalDefault: 8, hasDishOutputException: false }), "legacy_field");
  assert.equal(classifyDishVatField({ dishVatRate: 8, globalDefault: 8, hasDishOutputException: true }), "explicit_override");
});

test("effectiveOutputVatRate ignores legacy dish.vat_rate after global change", () => {
  assert.equal(
    effectiveOutputVatRate(
      { default_output_vat_rate: 10 },
      [],
      { dishId: "d1", dishVatRate: 8 },
    ),
    10,
  );
});

test("legacy dish.vat_rate does not change channel finance when global moves 8→10", () => {
  const ch = grab({ output_vat_rate: null });
  const at8 = computeDishChannelFinance({
    channel: ch,
    grossSellingPrice: 109_000,
    foodCost: 24_750,
    packagingCost: 3_152,
    outputVatRate: resolveDishOutputVatRate({
      settings: { output_vat_enabled: true, default_output_vat_rate: 8 },
      exceptions: [],
      channel: ch,
      dishVatRate: 8,
    }),
  });
  const at10 = computeDishChannelFinance({
    channel: ch,
    grossSellingPrice: 109_000,
    foodCost: 24_750,
    packagingCost: 3_152,
    outputVatRate: resolveDishOutputVatRate({
      settings: { output_vat_enabled: true, default_output_vat_rate: 10 },
      exceptions: [],
      channel: ch,
      dishVatRate: 8,
    }),
  });
  assert.ok(Math.abs(at8.result!.outputVatAmount! - 8_074.07) < 0.2);
  // 109000 / 1.10
  assert.ok(Math.abs(at10.result!.netRevenue! - 99_090.909) < 0.5);
  assert.notEqual(at8.result!.contributionMarginPct, at10.result!.contributionMarginPct);
});

test("margin bands use channel thresholds", () => {
  const ch = { min_margin_pct: 40, target_margin_pct: 45, optimal_margin_pct: 50 };
  assert.equal(marginBandForChannel(39, ch), "critical");
  assert.equal(marginBandForChannel(42, ch), "acceptable");
  assert.equal(marginBandForChannel(47, ch), "good");
  assert.equal(marginBandForChannel(50, ch), "excellent");
});

test("ads scenario override does not require mutating channel", () => {
  const organic = computeDishChannelFinance({
    channel: grab(),
    grossSellingPrice: 109_000,
    foodCost: 24_750,
    packagingCost: 3_152,
    outputVatRate: 8,
    overrides: { advertisingScenario: "organic" },
  });
  assert.equal(organic.result!.advertisingGrossAmount, 0);
  assert.equal(grab().advertising_scenario, "full");
});
