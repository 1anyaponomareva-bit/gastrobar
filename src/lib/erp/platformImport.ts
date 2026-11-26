/**
 * Phase 9D — Platform settlement import (normalized v1).
 * Raw GrabMerchant CSV/XLSX requires owner sample + column map — do not invent headers.
 */

export const NORMALIZED_CSV_HEADERS = [
  "external_order_id",
  "line_kind",
  "order_at",
  "settlement_date",
  "gross_sales",
  "merchant_funded_discount",
  "platform_funded_discount",
  "net_sales",
  "platform_commission",
  "commission_vat",
  "advertising_expense",
  "advertising_vat",
  "service_fee",
  "refund_amount",
  "chargeback_amount",
  "financial_adjustment",
  "net_earnings",
  "advertising_campaign",
  "advertising_source",
  "currency",
] as const;

export type NormalizedPlatformRow = {
  external_order_id?: string | null;
  line_kind?: string | null;
  order_at?: string | null;
  settlement_date?: string | null;
  gross_sales?: number | null;
  merchant_funded_discount?: number | null;
  platform_funded_discount?: number | null;
  net_sales?: number | null;
  platform_commission?: number | null;
  commission_vat?: number | null;
  advertising_expense?: number | null;
  advertising_vat?: number | null;
  service_fee?: number | null;
  refund_amount?: number | null;
  chargeback_amount?: number | null;
  financial_adjustment?: number | null;
  net_earnings?: number | null;
  advertising_campaign?: string | null;
  advertising_source?: "settlement" | "ads_report" | "manual" | null;
  currency?: string | null;
  operation_key?: string | null;
  raw_values?: Record<string, unknown> | null;
};

export type ParseResult = {
  ok: boolean;
  format: "normalized_json_v1" | "normalized_csv_v1" | "grab_merchant_csv" | "grab_merchant_xlsx" | "unknown";
  rows: NormalizedPlatformRow[];
  errors: Array<{ row?: number; error: string }>;
  note?: string;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Parse normalized JSON array or { rows: [] }. */
export function parseNormalizedJson(text: string): ParseResult {
  const errors: ParseResult["errors"] = [];
  try {
    const data = JSON.parse(text) as unknown;
    const rawRows = Array.isArray(data) ? data : (data as { rows?: unknown }).rows;
    if (!Array.isArray(rawRows)) {
      return { ok: false, format: "normalized_json_v1", rows: [], errors: [{ error: "expected_array_or_rows" }] };
    }
    const rows: NormalizedPlatformRow[] = rawRows.map((r, i) => {
      if (!r || typeof r !== "object") {
        errors.push({ row: i + 1, error: "invalid_row" });
        return {};
      }
      const o = r as Record<string, unknown>;
      return {
        external_order_id: str(o.external_order_id),
        line_kind: str(o.line_kind) ?? "order",
        order_at: str(o.order_at),
        settlement_date: str(o.settlement_date),
        gross_sales: num(o.gross_sales),
        merchant_funded_discount: num(o.merchant_funded_discount),
        platform_funded_discount: num(o.platform_funded_discount),
        net_sales: num(o.net_sales),
        platform_commission: num(o.platform_commission),
        commission_vat: num(o.commission_vat),
        advertising_expense: num(o.advertising_expense),
        advertising_vat: num(o.advertising_vat),
        service_fee: num(o.service_fee),
        refund_amount: num(o.refund_amount),
        chargeback_amount: num(o.chargeback_amount),
        financial_adjustment: num(o.financial_adjustment),
        net_earnings: num(o.net_earnings),
        advertising_campaign: str(o.advertising_campaign),
        advertising_source: (str(o.advertising_source) as NormalizedPlatformRow["advertising_source"]) ?? null,
        currency: str(o.currency) ?? "VND",
        operation_key: str(o.operation_key),
        raw_values: o.raw_values && typeof o.raw_values === "object" ? (o.raw_values as Record<string, unknown>) : o,
      };
    });
    return { ok: errors.length === 0, format: "normalized_json_v1", rows, errors };
  } catch (e) {
    return { ok: false, format: "normalized_json_v1", rows: [], errors: [{ error: String(e) }] };
  }
}

/** Simple CSV (comma) parser for normalized_v1 headers only. */
export function parseNormalizedCsv(text: string): ParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, format: "normalized_csv_v1", rows: [], errors: [{ error: "csv_empty" }] };
  }
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const unknown = headers.filter((h) => !(NORMALIZED_CSV_HEADERS as readonly string[]).includes(h) && h !== "operation_key");
  if (unknown.length && !headers.includes("external_order_id")) {
    return {
      ok: false,
      format: "unknown",
      rows: [],
      errors: [{ error: "not_normalized_csv_headers" }],
      note: "Provide normalized_csv_v1 or owner GrabMerchant sample + column map. Do not invent Grab headers.",
    };
  }
  const rows: NormalizedPlatformRow[] = [];
  const errors: ParseResult["errors"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => {
      o[h] = cols[idx] ?? "";
    });
    rows.push({
      external_order_id: str(o.external_order_id),
      line_kind: str(o.line_kind) ?? "order",
      order_at: str(o.order_at),
      settlement_date: str(o.settlement_date),
      gross_sales: num(o.gross_sales),
      merchant_funded_discount: num(o.merchant_funded_discount),
      platform_funded_discount: num(o.platform_funded_discount),
      net_sales: num(o.net_sales),
      platform_commission: num(o.platform_commission),
      commission_vat: num(o.commission_vat),
      advertising_expense: num(o.advertising_expense),
      advertising_vat: num(o.advertising_vat),
      service_fee: num(o.service_fee),
      refund_amount: num(o.refund_amount),
      chargeback_amount: num(o.chargeback_amount),
      financial_adjustment: num(o.financial_adjustment),
      net_earnings: num(o.net_earnings),
      advertising_campaign: str(o.advertising_campaign),
      advertising_source: (str(o.advertising_source) as NormalizedPlatformRow["advertising_source"]) ?? "settlement",
      currency: str(o.currency) ?? "VND",
      operation_key: str(o.operation_key),
      raw_values: o,
    });
  }
  return { ok: errors.length === 0, format: "normalized_csv_v1", rows, errors };
}

/**
 * Raw GrabMerchant — intentionally refuses without active column map fingerprint.
 * Never invents Grab column names.
 */
export function parseGrabMerchantRaw(
  _text: string,
  opts?: { columnMap?: Record<string, string> | null; hasActiveMap?: boolean },
): ParseResult {
  if (!opts?.hasActiveMap || !opts.columnMap || Object.keys(opts.columnMap).length === 0) {
    return {
      ok: false,
      format: "grab_merchant_csv",
      rows: [],
      errors: [{ error: "grab_column_map_missing" }],
      note: "Owner must provide a real GrabMerchant CSV/XLSX sample before raw parse is enabled.",
    };
  }
  // Mapping-driven parse is implemented after owner sample lands in erp_platform_column_maps.
  return {
    ok: false,
    format: "grab_merchant_csv",
    rows: [],
    errors: [{ error: "grab_map_present_but_sample_parser_pending_activation" }],
    note: "Column map saved — activate parser against the provided sample in a follow-up.",
  };
}

export function detectAndParse(text: string, fileName?: string): ParseResult {
  const lower = (fileName || "").toLowerCase();
  const trimmed = text.trim();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return {
      ok: false,
      format: "grab_merchant_xlsx",
      rows: [],
      errors: [{ error: "xlsx_requires_owner_sample_and_parser" }],
      note: "XLSX architecture reserved. Provide GrabMerchant sample to enable.",
    };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseNormalizedJson(trimmed);
  }
  if (lower.includes("grab") && !trimmed.split(/\r?\n/)[0]?.includes("external_order_id")) {
    return parseGrabMerchantRaw(trimmed, { hasActiveMap: false });
  }
  return parseNormalizedCsv(trimmed);
}

/** October 2026 control fixture as one summary settlement row (test only — not real docs). */
export function october2026FixtureRows(): NormalizedPlatformRow[] {
  return [
    {
      external_order_id: "OCT2026-FIXTURE-SUMMARY",
      line_kind: "order",
      settlement_date: "2026-10-31",
      gross_sales: 434904005,
      merchant_funded_discount: 764000,
      net_sales: 434140005,
      platform_commission: 85240734,
      commission_vat: null,
      advertising_expense: 30349488,
      advertising_vat: null,
      chargeback_amount: 76347,
      net_earnings: 318473436,
      advertising_source: "settlement",
      currency: "VND",
      operation_key: "grab:fixture:oct2026:summary",
      raw_values: { fixture: "RELEASE3_FINANCIAL_ARCHITECTURE.md §10", vat: "unverified" },
    },
  ];
}
