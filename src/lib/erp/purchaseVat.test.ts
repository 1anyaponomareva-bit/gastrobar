import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquisitionInventoryAmount,
  allocateAcquisitionCosts,
  calculatePurchaseLineVat,
  effectiveInventoryCostComponents,
  resolvePurchaseInputVatRate,
  splitDeductibleVat,
  splitPurchaseVat,
} from "./purchaseVat";

const close = (a: number | null, b: number, eps = 0.02) => {
  assert.ok(a != null);
  assert.ok(Math.abs(a! - b) <= eps, `expected ${b}, got ${a}`);
};

test("Yellow Mustard — full deduction", () => {
  const r = calculatePurchaseLineVat({
    qty: 20,
    unitPrice: 81_250,
    vatRate: 8,
    pricesIncludeVat: false,
    vatDeductionStatus: "deductible",
  });
  close(r.netTotal, 1_625_000);
  close(r.vatTotal, 130_000);
  close(r.grossTotal, 1_755_000);
  close(r.pendingVatAmount, 0);
  close(r.nonDeductibleVatAmount, 0);
  close(r.effectiveInventoryCost, 1_625_000);
  close(r.effectiveUnitCost, 81_250);
});

test("Yellow Mustard — pending / no deduction", () => {
  const r = calculatePurchaseLineVat({
    qty: 20,
    unitPrice: 81_250,
    vatRate: 8,
    pricesIncludeVat: false,
    vatDeductionStatus: "pending",
  });
  close(r.pendingVatAmount, 130_000);
  close(r.nonDeductibleVatAmount, 0);
  close(r.effectiveInventoryCost, 1_755_000);
  close(r.effectiveUnitCost, 87_750);
});

test("Yellow Mustard — partial 50%", () => {
  const r = calculatePurchaseLineVat({
    qty: 20,
    unitPrice: 81_250,
    vatRate: 8,
    pricesIncludeVat: false,
    vatDeductionStatus: "partial",
    deductibleVatPct: 50,
  });
  close(r.deductibleVatAmount, 65_000);
  close(r.nonDeductibleVatAmount, 65_000);
  close(r.pendingVatAmount, 0);
  close(r.effectiveInventoryCost, 1_690_000);
  close(r.effectiveUnitCost, 84_500);
});

test("price including VAT splits net/gross", () => {
  const r = calculatePurchaseLineVat({
    qty: 20,
    unitPrice: 87_750,
    vatRate: 8,
    pricesIncludeVat: true,
    vatDeductionStatus: "deductible",
  });
  close(r.grossTotal, 1_755_000);
  close(r.netTotal, 1_625_000, 0.05);
});

test("pending VAT is not double-counted with non-deductible", () => {
  const split = splitPurchaseVat(100, "pending", 50);
  assert.deepEqual(split, { deductible: 0, nonDeductible: 0, pending: 100 });
  close(effectiveInventoryCostComponents({ net: 1000, nonDeductibleVat: split.nonDeductible, pendingVat: split.pending }), 1100);
  // legacy helper still reports cost-equivalent nonDeductible for callers that only look at that field
  assert.deepEqual(splitDeductibleVat(100, "pending", 50), { deductible: 0, nonDeductible: 100 });
  assert.deepEqual(splitDeductibleVat(100, "non_deductible", 50), { deductible: 0, nonDeductible: 100 });
});

test("acquisition fee: deductible VAT excluded from inventory", () => {
  close(
    acquisitionInventoryAmount({
      kind: "transport",
      amount: 100_000,
      vatRate: 8,
      vatIncluded: false,
      vatDeductionStatus: "deductible",
    }),
    100_000,
  );
});

test("acquisition fee: pending VAT included once", () => {
  close(
    acquisitionInventoryAmount({
      kind: "delivery",
      amount: 100_000,
      vatRate: 8,
      vatIncluded: false,
      vatDeductionStatus: "pending",
    }),
    108_000,
  );
});

test("allocate acquisition by net weight + penny drift", () => {
  const alloc = allocateAcquisitionCosts([1_000_000, 500_000, 0], 30_000);
  close(alloc[0], 20_000);
  close(alloc[1], 10_000);
  close(alloc[2], 0);
  close(alloc.reduce((s, x) => s + x, 0), 30_000);
});

test("line effective cost includes allocated acquisition", () => {
  const r = calculatePurchaseLineVat({
    qty: 20,
    unitPrice: 81_250,
    vatRate: 8,
    pricesIncludeVat: false,
    vatDeductionStatus: "deductible",
    allocatedAcquisitionCost: 20_000,
  });
  close(r.effectiveInventoryCost, 1_645_000);
});

test("input VAT priority: line → product exception → category → global", () => {
  assert.equal(
    resolvePurchaseInputVatRate({
      lineVatRate: 5,
      productExceptionRate: 10,
      categoryExceptionRate: 0,
      defaultRate: 8,
    }),
    5,
  );
  assert.equal(
    resolvePurchaseInputVatRate({
      lineVatRate: null,
      productExceptionRate: 10,
      categoryExceptionRate: 0,
      defaultRate: 8,
    }),
    10,
  );
  assert.equal(
    resolvePurchaseInputVatRate({
      lineVatRate: null,
      productExceptionRate: null,
      categoryExceptionRate: 0,
      defaultRate: 8,
    }),
    0,
  );
  assert.equal(
    resolvePurchaseInputVatRate({
      lineVatRate: null,
      productExceptionRate: null,
      categoryExceptionRate: null,
      defaultRate: 8,
    }),
    8,
  );
});
