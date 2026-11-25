/**
 * Phase 8B — purchase line Input VAT math (single helper for UI preview + tests).
 * Posting to lots uses the same rules once migration is applied (see SQL).
 */

export type VatDeductionStatus = "pending" | "deductible" | "partial" | "non_deductible";

export type PurchaseLineVatInput = {
  qty: number;
  /** Entered unit price in document mode (per base unit). */
  unitPrice: number | null;
  vatRate: number | null;
  pricesIncludeVat: boolean;
  vatDeductionStatus?: VatDeductionStatus | null;
  deductibleVatPct?: number | null;
};

export type PurchaseLineVatResult = {
  netUnitPrice: number | null;
  grossUnitPrice: number | null;
  netTotal: number | null;
  vatTotal: number | null;
  grossTotal: number | null;
  deductibleVatAmount: number | null;
  nonDeductibleVatAmount: number | null;
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
 * Pending / Non-Deductible → full VAT in inventory cost (management default for Pending).
 * Deductible → net only.
 * Partial → net + non-deductible share of VAT.
 */
export function splitDeductibleVat(
  vatTotal: number,
  status: VatDeductionStatus,
  deductiblePct: number | null | undefined,
): { deductible: number; nonDeductible: number } {
  if (!(vatTotal > 0)) return { deductible: 0, nonDeductible: 0 };
  if (status === "deductible") return { deductible: vatTotal, nonDeductible: 0 };
  if (status === "non_deductible" || status === "pending") return { deductible: 0, nonDeductible: vatTotal };
  const pct = deductiblePct == null || !Number.isFinite(deductiblePct) ? 0 : Math.min(100, Math.max(0, deductiblePct));
  const deductible = round4((vatTotal * pct) / 100);
  return { deductible, nonDeductible: round4(vatTotal - deductible) };
}

export function calculatePurchaseLineVat(input: PurchaseLineVatInput): PurchaseLineVatResult {
  const status = normalizeDeductionStatus(input.vatDeductionStatus);
  const qty = input.qty;
  const price = input.unitPrice;
  const rate = input.vatRate == null || !Number.isFinite(input.vatRate) ? 0 : Number(input.vatRate);

  if (price == null || !Number.isFinite(price) || !(qty > 0)) {
    return {
      netUnitPrice: null,
      grossUnitPrice: null,
      netTotal: null,
      vatTotal: null,
      grossTotal: null,
      deductibleVatAmount: null,
      nonDeductibleVatAmount: null,
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
  const { deductible, nonDeductible } = splitDeductibleVat(vatTotal, status, input.deductibleVatPct);
  const effectiveInventoryCost = round4(netTotal + nonDeductible);
  return {
    netUnitPrice: round6(netTotal / qty),
    grossUnitPrice: round6(grossTotal / qty),
    netTotal,
    vatTotal,
    grossTotal,
    deductibleVatAmount: deductible,
    nonDeductibleVatAmount: nonDeductible,
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
