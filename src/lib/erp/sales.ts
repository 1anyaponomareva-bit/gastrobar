/** Phase 9B — Sales documents & Output VAT (accrual). Cashbook reports stay separate. */

export type SalesSourceSystem = "manual" | "poster" | "grab" | "import";
export type SalesOrderStatus = "draft" | "posted" | "cancelled" | "partially_refunded" | "refunded";
export type SalesPaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "charged_back" | "unknown";
export type SalesReconciliationStatus = "exact_match" | "manual_match" | "unmatched" | "conflict";
export type SalesCogsStatus = "none" | "pending" | "posted" | "partial" | "reversed" | "skipped";
export type SalesMatchKind = "exact" | "manual" | "unmatched" | "conflict";

export type ErpLegalEntity = {
  id: string;
  code: string;
  name: string;
  currency: string;
  timezone: string;
  business_day_cutoff: string;
  tax_id?: string | null;
  is_active: boolean;
};

export type ErpSalesDocument = {
  id: string;
  doc_no?: string | null;
  legal_entity_id: string;
  business_location_id?: string | null;
  sales_channel_id?: string | null;
  warehouse_id?: string | null;
  internal_order_id: string;
  canonical_order_key: string;
  external_order_id?: string | null;
  source_system: SalesSourceSystem | string;
  currency: string;
  order_at: string;
  business_date: string;
  order_status: SalesOrderStatus | string;
  payment_status: SalesPaymentStatus | string;
  reconciliation_status: SalesReconciliationStatus | string;
  gross_sales: number;
  merchant_funded_discount: number;
  platform_funded_discount: number;
  taxable_amount?: number | null;
  output_vat_rate?: number | null;
  output_vat_amount?: number | null;
  net_revenue?: number | null;
  output_vat_rate_source?: string | null;
  output_vat_rule_ref?: string | null;
  actual_cogs?: number | null;
  cogs_status: SalesCogsStatus | string;
  cogs_pending_reason?: string | null;
  stock_consume_enabled?: boolean;
  notes?: string | null;
  posted_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ErpSalesLine = {
  id: string;
  document_id: string;
  line_no: number;
  product_id?: string | null;
  dish_id?: string | null;
  description?: string | null;
  quantity: number;
  unit_price?: number | null;
  gross_sales: number;
  merchant_funded_discount: number;
  platform_funded_discount: number;
  taxable_amount?: number | null;
  output_vat_rate?: number | null;
  output_vat_amount?: number | null;
  net_revenue?: number | null;
  output_vat_rate_source?: string | null;
  modifiers?: unknown;
  prep_product_ids?: string[];
  actual_cogs?: number | null;
  cogs_status: SalesCogsStatus | string;
  cogs_pending_reason?: string | null;
};

export type ErpSalesSourceLink = {
  id: string;
  sales_document_id: string;
  source_system: SalesSourceSystem | string;
  external_id: string;
  account_or_location_key: string;
  match_kind: SalesMatchKind | string;
  raw_payload?: unknown;
  created_at?: string;
};

/** Import contract (Poster / Grab) — validated stubs only in 9B. */
export type SalesImportRowContract = {
  external_id: string;
  account_or_location_key?: string;
  order_at?: string;
  business_date?: string;
  channel_code?: string;
  gross_sales?: number;
  merchant_funded_discount?: number;
  platform_funded_discount?: number;
  lines?: Array<{
    external_line_id?: string;
    sku_or_dish_code?: string;
    quantity: number;
    gross_sales?: number;
    modifiers?: unknown[];
  }>;
  raw?: unknown;
};
