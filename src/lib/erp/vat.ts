/**
 * Vietnam restaurant VAT: company default is 8%. Ingredients without an exception
 * use that default (8% until the owner changes it).
 *
 * Dual-read: prefer `erp_tax_rates` catalog when loaded; fall back to hardcoded
 * `ERP_VAT_RATES` (0/5/8/10) when the catalog is missing (pre-migration / offline).
 * 0% standard, VAT Exempt, and Not Subject stay distinct catalog rows — never merge.
 *
 * Phase 4: Input and Output exceptions are independent (`direction`).
 * Priority per direction: 1) item exception  2) legacy dish.vat_rate (output)
 * 3) category exception  4) company default.
 * Legacy rows without direction/scope_kind read as input/product.
 */

/** Hardcoded fallback when the tax-rates catalog is not loaded yet. */
export const ERP_VAT_RATES = [0, 5, 8, 10] as const;
export type ErpVatRate = (typeof ERP_VAT_RATES)[number];
export const DEFAULT_VAT_RATE: ErpVatRate = 8;

export type TaxTreatment = "standard" | "exempt" | "not_subject";
export type VatDirection = "input" | "output";
export type VatExceptionScope = "product" | "category" | "dish";

/** Dual-read row: legacy {product_id, vat_rate} or Phase 4 full shape. */
export type VatException = {
  id?: string | null;
  product_id?: string | null;
  category_id?: string | null;
  dish_id?: string | null;
  vat_rate: number;
  /** Phase 4 column. Alias: vat_direction. */
  direction?: VatDirection | string | null;
  vat_direction?: VatDirection | string | null;
  /** Phase 4 column. Alias: scope. */
  scope_kind?: VatExceptionScope | string | null;
  scope?: VatExceptionScope | string | null;
  tax_rate_id?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  note?: string | null;
};

export type TaxRateRow = {
  id: string;
  code: string;
  name: string;
  name_vn?: string | null;
  rate: number;
  tax_treatment: TaxTreatment | string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  sort?: number;
};

export const VAT_ACCOUNTING_METHODS = ["cash", "accrual", "hybrid", "unconfirmed"] as const;
export type VatAccountingMethod = (typeof VAT_ACCOUNTING_METHODS)[number];

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

export function normalizeVatDirection(row: VatException | null | undefined): VatDirection {
  const d = row?.direction ?? row?.vat_direction;
  return d === "output" ? "output" : "input";
}

export function normalizeVatScope(row: VatException | null | undefined): VatExceptionScope {
  const s = row?.scope_kind ?? row?.scope;
  if (s === "category" || s === "dish") return s;
  return "product";
}

function asOfDate(asOf?: string | Date | null): string {
  if (!asOf) return new Date().toISOString().slice(0, 10);
  if (asOf instanceof Date) return asOf.toISOString().slice(0, 10);
  return String(asOf).slice(0, 10);
}

export function exceptionActiveOn(row: VatException, asOf?: string | Date | null): boolean {
  const day = asOfDate(asOf);
  const from = (row.effective_from ?? "0001-01-01").slice(0, 10);
  const to = row.effective_to ? String(row.effective_to).slice(0, 10) : null;
  return day >= from && (to == null || day <= to);
}

function exceptionsFor(
  exceptions: VatException[] | null | undefined,
  direction: VatDirection,
  asOf?: string | Date | null,
): VatException[] {
  return (exceptions ?? []).filter(
    (row) => normalizeVatDirection(row) === direction && exceptionActiveOn(row, asOf),
  );
}

/** Exception rate if listed, otherwise the company default (8% when unset). Supports category. */
export function effectiveInputVatRate(
  productId: string | null | undefined,
  settings?: { default_input_vat_rate?: number | null } | null,
  exceptions: VatException[] | null | undefined = [],
  opts?: { categoryId?: string | null; asOf?: string | Date | null },
): number {
  const rows = exceptionsFor(exceptions, "input", opts?.asOf);
  if (productId) {
    const item = rows.find((row) => normalizeVatScope(row) === "product" && row.product_id === productId);
    if (item) return asVatRate(item.vat_rate, defaultInputVatRate(settings));
  }
  const categoryId = opts?.categoryId;
  if (categoryId) {
    const cat = rows.find((row) => normalizeVatScope(row) === "category" && row.category_id === categoryId);
    if (cat) return asVatRate(cat.vat_rate, defaultInputVatRate(settings));
  }
  return defaultInputVatRate(settings);
}

/**
 * Output VAT without sales-channel context (catalog / dish field readout).
 * Release 1: dish exception → explicit dish.vat_rate (≠ global) → product exception
 * → category exception → global. Auto-baseline dish.vat_rate (= global) is ignored.
 * For dish×channel finance use resolveDishOutputVatRate (adds channel before global).
 */
export function effectiveOutputVatRate(
  settings?: { default_output_vat_rate?: number | null } | null,
  exceptions: VatException[] | null | undefined = [],
  opts?: {
    dishId?: string | null;
    productId?: string | null;
    categoryId?: string | null;
    dishVatRate?: number | null;
    asOf?: string | Date | null;
  },
): number {
  const global = defaultOutputVatRate(settings);
  const rows = exceptionsFor(exceptions, "output", opts?.asOf);
  if (opts?.dishId) {
    const dish = rows.find((row) => normalizeVatScope(row) === "dish" && row.dish_id === opts.dishId);
    if (dish) return asVatRate(dish.vat_rate, global);
  }
  if (
    opts?.dishVatRate != null &&
    Number.isFinite(Number(opts.dishVatRate)) &&
    Number(opts.dishVatRate) !== global
  ) {
    return asVatRate(opts.dishVatRate, global);
  }
  if (opts?.productId) {
    const product = rows.find((row) => normalizeVatScope(row) === "product" && row.product_id === opts.productId);
    if (product) return asVatRate(product.vat_rate, global);
  }
  if (opts?.categoryId) {
    const cat = rows.find((row) => normalizeVatScope(row) === "category" && row.category_id === opts.categoryId);
    if (cat) return asVatRate(cat.vat_rate, global);
  }
  return global;
}

/** Visible exception list for one direction: only rates other than that direction's default. */
export function visibleVatExceptions(
  exceptions: VatException[] | null | undefined,
  defaultRate: number,
  direction: VatDirection = "input",
): VatException[] {
  return (exceptions ?? []).filter(
    (row) => normalizeVatDirection(row) === direction && asVatRate(row.vat_rate) !== defaultRate,
  );
}

/** Active catalog rates, or hardcoded fallback when catalog is empty/missing. */
export function catalogOrFallbackRates(taxRates?: TaxRateRow[] | null): TaxRateRow[] {
  const active = (taxRates ?? []).filter((row) => row.is_active !== false);
  if (active.length > 0) {
    return [...active].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.rate - b.rate || a.code.localeCompare(b.code));
  }
  return ERP_VAT_RATES.map((rate, index) => ({
    id: `fallback-${rate}`,
    code: `vat-${rate}`,
    name: `${rate}%`,
    name_vn: `${rate}%`,
    rate,
    tax_treatment: "standard" as const,
    is_active: true,
    sort: (index + 1) * 10,
  }));
}

/** Numeric rates for legacy selects (exceptions / defaults). Prefers standard catalog rows. */
export function vatRatesForSelect(
  current?: number | null,
  exclude?: number | null,
  taxRates?: TaxRateRow[] | null,
): number[] {
  const fromCatalog = catalogOrFallbackRates(taxRates)
    .filter((row) => row.tax_treatment === "standard" || isAllowedVatRate(row.rate))
    .map((row) => asVatRate(row.rate));
  const rates = new Set<number>(fromCatalog.length ? fromCatalog : ERP_VAT_RATES);
  if (current != null && Number.isFinite(Number(current))) rates.add(Number(current));
  return [...rates].filter((rate) => exclude == null || rate !== exclude).sort((a, b) => a - b);
}

export function taxRateLabel(row: TaxRateRow, lang: "ru" | "en" | "vn" = "en"): string {
  if (row.tax_treatment === "exempt") {
    return lang === "ru" ? "Освобождение от НДС" : lang === "vn" ? "Miễn thuế GTGT" : "VAT Exempt";
  }
  if (row.tax_treatment === "not_subject") {
    return lang === "ru"
      ? "Не подлежит декларированию НДС"
      : lang === "vn"
        ? "Không thuộc diện kê khai thuế GTGT"
        : "Not Subject To VAT Declaration";
  }
  const name = lang === "vn" && row.name_vn ? row.name_vn : row.name;
  return name || `${asVatRate(row.rate)}%`;
}

export function findTaxRateById(taxRates: TaxRateRow[] | null | undefined, id: string | null | undefined): TaxRateRow | null {
  if (!id) return null;
  return (taxRates ?? []).find((row) => row.id === id) ?? null;
}

export function findStandardTaxRateByPercent(
  taxRates: TaxRateRow[] | null | undefined,
  rate: number | null | undefined,
): TaxRateRow | null {
  if (rate == null || !Number.isFinite(Number(rate))) return null;
  const n = Number(rate);
  return (
    catalogOrFallbackRates(taxRates).find((row) => row.tax_treatment === "standard" && asVatRate(row.rate) === n) ?? null
  );
}
