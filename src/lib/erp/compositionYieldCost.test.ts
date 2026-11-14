import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCostContext, compositionYieldCost, type CostProduct } from "./costing";

const onion: CostProduct = {
  id: "onion",
  type: "ingredient",
  name_en: "Onion",
  name_vn: "Hành",
  base_unit: "kg",
  est_unit_cost: 20_000,
  est_cost_source: "manual",
};

const oil: CostProduct = {
  id: "oil",
  type: "ingredient",
  name_en: "Oil",
  name_vn: "Dầu",
  base_unit: "l",
  est_unit_cost: 40_000,
  est_cost_source: "manual",
};

test("yield cost is the sum of gross line costs", () => {
  const ctx = buildCostContext([onion, oil], []);
  assert.equal(
    compositionYieldCost(ctx, [
      { product_id: "onion", qty: 1 },
      { product_id: "oil", qty: 0.1 },
    ]),
    24_000,
  );
});

test("cut parts are not extra purchases in the yield cost", () => {
  const ctx = buildCostContext([onion], []);
  const lines = [{ product_id: "onion", qty: 1, parts: [{ name: "brunoise", grams: 400 }] }];
  assert.equal(compositionYieldCost(ctx, lines), 20_000);
  assert.equal(compositionYieldCost(ctx, [{ product_id: "onion", qty: 1 }]), 20_000);
});

test("missing price makes yield cost incomplete; blank rows are skipped", () => {
  const ctx = buildCostContext([{ ...onion, est_unit_cost: null, est_cost_source: null }, oil], []);
  assert.equal(compositionYieldCost(ctx, [{ product_id: "onion", qty: 1 }]), null);
  assert.equal(
    compositionYieldCost(buildCostContext([onion], []), [
      { product_id: "onion", qty: 1 },
      { product_id: null, qty: null },
    ]),
    20_000,
  );
  assert.equal(compositionYieldCost(buildCostContext([onion], []), [{ product_id: "onion", qty: null }]), null);
  assert.equal(compositionYieldCost(buildCostContext([onion], []), []), null);
});
