import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPurchaseVatState, calculateVatCostAdjustment } from "./vatCostAdjustment";

const close = (a: number | null | undefined, b: number, eps = 0.02) => {
  assert.ok(a != null);
  assert.ok(Math.abs(a! - b) <= eps, `expected ${b}, got ${a}`);
};

const mustardPending = () =>
  buildPurchaseVatState({
    net: 1_625_000,
    vat: 130_000,
    status: "pending",
  });

test("Yellow Mustard Pending → Deductible with 12/8 split", () => {
  const r = calculateVatCostAdjustment({
    previous: mustardPending(),
    newStatus: "deductible",
    originalQty: 20,
    remainingQty: 12,
  });
  close(r.previousUnitCost, 87_750);
  close(r.newUnitCost, 81_250);
  close(r.inventoryCostAdjustment, -130_000);
  close(r.remainingInventoryAdjustment, -78_000);
  close(r.consumedCostAdjustment, -52_000);
  close(r.vatDeductionDifference, 130_000);
  // remaining value 12 * 87750 = 1053000 → after 975000
  close(12 * (r.previousUnitCost ?? 0) + r.remainingInventoryAdjustment, 975_000);
  assert.ok(r.warnings.length >= 1);
  assert.equal(r.allocations.some((a) => a.bucket === "unallocated"), true);
});

test("Yellow Mustard Pending → Partial 50%", () => {
  const r = calculateVatCostAdjustment({
    previous: mustardPending(),
    newStatus: "partial",
    newDeductibleVatPct: 50,
    originalQty: 20,
    remainingQty: 12,
  });
  close(r.next.deductibleVatAmount, 65_000);
  close(r.next.nonDeductibleVatAmount, 65_000);
  close(r.next.effectiveInventoryCost, 1_690_000);
  close(r.newUnitCost, 84_500);
  close(r.inventoryCostAdjustment, -65_000);
  close(r.remainingInventoryAdjustment, -39_000);
  close(r.consumedCostAdjustment, -26_000);
});

test("Yellow Mustard Partial 50% → Full (only remaining 65k)", () => {
  const previous = buildPurchaseVatState({
    net: 1_625_000,
    vat: 130_000,
    status: "partial",
    deductibleVatPct: 50,
  });
  const r = calculateVatCostAdjustment({
    previous,
    newStatus: "deductible",
    originalQty: 20,
    remainingQty: 12,
  });
  close(r.vatDeductionDifference, 65_000);
  close(r.inventoryCostAdjustment, -65_000);
  close(r.remainingInventoryAdjustment, -39_000);
  close(r.consumedCostAdjustment, -26_000);
});

test("Yellow Mustard Deductible → Non-Deductible increases cost", () => {
  const previous = buildPurchaseVatState({
    net: 1_625_000,
    vat: 130_000,
    status: "deductible",
  });
  const r = calculateVatCostAdjustment({
    previous,
    newStatus: "non_deductible",
    originalQty: 20,
    remainingQty: 20,
  });
  close(r.vatDeductionDifference, -130_000);
  close(r.inventoryCostAdjustment, 130_000);
  close(r.remainingInventoryAdjustment, 130_000);
  close(r.consumedCostAdjustment, 0);
});

test("fully unused lot: all adjustment on remaining", () => {
  const r = calculateVatCostAdjustment({
    previous: mustardPending(),
    newStatus: "deductible",
    originalQty: 20,
    remainingQty: 20,
  });
  close(r.remainingInventoryAdjustment, -130_000);
  close(r.consumedCostAdjustment, 0);
  assert.equal(r.warnings.length, 0);
});

test("fully consumed lot: all unallocated / write-off", () => {
  const r = calculateVatCostAdjustment({
    previous: mustardPending(),
    newStatus: "deductible",
    originalQty: 20,
    remainingQty: 0,
    writeOffQty: 5,
  });
  close(r.remainingInventoryAdjustment, 0);
  close(r.writeOffAdjustment, -32_500);
  close(r.unallocatedAdjustment, -97_500);
  close(r.consumedCostAdjustment, -130_000);
});

test("allocations sum to inventory cost adjustment", () => {
  const r = calculateVatCostAdjustment({
    previous: mustardPending(),
    newStatus: "deductible",
    originalQty: 20,
    remainingQty: 12,
    transferredRemainingQty: 4,
    writeOffQty: 2,
  });
  const sum = r.allocations.reduce((s, a) => s + a.amount, 0);
  close(sum, r.inventoryCostAdjustment);
});
