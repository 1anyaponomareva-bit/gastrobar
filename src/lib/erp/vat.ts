/**
 * Vietnam restaurant VAT: company default is 8%. Ingredients without an exception
 * use that default (8% until the owner changes it). Allowed rates match typical VN VAT.
 */

export const ERP_VAT_RATES = [0, 5, 8, 10] as const;
export type ErpVatRate = (typeof ERP_VAT_RATES)[number];
export const DEFAULT_VAT_RATE: ErpVatRate = 8;

export type VatException = { product_id: string; vat_rate: number };

export function isAllowedVatRate(value: unknown): value is ErpVatRate {
  const n = Number(value);
  return (ERP_VAT_RATES as readonly number[]).includes(n);
}

export function asVatRate(value: unknown, fallback: number = DEFAULT_VAT_RATE): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Company default for purchases / ingredients. Empty or missing → 8%. */
export function defaultInputVatRate(settings?: { default_input_vat_rate?: number | null } | null): number {
  return asVatRate(settings?.default_input_vat_rate);
}

/** Company default for menu prices. Empty or missing → 8%. */
export function defaultOutputVatRate(settings?: { default_output_vat_rate?: number | null } | null): number {
  return asVatRate(settings?.default_output_vat_rate);
}

/** Exception rate if listed, otherwise the company default (8% when unset). */
export function effectiveInputVatRate(
  productId: string | null | undefined,
  settings?: { default_input_vat_rate?: number | null } | null,
  exceptions: VatException[] | null | undefined = [],
): number {
  if (productId) {
    const found = (exceptions ?? []).find((row) => row.product_id === productId);
    if (found) return asVatRate(found.vat_rate, defaultInputVatRate(settings));
  }
  return defaultInputVatRate(settings);
}

/** Visible exception list: only rates other than the current default. */
export function visibleVatExceptions(
  exceptions: VatException[] | null | undefined,
  defaultRate: number,
): VatException[] {
  return (exceptions ?? []).filter((row) => asVatRate(row.vat_rate) !== defaultRate);
}

export function vatRatesForSelect(current?: number | null, exclude?: number | null): number[] {
  const rates = new Set<number>(ERP_VAT_RATES);
  if (current != null && Number.isFinite(Number(current))) rates.add(Number(current));
  return [...rates].filter((rate) => exclude == null || rate !== exclude).sort((a, b) => a - b);
}
