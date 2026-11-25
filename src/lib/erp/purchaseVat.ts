/**
 * Phase 8B/8C — purchase line Input VAT + effective inventory cost
 * (preview UI + same rules as SQL helpers / post).
 *
 * Effective Inventory Cost =
 *   Net Purchase Cost + Non-Deductible VAT + Pending VAT + Allocated Acquisition Costs
 * Pending VAT is never also counted inside Non-Deductible (no double-count).
 */

export type VatDeductionStatus = "pending" | "deductible" | "partial" | "non_deductible";

export type AcquisitionKind = "transport" | "delivery" | "handling" | "other";

export type AcquisitionCostInput = {
  kind: AcquisitionKind;
  /** Net fee amount (or gross when vatIncluded). */
  amount: number | null;
  vatRate?: number | null;
  vatIncluded?: boolean;
  vatDeductionStatus?: VatDeductionStatus | null;
  deductibleVatPct?: number | null;
};

export type PurchaseLineVatInput = {
  qty: number;
  /** Entered unit price in document mode (per base unit). */
  unitPrice: number | null;
  vatRate: number | null;
  pricesIncludeVat: boolean;
  vatDeductionStatus?: VatDeductionStatus | null;
  deductibleVatPct?: number | null;
  /** Pre-allocated acquisition cost for this line (inventory-includable). */
  allocatedAcquisitionCost?: number | null;
};

export type PurchaseVatSplit = {
  deductible: number;
  nonDeductible: number;
  /** Temporary VAT in inventory cost when status = pending (exclusive of nonDeductible). */
  pending: number;
};

export type PurchaseLineVatResult = {
  netUnitPrice: number | null;
  grossUnitPrice: number | null;
  netTotal: number | null;
  vatTotal: number | null;
  grossTotal: number | null;
  deductibleVatAmount: number | null;
  nonDeductibleVatAmount: number | null;
  pendingVatAmount: number | null;
  allocatedAcquisitionCost: number | null;
  effectiveInventoryCost: number | null;
  effectiveUnitCost: number | null;
  status: VatDeductionStatus;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function normalizeDeductionStatus(status: string | null | undefined): VatDeductionStatus {
  if (status === "deductible" || status === "partial" || status === "non_deductible" || status === "pending") {
    return status;
  }
  return "pending";
}

/**
 * Split purchase VAT into deductible / permanent non-deductible / pending buckets.
 * Pending is exclusive — never also placed in nonDeductible (8C no double-count).
 */
export function splitPurchaseVat(
  vatTotal: number,
  status: VatDeductionStatus,
  deductiblePct: number | null | undefined,
): PurchaseVatSplit {
  if (!(vatTotal > 0)) return { deductible: 0, nonDeductible: 0, pending: 0 };
  if (status === "deductible") return { deductible: vatTotal, nonDeductible: 0, pending: 0 };
  if (status === "non_deductible") return { deductible: 0, nonDeductible: vatTotal, pending: 0 };
  if (status === "pending") return { deductible: 0, nonDeductible: 0, pending: vatTotal };
  const pct = deductiblePct == null || !Number.isFinite(deductiblePct) ? 0 : Math.min(100, Math.max(0, deductiblePct));
  const deductible = round4((vatTotal * pct) / 100);
  return { deductible, nonDeductible: round4(vatTotal - deductible), pending: 0 };
}

/**
 * @deprecated Prefer splitPurchaseVat. Pending historically folded into nonDeductible for cost;
 * cost effect is unchanged when using effectiveInventoryCostComponents.
 */
export function splitDeductibleVat(
  vatTotal: number,
  status: VatDeductionStatus,
  deductiblePct: number | null | undefined,
): { deductible: number; nonDeductible: number } {
  const s = splitPurchaseVat(vatTotal, status, deductiblePct);
  return { deductible: s.deductible, nonDeductible: round4(s.nonDeductible + s.pending) };
}

/** Core 8C formula without double-counting pending vs non-deductible. */
export function effectiveInventoryCostComponents(opts: {
  net: number;
  nonDeductibleVat: number;
  pendingVat: number;
  allocatedAcquisition?: number | null;
}): number {
  return round4(
    (opts.net || 0) + (opts.nonDeductibleVat || 0) + (opts.pendingVat || 0) + (opts.allocatedAcquisition || 0),
  );
}

/** Inventory-includable amount for one acquisition fee line. */
export function acquisitionInventoryAmount(input: AcquisitionCostInput): number {
  const amount = input.amount;
  if (amount == null || !Number.isFinite(amount) || !(amount > 0)) return 0;
  const rate = input.vatRate == null || !Number.isFinite(input.vatRate) ? 0 : Number(input.vatRate);
  let net: number;
  let gross: number;
  if (rate > 0) {
    if (input.vatIncluded) {
      gross = round4(amount);
      net = round4(gross / (1 + rate / 100));
    } else {
      net = round4(amount);
      gross = round4(net * (1 + rate / 100));
    }
  } else {
    net = round4(amount);
    gross = net;
  }
  const vat = round4(gross - net);
  const status = normalizeDeductionStatus(input.vatDeductionStatus);
  const split = splitPurchaseVat(vat, status, input.deductibleVatPct);
  return effectiveInventoryCostComponents({
    net,
    nonDeductibleVat: split.nonDeductible,
    pendingVat: split.pending,
  });
}

/**
 * Allocate document acquisition inventory totals across purchase lines by net weight.
 * Lines with no net get 0; remainder cents go to the last positive-net line.
 */
export function allocateAcquisitionCosts(
  lineNets: number[],
  acquisitionTotal: number,
): number[] {
  const n = lineNets.length;
  if (n === 0) return [];
  if (!(acquisitionTotal > 0)) return lineNets.map(() => 0);
  const totalNet = lineNets.reduce((s, x) => s + (x > 0 ? x : 0), 0);
  if (!(totalNet > 0)) return lineNets.map(() => 0);
  const out = lineNets.map((net) => (net > 0 ? round4((acquisitionTotal * net) / totalNet) : 0));
  const sum = round4(out.reduce((s, x) => s + x, 0));
  const drift = round4(acquisitionTotal - sum);
  if (drift !== 0) {
    for (let i = n - 1; i >= 0; i--) {
      if (out[i] > 0 || lineNets[i] > 0) {
        out[i] = round4(out[i] + drift);
        break;
      }
    }
  }
  return out;
}

export function calculatePurchaseLineVat(input: PurchaseLineVatInput): PurchaseLineVatResult {
  const status = normalizeDeductionStatus(input.vatDeductionStatus);
  const qty = input.qty;
  const price = input.unitPrice;
  const rate = input.vatRate == null || !Number.isFinite(input.vatRate) ? 0 : Number(input.vatRate);
  const allocated = input.allocatedAcquisitionCost != null && Number.isFinite(input.allocatedAcquisitionCost)
    ? round4(Number(input.allocatedAcquisitionCost))
    : 0;

  if (price == null || !Number.isFinite(price) || !(qty > 0)) {
    return {
      netUnitPrice: null,
      grossUnitPrice: null,
      netTotal: null,
      vatTotal: null,
      grossTotal: null,
      deductibleVatAmount: null,
      nonDeductibleVatAmount: null,
      pendingVatAmount: null,
      allocatedAcquisitionCost: allocated || null,
      effectiveInventoryCost: null,
      effectiveUnitCost: null,
      status,
    };
  }

  let netTotal: number;
  let grossTotal: number;
  if (rate > 0) {
    if (input.pricesIncludeVat) {
      grossTotal = round4(qty * price);
      netTotal = round4(grossTotal / (1 + rate / 100));
    } else {
      netTotal = round4(qty * price);
      grossTotal = round4(netTotal * (1 + rate / 100));
    }
  } else {
    netTotal = round4(qty * price);
    grossTotal = netTotal;
  }
  const vatTotal = round4(grossTotal - netTotal);
  const split = splitPurchaseVat(vatTotal, status, input.deductibleVatPct);
  const effectiveInventoryCost = effectiveInventoryCostComponents({
    net: netTotal,
    nonDeductibleVat: split.nonDeductible,
    pendingVat: split.pending,
    allocatedAcquisition: allocated,
  });
  return {
    netUnitPrice: round6(netTotal / qty),
    grossUnitPrice: round6(grossTotal / qty),
    netTotal,
    vatTotal,
    grossTotal,
    deductibleVatAmount: split.deductible,
    nonDeductibleVatAmount: split.nonDeductible,
    pendingVatAmount: split.pending,
    allocatedAcquisitionCost: allocated,
    effectiveInventoryCost,
    effectiveUnitCost: round6(effectiveInventoryCost / qty),
    status,
  };
}

/**
 * Input VAT rate priority for a receipt line:
 * 1) Explicit line / invoice rate (when set)
 * 2) Product Input VAT Exception
 * 3) Category Input VAT Exception
 * 4) Global default
 */
export function resolvePurchaseInputVatRate(opts: {
  lineVatRate?: number | null;
  productId?: string | null;
  categoryId?: string | null;
  defaultRate: number;
  productExceptionRate?: number | null;
  categoryExceptionRate?: number | null;
}): number {
  if (opts.lineVatRate != null && Number.isFinite(Number(opts.lineVatRate))) return Number(opts.lineVatRate);
  if (opts.productExceptionRate != null && Number.isFinite(Number(opts.productExceptionRate))) {
    return Number(opts.productExceptionRate);
  }
  if (opts.categoryExceptionRate != null && Number.isFinite(Number(opts.categoryExceptionRate))) {
    return Number(opts.categoryExceptionRate);
  }
  return opts.defaultRate;
}
