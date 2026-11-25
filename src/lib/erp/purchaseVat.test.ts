import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePurchaseLineVat, resolvePurchaseInputVatRate, splitDeductibleVat } from "./purchaseVat";

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

test("splitDeductibleVat pending matches non_deductible", () => {
  assert.deepEqual(splitDeductibleVat(100, "pending", 50), { deductible: 0, nonDeductible: 100 });
  assert.deepEqual(splitDeductibleVat(100, "non_deductible", 50), { deductible: 0, nonDeductible: 100 });
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
