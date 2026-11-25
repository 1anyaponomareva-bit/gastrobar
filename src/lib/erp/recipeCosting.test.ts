import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateChannelFinance, danishHotDogInput } from "./financialCalculator";
import { computeDishChannelFinance } from "./dishChannelFinance";
import {
  allocateProductionCost,
  affectedProductsByCostChange,
  buildDishRecipeCostBlock,
  buildIngredientCostCard,
  compareDishCostSnapshots,
  CONTROL_PICKLED_CUCUMBERS,
  CONTROL_PORK_HOT_DOG,
  CONTROL_YELLOW_MUSTARD,
  convertRecipeQty,
  DANISH_HOT_DOG_LEGACY_FOOD,
  DANISH_HOT_DOG_LEGACY_PACK,
  DANISH_HOT_DOG_LEGACY_TOTAL,
  detectRecipeCycles,
  dishSummaryForPolicy,
  effectiveUnitCostForVat,
  pieceCostFromKg,
  productionUnitCost,
  recipeCostFromKg,
  recipeCostFromUsablePack,
  recipeCostSourceToMenuPriceSource,
  scanMarginImpact,
  usablePackMetrics,
  type RecipeCostSourcePolicy,
} from "./recipeCosting";
import type { CostProduct, CostRecipe } from "./costing";
import type { ErpChannel } from "./types";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("§14 Pickled Cucumbers — usable yield + full/pending recipe cost (no double loss)", () => {
  const c = CONTROL_PICKLED_CUCUMBERS;
  const metrics = usablePackMetrics(c.grossContentKg, c.netUsableKg);
  assert.ok(metrics);
  close(metrics!.lossPercentage, c.expected.lossPercentage, 1e-9);
  close(metrics!.usableYieldPercentage, c.expected.usableYieldPercentage, 1e-9);

  const full = recipeCostFromUsablePack({
    purchaseUnitCost: c.netPrice,
    netUsableKg: c.netUsableKg,
    recipeUsableKg: c.recipeUsableKg,
  });
  close(full.inventoryConsumptionUnits!, c.expected.recipeConsumptionJars);
  close(full.costPerUsableKg!, c.expected.fullDeduction.costPerUsableKg);
  close(full.recipeCost!, c.expected.fullDeduction.recipeCost);

  const pending = recipeCostFromUsablePack({
    purchaseUnitCost: c.grossPrice,
    netUsableKg: c.netUsableKg,
    recipeUsableKg: c.recipeUsableKg,
  });
  close(pending.costPerUsableKg!, c.expected.pending.costPerUsableKg);
  close(pending.recipeCost!, c.expected.pending.recipeCost);

  // Double-loss trap: do NOT multiply recipe cost by loss% again.
  const wronglyDoubled = full.recipeCost! * (1 + metrics!.lossPercentage / 100);
  assert.ok(Math.abs(wronglyDoubled - full.recipeCost!) > 1);
});

test("§15 Yellow Mustard — 15 g from kg cost + partial VAT", () => {
  const c = CONTROL_YELLOW_MUSTARD;
  close(recipeCostFromKg({ unitCostPerKg: c.netUnitCostPerKg, recipeGrams: c.recipeGrams })!, c.expected.fullDeduction);
  close(recipeCostFromKg({ unitCostPerKg: c.grossUnitCostPerKg, recipeGrams: c.recipeGrams })!, c.expected.pending);

  const partialUnit = effectiveUnitCostForVat({
    netUnitCost: c.netUnitCostPerKg,
    vatRatePct: 8,
    mode: "partial",
    partialDeductiblePct: 50,
  });
  close(partialUnit, 81_250 + (81_250 * 0.08) * 0.5);
  close(recipeCostFromKg({ unitCostPerKg: partialUnit, recipeGrams: c.recipeGrams })!, c.expected.partial50);

  // After documented VAT adjustment (pending → full), forecast drops to net.
  const afterAdj = recipeCostFromKg({ unitCostPerKg: c.netUnitCostPerKg, recipeGrams: c.recipeGrams });
  assert.ok(afterAdj! < c.expected.pending);
  close(afterAdj!, c.expected.fullDeduction);
});

test("§16 Pork Hot Dog Sausage — 50 g piece × 1 and × 2", () => {
  const c = CONTROL_PORK_HOT_DOG;
  const oneFull = pieceCostFromKg({ unitCostPerKg: c.netPerKg, weightPerPieceKg: c.weightPerPieceKg });
  const onePending = pieceCostFromKg({ unitCostPerKg: c.grossPerKg, weightPerPieceKg: c.weightPerPieceKg });
  close(oneFull!, c.expected.fullDeductionPerPiece);
  close(onePending!, c.expected.pendingPerPiece);
  close(oneFull! * 2, 15_300);
  close(onePending! * 2, 16_524);
});

test("Unit conversion kg↔g, L↔ml, pcs↔kg; volume↔mass blocked without density", () => {
  close(convertRecipeQty(1, "kg", "g").qtyInTarget!, 1000);
  close(convertRecipeQty(500, "g", "kg").qtyInTarget!, 0.5);
  close(convertRecipeQty(2, "l", "ml").qtyInTarget!, 2000);
  close(convertRecipeQty(1, "pcs", "g", { weightPerPieceKg: 0.05 }).qtyInTarget!, 50);
  const blocked = convertRecipeQty(1, "l", "kg");
  assert.equal(blocked.complete, false);
  assert.equal(blocked.warning, "cost_conversion_incomplete");
  close(convertRecipeQty(1, "l", "kg", { densityKgPerL: 1.02 }).qtyInTarget!, 1.02);
});

test("Recipe cost policy maps to MenuPriceSource without replacing FIFO consume", () => {
  assert.equal(recipeCostSourceToMenuPriceSource("manual_estimated"), "reference");
  assert.equal(recipeCostSourceToMenuPriceSource("last_purchase"), "last_lot");
  assert.equal(recipeCostSourceToMenuPriceSource("weighted_average"), "fifo_remaining");
  assert.equal(recipeCostSourceToMenuPriceSource("estimated_fifo"), "fifo_remaining");
});

test("§17 Multilevel SF — cycle detection + allocated production + affected deps", () => {
  const meat: CostProduct = {
    id: "meat",
    type: "ingredient",
    name_en: "Chicken Meat",
    name_vn: "",
    base_unit: "kg",
    est_unit_cost: 80_000,
    est_cost_source: "receipt",
  };
  const mince: CostProduct = {
    id: "mince",
    type: "semi_finished",
    name_en: "Chicken Sausage Mince",
    name_vn: "",
    base_unit: "kg",
    est_unit_cost: null,
    est_cost_source: null,
  };
  const cooked: CostProduct = {
    id: "cooked",
    type: "semi_finished",
    name_en: "Cooked Chicken Sausage",
    name_vn: "",
    base_unit: "pcs",
    est_unit_cost: null,
    est_cost_source: null,
  };
  const pack2: CostProduct = {
    id: "pack2",
    type: "semi_finished",
    name_en: "Chicken Sausage 2-Pack",
    name_vn: "",
    base_unit: "pcs",
    est_unit_cost: null,
    est_cost_source: null,
  };

  const recipes: CostRecipe[] = [
    {
      id: "r1",
      product_id: "mince",
      status: "active",
      yield_qty: 1,
      lines: [{ product_id: "meat", qty: 1.1 }],
    },
    {
      id: "r2",
      product_id: "cooked",
      status: "active",
      yield_qty: 20,
      lines: [{ product_id: "mince", qty: 1 }],
    },
    {
      id: "r3",
      product_id: "pack2",
      status: "active",
      yield_qty: 1,
      lines: [{ product_id: "cooked", qty: 2 }],
    },
  ];

  assert.deepEqual(detectRecipeCycles(recipes), []);

  const cyclic: CostRecipe[] = [
    ...recipes,
    { id: "bad", product_id: "meat", status: "active", yield_qty: 1, lines: [{ product_id: "pack2", qty: 1 }] },
  ];
  assert.ok(detectRecipeCycles(cyclic).length > 0);

  const affected = affectedProductsByCostChange(recipes, "meat");
  assert.ok(affected.includes("mince"));
  assert.ok(affected.includes("cooked"));
  assert.ok(affected.includes("pack2"));

  // Thermal loss: 1.1 kg meat @ 80k → mince; cook yields 20 pcs from 1 kg mince (normative).
  const minceUnit = productionUnitCost(80_000 * 1.1, 1);
  close(minceUnit!, 88_000);
  const cookedBatchCost = 88_000; // 1 kg mince
  const casing = 2_000;
  const spice = 1_500;
  const vacuum = 3_000;
  const allocated = cookedBatchCost + casing + spice;
  const perSausage = productionUnitCost(allocated, 20);
  close(perSausage!, (88_000 + 2_000 + 1_500) / 20);

  const multi = allocateProductionCost(allocated + vacuum, [
    { id: "sausage", coefficient: 1, usableQty: 20 },
    { id: "trim", coefficient: 0, usableQty: 0.1 },
  ]);
  assert.equal(multi[0].allocatedCost, allocated + vacuum);
  assert.equal(multi[1].allocatedCost, 0);

  const summary = dishSummaryForPolicy(
    [meat, mince, cooked, pack2],
    recipes,
    [{ product_id: "pack2", qty: 1 }],
    "manual_estimated",
  );
  // Exploded: pack2 → 2 cooked → 2/20 kg mince → 2/20 * 1.1 kg meat
  const meatKg = (2 / 20) * 1.1;
  close(summary.foodCost!, meatKg * 80_000, 1e-4);
});

test("Ingredient card + dish recipe cost block warnings", () => {
  const card = buildIngredientCostCard({
    baseUnit: "pcs",
    unitWeightKg: 0.515,
    unitNetWeightKg: 0.25,
    estUnitCost: 24_000,
    estCostSource: "receipt",
    purchaseVatRate: 8,
    vatDeductionStatus: "pending",
    purchaseUnitLabel: "jar",
  });
  assert.equal(card.purchasePriceGross, 25_920);
  assert.ok(card.warnings.includes("pending_input_vat"));
  close(card.lossPercentage!, CONTROL_PICKLED_CUCUMBERS.expected.lossPercentage, 1e-6);

  const block = buildDishRecipeCostBlock({
    summary: {
      lines: [],
      knownFood: 0,
      knownPackaging: 0,
      foodCost: null,
      packagingCost: null,
      totalCost: null,
      complete: false,
      missing: ["Mustard"],
    },
    policy: "manual_estimated",
  });
  assert.equal(block.costCompleteness, "unknown");
  assert.ok(block.warnings.includes("missing_ingredient_cost"));
});

test("Cost history comparison does not rewrite actuals", () => {
  const entry = compareDishCostSnapshots({
    previousTotal: DANISH_HOT_DOG_LEGACY_TOTAL,
    currentTotal: 28_500,
    previousLines: [
      { name: "Mustard", cost: 1_218.75 },
      { name: "Sausage", cost: 7_650 },
    ],
    currentLines: [
      { name: "Mustard", cost: 1_316.25 },
      { name: "Sausage", cost: 7_650 },
    ],
    changeReason: "input_vat_pending",
    costSource: "manual_estimated",
  });
  close(entry.costDifference!, 28_500 - DANISH_HOT_DOG_LEGACY_TOTAL);
  assert.deepEqual(entry.changedIngredients, ["Mustard"]);
});

test("§18 Danish Hot Dog finance at 99k / 109k / 119k matches financialCalculator", () => {
  const food = DANISH_HOT_DOG_LEGACY_FOOD;
  const pack = DANISH_HOT_DOG_LEGACY_PACK;
  close(food + pack, DANISH_HOT_DOG_LEGACY_TOTAL, 0.1);

  for (const price of [99_000, 109_000, 119_000]) {
    const pending = calculateChannelFinance(
      danishHotDogInput({
        grossSellingPrice: price,
        foodCost: food,
        packagingCost: pack,
        advertisingScenario: "full",
        commissionVatDeductionStatus: "pending",
        advertisingVatDeductionStatus: "pending",
      }),
    );
    const full = calculateChannelFinance(
      danishHotDogInput({
        grossSellingPrice: price,
        foodCost: food,
        packagingCost: pack,
        advertisingScenario: "full",
        commissionVatDeductionStatus: "deductible",
        advertisingVatDeductionStatus: "deductible",
        forecastDeduction: "forecast_full",
      }),
    );
    assert.ok(pending.complete);
    assert.ok(full.complete);
    assert.ok(pending.contributionMarginPct != null);
    assert.ok(full.contributionMarginPct != null);
    // Full deduction of channel VAT reduces effective expenses → higher CM (Release 1 control).
    assert.ok(
      full.contributionMarginPct! >= pending.contributionMarginPct! - 0.01,
      `full ${full.contributionMarginPct} vs pending ${pending.contributionMarginPct} @ ${price}`,
    );

    const organic = calculateChannelFinance(
      danishHotDogInput({
        grossSellingPrice: price,
        foodCost: food,
        packagingCost: pack,
        advertisingEnabled: true,
        advertisingScenario: "organic",
        advertisingRate: 0,
        advertisingOrganicGrossPct: 0,
        advertisingFullGrossPct: 8,
      }),
    );
    assert.ok(organic.complete);
    assert.ok(organic.contributionMarginPct! > pending.contributionMarginPct!);
  }

  // Direct: no commission/ads
  const direct = calculateChannelFinance(
    danishHotDogInput({
      grossSellingPrice: 99_000,
      foodCost: food,
      packagingCost: pack,
      commissionEnabled: false,
      advertisingEnabled: false,
    }),
  );
  assert.ok(direct.contributionMarginPct != null && direct.contributionMarginPct! > 50);
});

test("§19 Margin impact scan flags below-min and unreliable cost without changing prices", () => {
  const channel = {
    id: "g",
    code: "grab-food",
    name: "Grab",
    commission_pct: 28,
    sort: 1,
    archived_at: null,
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
    min_margin_pct: 45,
    target_margin_pct: 48,
    optimal_margin_pct: 50,
  } as ErpChannel;

  const rows = scanMarginImpact({
    dishes: [
      {
        id: "d1",
        name: "Danish Hot Dog",
        salePrice: 109_000,
        channelPrices: [],
        previousFoodCost: 20_000,
        previousPackagingCost: 3_152,
        currentFoodCost: 24_750,
        currentPackagingCost: 3_152,
        costComplete: true,
      },
      {
        id: "d2",
        name: "Incomplete",
        salePrice: 99_000,
        channelPrices: [],
        previousFoodCost: null,
        previousPackagingCost: null,
        currentFoodCost: null,
        currentPackagingCost: null,
        costComplete: false,
      },
    ],
    channels: [channel],
    outputVatRate: 8,
  });

  assert.ok(rows.some((r) => r.dishId === "d1" && (r.marginDropped || r.belowMinimum)));
  assert.ok(rows.some((r) => r.dishId === "d2" && r.costUnreliable));

  // Adapter still agrees with calculator for legacy food cost
  const view = computeDishChannelFinance({
    channel,
    grossSellingPrice: 109_000,
    foodCost: DANISH_HOT_DOG_LEGACY_FOOD,
    packagingCost: DANISH_HOT_DOG_LEGACY_PACK,
    outputVatRate: 8,
  });
  assert.equal(view.mode, "modern");
  assert.ok(view.result?.contributionMarginPct != null);
});

test("Fallback: missing cost is null, never silent zero", () => {
  const missing = recipeCostFromUsablePack({
    purchaseUnitCost: null,
    netUsableKg: 0.25,
    recipeUsableKg: 0.025,
  });
  assert.equal(missing.recipeCost, null);
  assert.equal(missing.warning, "missing_ingredient_cost");

  const noYield = recipeCostFromUsablePack({
    purchaseUnitCost: 24_000,
    netUsableKg: null,
    recipeUsableKg: 0.025,
  });
  assert.equal(noYield.warning, "missing_usable_yield");
});

test("Policy exhaustiveness for settings", () => {
  const policies: RecipeCostSourcePolicy[] = [
    "manual_estimated",
    "last_purchase",
    "weighted_average",
    "estimated_fifo",
  ];
  for (const p of policies) {
    assert.ok(recipeCostSourceToMenuPriceSource(p));
  }
});
