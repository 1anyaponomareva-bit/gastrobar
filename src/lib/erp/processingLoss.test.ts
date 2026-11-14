import assert from "node:assert/strict";
import { test } from "node:test";
import { finalCostPerKg, LOSS_METHODS, netFactor, processedUnitCost, usableWeight } from "./costing";

const thawThenClean = { loss_defrost_pct: 10, loss_clean_pct: 20 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≠ ${expected}`);

test("1 kg, 10% thaw, 20% clean → 0.72 sequential, not 0.70 additive", () => {
  const usable = usableWeight(1, thawThenClean, ["defrost", "clean"]);
  close(usable, 0.72);
  assert.ok(Math.abs(usable - 0.7) > 1e-9, "must not add percents");
  close(netFactor(thawThenClean, ["defrost", "clean"]), 0.72);
});

test("finalCostPerKg is purchaseCost / usableWeight", () => {
  const usable = usableWeight(1, thawThenClean, ["defrost", "clean"]);
  const cost = finalCostPerKg(100_000, usable);
  assert.ok(cost !== null);
  assert.ok(Math.abs(cost - 100_000 / 0.72) < 1e-6);
  assert.ok(Math.abs(processedUnitCost(100_000, thawThenClean, ["defrost", "clean"])! - 100_000 / 0.72) < 1e-6);
});

test("a third stage compounds on the remainder", () => {
  const usable = usableWeight(1, { ...thawThenClean, loss_boil_pct: 10 }, ["defrost", "clean", "boil"]);
  close(usable, 0.9 * 0.8 * 0.9);
});

test("unused and empty stages multiply by 1", () => {
  close(usableWeight(1, thawThenClean, []), 1);
  close(usableWeight(2, {}, LOSS_METHODS), 2);
  close(usableWeight(1, { loss_defrost_pct: 10 }, ["defrost", "clean"]), 0.9);
});

test("stage order is thaw → clean even if the line lists clean first", () => {
  close(usableWeight(1, thawThenClean, ["clean", "defrost"]), 0.72);
  assert.ok(LOSS_METHODS.indexOf("defrost") < LOSS_METHODS.indexOf("clean"));
});

test("zero usable weight does not divide", () => {
  assert.equal(finalCostPerKg(100_000, 0), null);
  assert.equal(finalCostPerKg(null, 0.72), null);
  assert.equal(processedUnitCost(100_000, { loss_defrost_pct: 100 }, ["defrost"]), null);
});
