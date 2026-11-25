/**
 * Phase 5 helpers: derived commission/advertising net↔gross.
 * Editable rate is one field; the counterpart is computed (not stored as independent editable).
 * channelResult still uses legacy commission_pct until Phase 6.
 */

export type VatDeductionStatus = "pending" | "deductible" | "partial" | "non_deductible";

export type AdvertisingScenario = "organic" | "standard" | "full" | "custom";

export type CommissionCalcBase =
  | "gross_sales"
  | "gross_sales_after_merchant_discounts"
  | "net_sales"
  | "net_revenue";

/** Split a rate into net / vat / gross given VAT % and whether the rate already includes VAT. */
export function splitRateWithVat(
  rate: number | null | undefined,
  vatRate: number | null | undefined,
  vatIncluded: boolean,
): { net: number | null; vat: number | null; gross: number | null } {
  if (rate == null || !Number.isFinite(rate)) return { net: null, vat: null, gross: null };
  const vat = vatRate == null || !Number.isFinite(vatRate) ? 0 : vatRate;
  if (vatIncluded) {
    if (vat >= 100) return { net: null, vat: null, gross: rate };
    const net = rate / (1 + vat / 100);
    return { net, vat: rate - net, gross: rate };
  }
  const gross = rate * (1 + vat / 100);
  return { net: rate, vat: gross - rate, gross };
}

export function channelFinanceIncomplete(channel: {
  commission_enabled?: boolean | null;
  commission_rate?: number | null;
  commission_pct?: number | null;
  advertising_enabled?: boolean | null;
  advertising_rate?: number | null;
  advertising_scenario?: string | null;
}): string[] {
  const issues: string[] = [];
  if (channel.commission_enabled && channel.commission_rate == null && channel.commission_pct == null) {
    issues.push("no_commission");
  }
  if (channel.advertising_enabled && channel.advertising_rate == null && channel.advertising_scenario !== "organic") {
    issues.push("no_advertising");
  }
  return issues;
}

export function advertisingRateForScenario(channel: {
  advertising_scenario?: string | null;
  advertising_rate?: number | null;
  advertising_organic_gross_pct?: number | null;
  advertising_standard_gross_pct?: number | null;
  advertising_full_gross_pct?: number | null;
}): number | null {
  const scenario = channel.advertising_scenario ?? "custom";
  if (scenario === "organic") return channel.advertising_organic_gross_pct ?? 0;
  if (scenario === "standard") return channel.advertising_standard_gross_pct ?? channel.advertising_rate ?? null;
  if (scenario === "full") return channel.advertising_full_gross_pct ?? channel.advertising_rate ?? null;
  return channel.advertising_rate ?? null;
}
