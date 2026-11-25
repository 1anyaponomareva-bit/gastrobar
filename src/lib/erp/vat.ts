/**
 * Vietnam restaurant VAT: company default is 8%. Ingredients without an exception
 * use that default (8% until the owner changes it).
 *
 * Dual-read: prefer `erp_tax_rates` catalog when loaded; fall back to hardcoded
 * `ERP_VAT_RATES` (0/5/8/10) when the catalog is missing (pre-migration / offline).
 * 0% standard, VAT Exempt, and Not Subject stay distinct catalog rows — never merge.
 *
 * Phase 4: Input and Output exceptions are independent (`direction`).
 * Output priority (Release 1): dish exception → category exception → (channel in
 * dishChannelFinance) → company default. Legacy `dish.vat_rate` is NOT a live
 * override — use Output VAT Exceptions for individual rates.
 * Legacy rows without direction/scope_kind read as input/product.
 */

import { T } from "@/components/erp/i18n";

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

/** Plain-language labels for the tax accounting method select (RU/EN/VN). */
export function vatAccountingMethodLabel(method: VatAccountingMethod | "" | null | undefined): string {
  switch (method) {
    case "cash":
      return T(
        "Кассовый — НДС учитываем, когда деньги реально пришли или ушли",
        "Cash — recognize VAT when money is actually paid or received",
        "Tiền mặt — ghi nhận VAT khi tiền thực sự vào/ra",
      );
    case "accrual":
      return T(
        "Начисление — НДС по накладной/счёту, даже если ещё не платили",
        "Accrual — recognize VAT on the invoice/document even if unpaid",
        "Dồn tích — ghi nhận VAT theo hoá đơn dù chưa thanh toán",
      );
    case "hybrid":
      return T(
        "Смешанный — часть операций по оплате, часть по документам (как скажет бухгалтер)",
        "Hybrid — some by payment, some by documents (per accountant)",
        "Hỗn hợp — một phần theo tiền, một phần theo chứng từ (theo kế toán)",
      );
    case "unconfirmed":
    case "":
    case null:
    case undefined:
      return T(
        "Не подтверждён — метод ещё не выбран бухгалтером",
        "Unconfirmed — accountant has not chosen a method yet",
        "Chưa xác nhận — kế toán chưa chọn phương pháp",
      );
    default:
      return String(method);
  }
}

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
 * Classification of the legacy `erp_dishes.vat_rate` column (does not affect resolution).
 * - inherited: null/empty, or equals current global (typical auto-seed) → ignored
 * - legacy_field: non-null value that is not backed by a dish Output exception
 * - explicit_override: dish-scoped Output VAT Exception exists (canonical individual source)
 */
export function classifyDishVatField(opts: {
  dishVatRate?: number | null;
  globalDefault: number;
  hasDishOutputException: boolean;
}): "inherited" | "legacy_field" | "explicit_override" {
  if (opts.hasDishOutputException) return "explicit_override";
  if (opts.dishVatRate == null || !Number.isFinite(Number(opts.dishVatRate))) return "inherited";
  if (Number(opts.dishVatRate) === opts.globalDefault) return "inherited";
  return "legacy_field";
}

/**
 * Output VAT without sales-channel context (catalog / dish readout).
 * Release 1: dish exception → product exception → category exception → global.
 * Legacy `dish.vat_rate` / opts.dishVatRate do NOT participate (kept for API compat only).
 * For dish×channel finance use resolveDishOutputVatRate (inserts channel before global).
 */
export function effectiveOutputVatRate(
  settings?: { default_output_vat_rate?: number | null } | null,
  exceptions: VatException[] | null | undefined = [],
  opts?: {
    dishId?: string | null;
    productId?: string | null;
    categoryId?: string | null;
    /** @deprecated Ignored — individual overrides live in Output VAT Exceptions only. */
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
