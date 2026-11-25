/**
 * Phase 8D — Input VAT cost adjustment math (preview + tests).
 * Posting/distribution to lots is mirrored in SQL RPCs.
 *
 * Inventory Cost Adjustment = −(New Deductible VAT − Previous Deductible VAT)
 * New Effective = Previous Effective + Inventory Cost Adjustment
 * Re-adjustments always diff against the last effective state (not the original purchase).
 */

import {
  effectiveInventoryCostComponents,
  normalizeDeductionStatus,
  splitPurchaseVat,
  type VatDeductionStatus,
} from "./purchaseVat";

export type VatAdjustmentReason =
  | "vat_invoice_received"
  | "vat_deduction_confirmed"
  | "partial_vat_deduction_confirmed"
  | "vat_deduction_rejected"
  | "vat_deduction_reversed"
  | "accounting_correction"
  | "other";

export type VatAdjustmentAllocationBucket =
  | "remaining_raw"
  | "transferred"
  | "wip"
  | "semi_finished"
  | "finished_goods"
  | "cogs"
  | "write_offs"
  | "unallocated";

export type PurchaseVatState = {
  status: VatDeductionStatus;
  deductibleVatPct: number | null;
  /** Absolute deductible VAT amount for the purchase line (whole qty). */
  deductibleVatAmount: number;
  nonDeductibleVatAmount: number;
  pendingVatAmount: number;
  /** Whole-line effective inventory cost (net + non-ded + pending + acq). */
  effectiveInventoryCost: number;
  netPurchaseCost: number;
  originalVatAmount: number;
  allocatedAcquisitionCost: number;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function buildPurchaseVatState(opts: {
  net: number;
  vat: number;
  status: VatDeductionStatus | string | null | undefined;
  deductibleVatPct?: number | null;
  allocatedAcquisition?: number | null;
}): PurchaseVatState {
  const status = normalizeDeductionStatus(opts.status);
  const split = splitPurchaseVat(opts.vat, status, opts.deductibleVatPct);
  const allocated = opts.allocatedAcquisition ?? 0;
  const effectiveInventoryCost = effectiveInventoryCostComponents({
    net: opts.net,
    nonDeductibleVat: split.nonDeductible,
    pendingVat: split.pending,
    allocatedAcquisition: allocated,
  });
  return {
    status,
    deductibleVatPct: status === "partial" ? (opts.deductibleVatPct ?? 0) : null,
    deductibleVatAmount: split.deductible,
    nonDeductibleVatAmount: split.nonDeductible,
    pendingVatAmount: split.pending,
    effectiveInventoryCost,
    netPurchaseCost: round4(opts.net),
    originalVatAmount: round4(opts.vat),
    allocatedAcquisitionCost: round4(allocated),
  };
}

export type VatAdjustmentCalcInput = {
  previous: PurchaseVatState;
  newStatus: VatDeductionStatus;
  newDeductibleVatPct?: number | null;
  /** Original purchase qty (lot qty_in). */
  originalQty: number;
  /** Qty still on hand across purchase lot + transfer descendants. */
  remainingQty: number;
  /**
   * Of the remaining qty, how much sits on transfer lots (not the original warehouse lot).
   * Optional informational split; defaults to 0.
   */
  transferredRemainingQty?: number;
  /** Qty that left via write-off documents (of consumed). */
  writeOffQty?: number;
};

export type VatAdjustmentCalcResult = {
  previous: PurchaseVatState;
  next: PurchaseVatState;
  vatDeductionDifference: number;
  inventoryCostAdjustment: number;
  previousUnitCost: number | null;
  newUnitCost: number | null;
  remainingQty: number;
  consumedQty: number;
  remainingInventoryAdjustment: number;
  transferredInventoryAdjustment: number;
  writeOffAdjustment: number;
  /** Consumed that cannot be reliably traced to production/COGS in 8D → unallocated. */
  unallocatedAdjustment: number;
  /** Alias: consumed total adjustment (write-off + unallocated). */
  consumedCostAdjustment: number;
  allocations: { bucket: VatAdjustmentAllocationBucket; amount: number; qty: number; warning?: string }[];
  warnings: string[];
};

/**
 * Compute adjustment amounts and a conservative distribution.
 * Production / semi-finished / COGS chain walk is Phase 8E — unallocated + warning here.
 */
export function calculateVatCostAdjustment(input: VatAdjustmentCalcInput): VatAdjustmentCalcResult {
  const previous = input.previous;
  const next = buildPurchaseVatState({
    net: previous.netPurchaseCost,
    vat: previous.originalVatAmount,
    status: input.newStatus,
    deductibleVatPct: input.newDeductibleVatPct,
    allocatedAcquisition: previous.allocatedAcquisitionCost,
  });

  const vatDeductionDifference = round4(next.deductibleVatAmount - previous.deductibleVatAmount);
  const inventoryCostAdjustment = round4(next.effectiveInventoryCost - previous.effectiveInventoryCost);
  // Sanity: should equal −vatDeductionDifference when acquisition unchanged
  const viaVat = round4(-vatDeductionDifference);
  const costAdj = Math.abs(inventoryCostAdjustment - viaVat) <= 0.02 ? viaVat : inventoryCostAdjustment;

  const originalQty = input.originalQty > 0 ? input.originalQty : 0;
  const remainingQty = Math.max(0, Math.min(input.remainingQty, originalQty));
  const consumedQty = round6(Math.max(0, originalQty - remainingQty));
  const transferredRemaining = Math.max(0, Math.min(input.transferredRemainingQty ?? 0, remainingQty));
  const rawRemaining = round6(remainingQty - transferredRemaining);
  const writeOffQty = Math.max(0, Math.min(input.writeOffQty ?? 0, consumedQty));
  const untracedConsumed = round6(Math.max(0, consumedQty - writeOffQty));

  const previousUnitCost = originalQty > 0 ? round6(previous.effectiveInventoryCost / originalQty) : null;
  const newUnitCost = originalQty > 0 ? round6(next.effectiveInventoryCost / originalQty) : null;

  let remainingInventoryAdjustment = 0;
  let transferredInventoryAdjustment = 0;
  let writeOffAdjustment = 0;
  let unallocatedAdjustment = 0;
  const warnings: string[] = [];

  if (originalQty > 0 && costAdj !== 0) {
    remainingInventoryAdjustment = round4((costAdj * remainingQty) / originalQty);
    const consumedCostAdjustment = round4(costAdj - remainingInventoryAdjustment);

    if (remainingQty > 0 && transferredRemaining > 0) {
      transferredInventoryAdjustment = round4((remainingInventoryAdjustment * transferredRemaining) / remainingQty);
      remainingInventoryAdjustment = round4(remainingInventoryAdjustment - transferredInventoryAdjustment);
    }

    if (consumedQty > 0) {
      if (writeOffQty > 0) {
        writeOffAdjustment = round4((consumedCostAdjustment * writeOffQty) / consumedQty);
      }
      unallocatedAdjustment = round4(consumedCostAdjustment - writeOffAdjustment);
      if (untracedConsumed > 0) {
        warnings.push(
          "Consumed quantity cannot be fully traced to production/COGS in Phase 8D; remainder is Unallocated Adjustment pending Phase 8E.",
        );
      }
    }
  }

  // Fix penny drift so allocations sum to costAdj
  const sumParts = round4(
    remainingInventoryAdjustment + transferredInventoryAdjustment + writeOffAdjustment + unallocatedAdjustment,
  );
  const drift = round4(costAdj - sumParts);
  if (drift !== 0) {
    if (Math.abs(unallocatedAdjustment) > 0 || consumedQty > 0) unallocatedAdjustment = round4(unallocatedAdjustment + drift);
    else if (Math.abs(remainingInventoryAdjustment) > 0 || remainingQty > 0)
      remainingInventoryAdjustment = round4(remainingInventoryAdjustment + drift);
    else unallocatedAdjustment = drift;
  }

  const allocations: VatAdjustmentCalcResult["allocations"] = [];
  if (remainingInventoryAdjustment !== 0 || rawRemaining > 0) {
    allocations.push({ bucket: "remaining_raw", amount: remainingInventoryAdjustment, qty: rawRemaining });
  }
  if (transferredInventoryAdjustment !== 0 || transferredRemaining > 0) {
    allocations.push({ bucket: "transferred", amount: transferredInventoryAdjustment, qty: transferredRemaining });
  }
  if (writeOffAdjustment !== 0 || writeOffQty > 0) {
    allocations.push({ bucket: "write_offs", amount: writeOffAdjustment, qty: writeOffQty });
  }
  if (unallocatedAdjustment !== 0 || untracedConsumed > 0) {
    allocations.push({
      bucket: "unallocated",
      amount: unallocatedAdjustment,
      qty: untracedConsumed,
      warning: untracedConsumed > 0 ? warnings[0] : undefined,
    });
  }

  return {
    previous,
    next,
    vatDeductionDifference,
    inventoryCostAdjustment: costAdj,
    previousUnitCost,
    newUnitCost,
    remainingQty,
    consumedQty,
    remainingInventoryAdjustment: round4(remainingInventoryAdjustment + transferredInventoryAdjustment),
    transferredInventoryAdjustment,
    writeOffAdjustment,
    unallocatedAdjustment,
    consumedCostAdjustment: round4(writeOffAdjustment + unallocatedAdjustment),
    allocations,
    warnings,
  };
}

/** Guard: lot value after adjustment must not go negative. */
export function assertNonNegativeLotValue(qtyLeft: number, unitCost: number, lotAdjustment: number): number {
  if (!(qtyLeft > 0)) return 0;
  const currentValue = round4(qtyLeft * unitCost);
  const nextValue = round4(currentValue + lotAdjustment);
  if (nextValue < -0.0001) {
    throw new Error("ERP_NEGATIVE_LOT_COST");
  }
  return round6(nextValue / qtyLeft);
}
