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

test("nested prep yield cost uses the prep SKU, not a second explosion", () => {
  const mix: CostProduct = {
    id: "mix",
    type: "semi_finished",
    name_en: "Meat mix",
    name_vn: "Thịt xay",
    base_unit: "kg",
    est_unit_cost: 90_000,
    est_cost_source: "receipt",
  };
  const casing: CostProduct = {
    id: "casing",
    type: "ingredient",
    name_en: "Casing",
    name_vn: "Vỏ",
    base_unit: "pcs",
    est_unit_cost: 1_000,
    est_cost_source: "manual",
  };
  const exploded = buildCostContext(
    [onion, mix, casing],
    [{ id: "mix-r", product_id: "mix", status: "active", yield_qty: 1, lines: [{ product_id: "onion", qty: 1 }] }],
  );
  const sku = buildCostContext(
    [onion, mix, casing],
    [{ id: "mix-r", product_id: "mix", status: "active", yield_qty: 1, lines: [{ product_id: "onion", qty: 1 }] }],
    { explodeRecipes: false },
  );
  assert.equal(
    compositionYieldCost(exploded, [
      { product_id: "mix", qty: 0.8 },
      { product_id: "casing", qty: 10 },
    ]),
    0.8 * 20_000 + 10_000,
  );
  assert.equal(
    compositionYieldCost(sku, [
      { product_id: "mix", qty: 0.8 },
      { product_id: "casing", qty: 10 },
    ]),
    0.8 * 90_000 + 10_000,
  );
});

test("stale quote rows still use the product card price", () => {
  const ctx = buildCostContext([onion], [], {
    quotes: [{ product_id: "onion", last_lot: null, fifo_remaining: null, reference: null }],
  });
  assert.equal(compositionYieldCost(ctx, [{ product_id: "onion", qty: 1 }]), 20_000);
});

test("prep composition uses the latest lot when the card price is empty", () => {
  const ctx = buildCostContext([{ ...onion, est_unit_cost: null, est_cost_source: null }], [], {
    quotes: [{ product_id: "onion", last_lot: 15_000, fifo_remaining: null, reference: null }],
  });
  assert.equal(compositionYieldCost(ctx, [{ product_id: "onion", qty: 2 }]), 30_000);
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
