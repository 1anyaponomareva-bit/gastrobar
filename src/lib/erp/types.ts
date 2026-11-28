import type { ErpProductType, ErpUnit, LossMethod, LossPcts } from "./costing";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceEmployee,
  FinancePayroll,
  FinanceShift,
  FinanceTransaction,
} from "./finance";
import type { ErpLegalEntity, ErpSalesDocument, ErpSalesLine, ErpSalesSourceLink } from "./sales";
export type { MenuPriceSource, ProductCostQuote } from "./costing";
export type { StaffMergeResult } from "./staffMerge";
export type {
  FinanceAccount as ErpFinanceAccount,
  FinanceCategory as ErpFinanceCategory,
  FinanceEmployee as ErpFinanceEmployee,
  FinancePayroll as ErpFinancePayroll,
  FinanceShift as ErpFinanceShift,
  FinanceTransaction as ErpFinanceTransaction,
} from "./finance";
export type {
  ErpLegalEntity,
  ErpSalesDocument,
  ErpSalesLine,
  ErpSalesSourceLink,
} from "./sales";

export type ErpSettings = {
  input_vat_enabled: boolean;
  /** Sales Prices Include VAT (menu/channel prices are gross when true). Legacy column name kept. */
  output_vat_enabled: boolean;
  default_input_vat_rate: number | null;
  default_output_vat_rate: number | null;
  /** Nullable until confirmed by administrator/accountant: cash | accrual | hybrid | unconfirmed. */
  vat_accounting_method?: string | null;
  /** Company default for purchase/receipt prices include VAT. Document flag still wins. */
  purchase_prices_include_vat_default?: boolean;
  default_input_tax_rate_id?: string | null;
  default_output_tax_rate_id?: string | null;
  timezone?: string;
  /**
   * Phase 8F: planned tech-card cost policy.
   * Actual warehouse write-off remains FIFO (`erp_consume`).
   */
  recipe_cost_source?: "manual_estimated" | "last_purchase" | "weighted_average" | "estimated_fifo" | null;
  /**
   * When false (default), VAT cost adjustments dated before Vietnam today are refused.
   * Checkbox confirmation alone is not enough. Full period close = Release 3.
   */
  vat_adj_allow_backdated?: boolean | null;
  /** Phase 9B: default legal entity for sales docs. */
  default_legal_entity_id?: string | null;
  /**
   * Phase 9B: when true, erp_sales_post_cogs may call FIFO consume.
   * Default false — do not mass-auto consume production stock.
   */
  sales_auto_consume_stock?: boolean | null;
};

export type ErpDishCostSnapshot = {
  id: number;
  dish_id: string;
  calculated_at: string;
  calculated_by?: string | null;
  cost_source?: string | null;
  food_cost?: number | null;
  packaging_cost?: number | null;
  total_product_cost?: number | null;
  cost_complete?: boolean;
  change_reason?: string | null;
  changed_ingredients?: unknown;
  line_breakdown?: unknown;
  previous_total?: number | null;
  notes?: string | null;
};

/**
 * Input/Output VAT exception (Phase 4). Legacy rows are input/product with product_id only.
 * Edited in Служебное — independent lists per direction.
 */
export type ErpVatException = {
  id?: string;
  product_id?: string | null;
  category_id?: string | null;
  dish_id?: string | null;
  vat_rate: number;
  direction?: "input" | "output" | string | null;
  vat_direction?: "input" | "output" | string | null;
  scope_kind?: "product" | "category" | "dish" | string | null;
  scope?: "product" | "category" | "dish" | string | null;
  tax_rate_id?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  note?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

/** Row from erp_tax_rates catalog (Phase 3). */
export type ErpTaxRate = {
  id: string;
  code: string;
  name: string;
  name_vn?: string | null;
  rate: number;
  tax_treatment: "standard" | "exempt" | "not_subject" | string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  sort?: number;
  updated_at?: string | null;
  updated_by?: string | null;
};

type Archivable = { archived_at: string | null };

export type ErpCategory = Archivable & {
  id: string;
  code: string;
  name_en: string;
  name_vn: string;
  names?: Record<string, string>;
  sort: number;
  deleted_at?: string | null;
};
export type ErpSupplier = Archivable & {
  id: string;
  code: string;
  name: string;
  zalo_url: string | null;
  sort: number;
  /** MST / tax code copied into receipt header when supplier is chosen. */
  tax_code?: string | null;
};

/** Input VAT deduction on a purchase (receipt) line. Default for unconfirmed buys: pending. */
export type ErpVatDeductionStatus = "pending" | "deductible" | "partial" | "non_deductible";

/** Invoice / tax-document check on a receipt header. missing ≠ deductible. */
export type ErpVatVerificationStatus = "missing" | "pending" | "verified" | "rejected";

/** Receipt acquisition fee kinds (Phase 8C). */
export type ErpAcquisitionKind = "transport" | "delivery" | "handling" | "other";

export type ErpAcquisitionCost = {
  kind: ErpAcquisitionKind;
  /** Entered amount (net or gross per vat_included). */
  amount: number | null;
  vat_rate?: number | null;
  vat_included?: boolean;
  vat_deduction_status?: ErpVatDeductionStatus | string | null;
  deductible_vat_pct?: number | null;
  net_amount?: number | null;
  vat_amount?: number | null;
  /** Inventory-includable total for this fee (net + non-deductible + pending VAT). */
  inventory_amount?: number | null;
};
export type ErpLocation = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  is_active: boolean;
  default_warehouse_id: string | null;
  created_at: string;
};
export type ErpWarehouseKind = "warehouse" | "prep_kitchen" | "online_kitchen" | "food_truck" | "other";
export type ErpWarehouse = Archivable & {
  id: string;
  code: string;
  name: string;
  kind: ErpWarehouseKind;
  sort: number;
  address?: string | null;
  phone?: string | null;
};
export type ErpWriteoffReason = Archivable & { id: string; name: string; color: string; pnl_block: "cost" | "expense"; sort: number };
/** Sales channel. commission_pct = Legacy Rate (Phase 6 still uses it). Finance fields from Phase 5. */
export type ErpChannel = Archivable & {
  id: string;
  code: string;
  name: string;
  /** Legacy single commission % of menu price — fallback when Phase 5 finance is absent. */
  commission_pct: number | null;
  /** Frozen copy of commission_pct; never auto-split into net/VAT/ads. */
  legacy_commission_pct?: number | null;
  sort: number;
  output_vat_rate?: number | null;
  selling_price_includes_vat?: boolean | null;
  finance_preliminary?: boolean | null;
  commission_enabled?: boolean | null;
  commission_rate?: number | null;
  commission_vat_included?: boolean | null;
  commission_vat_rate?: number | null;
  commission_calc_base?: string | null;
  commission_vat_deduction_status?: string | null;
  commission_deductible_vat_pct?: number | null;
  advertising_enabled?: boolean | null;
  advertising_scenario?: string | null;
  advertising_rate?: number | null;
  advertising_vat_included?: boolean | null;
  advertising_vat_rate?: number | null;
  advertising_calc_base?: string | null;
  advertising_vat_deduction_status?: string | null;
  advertising_deductible_vat_pct?: number | null;
  advertising_organic_gross_pct?: number | null;
  advertising_standard_gross_pct?: number | null;
  advertising_full_gross_pct?: number | null;
  merchant_discounts_enabled?: boolean | null;
  platform_fees_enabled?: boolean | null;
  chargebacks_enabled?: boolean | null;
  financial_adjustments_enabled?: boolean | null;
  additional_expenses_note?: string | null;
  min_margin_pct?: number | null;
  target_margin_pct?: number | null;
  optimal_margin_pct?: number | null;
  finance_effective_from?: string | null;
  finance_effective_to?: string | null;
};

/** Shared ordering unit (Poster «Фасовка»): name is English display; name_vn is optional Vietnamese. */
export type ErpPack = {
  id: string;
  name: string;
  name_vn?: string | null;
  unit: ErpUnit;
  qty_base: number;
  archived_at?: string | null;
};

/** Product ↔ catalog pack link: supplier, optional supplier SKU, and the product's default pack. */
export type ErpProductPack = {
  id: string;
  product_id: string;
  pack_id: string;
  supplier_id: string | null;
  label: string;
  qty_base: number;
  is_default: boolean;
  /** Supplier SKU for this pack of this product. Independent of erp_products.product_code. */
  code?: string | null;
  archived_at?: string | null;
};

export type ErpProduct = Archivable & LossPcts & {
  id: string;
  code: string;
  type: ErpProductType;
  name_en: string;
  name_vn: string;
  names?: Record<string, string>;
  category_id: string | null;
  base_unit: ErpUnit | null;
  /** Gross weight of 1 piece (kg) when base_unit is pcs. */
  unit_weight_kg: number | null;
  /** Net/usable weight of 1 piece (kg) when base_unit is pcs. Falls back to unit_weight_kg when null. */
  unit_net_weight_kg?: number | null;
  brand: string | null;
  product_code?: string | null;
  est_unit_cost: number | null;
  est_cost_source: "receipt" | "manual" | null;
  est_cost_at: string | null;
  shelf_life_days: number | null;
  storage_conditions: string | null;
  staff_listed: boolean;
  staff_unit: string | null;
  staff_pack: string | null;
  staff_supplier_id: string | null;
  staff_item_no?: string | null;
  staff_hidden?: boolean;
  staff_category?: string | null;
  /** Structured Orders packing (Accountable / Prep). Not free-text staff_pack. */
  order_pack_type?: string | null;
  order_pack_content_qty?: number | null;
  order_pack_content_unit?: string | null;
  /** Prep Stock control: highlight on Share PDF when qty ≤ this value. */
  staff_stock_alert_qty?: number | null;
  photo?: string | null;
};

export type ErpStockRow = {
  product_id: string;
  warehouse_id: string;
  qty: number;
  known_value: number | null;
  cost_known: boolean;
  nearest_expiry: string | null;
};

export type ErpRecipeLine = {
  id: string;
  recipe_id: string;
  line_no: number;
  product_id: string | null;
  qty: number | null;
  note: string | null;
  raw_name: { en?: string; vn?: string; ru?: string } | null;
  raw_amount: number | null;
  raw_unit: string | null;
  methods?: LossMethod[];
  net_qty?: number | null;
  parts?: { name: string; grams: number }[];
  is_main?: boolean;
};

export type ErpRecipeStep = {
  title?: Record<string, string>;
  photo?: string;
  items?: Record<string, string>[];
};

export type ErpRecipe = {
  id: string;
  product_id: string;
  version: number;
  status: "draft" | "active" | "archived";
  yield_qty: number | null;
  yield_pieces: number | null;
  instructions: ErpRecipeStep[] | string;
  shelf_life_days: number | null;
  storage_conditions: string | null;
  note: string | null;
  card_no?: string | null;
  card_date?: string | null;
  card_revision?: string | null;
  photo?: string | null;
  kind?: "sauce" | "prep";
  legacy_recipe_id: string | null;
  created_at: string;
  created_by: string | null;
  activated_at: string | null;
  lines: ErpRecipeLine[];
};

export type ErpDishLine = {
  id: string;
  dish_id: string;
  line_no: number;
  product_id: string;
  qty: number;
  note: string | null;
  methods?: LossMethod[];
  net_qty?: number | null;
  parts?: { name: string; grams: number }[];
  is_main?: boolean;
};

export type ErpMovementRow = {
  product_id: string;
  warehouse_id: string;
  opening_qty: number;
  opening_value: number | null;
  in_qty: number;
  in_value: number | null;
  out_qty: number;
  out_value: number | null;
  closing_qty: number;
  closing_value: number | null;
};

export type ErpProductReceipt = {
  document_id: string;
  doc_no: string;
  doc_type: "receipt" | "opening";
  doc_date: string;
  warehouse_id: string | null;
  supplier_id: string | null;
  qty: number;
  unit_cost: number | null;
  cost_amount: number | null;
};

export type ErpDish = Archivable & {
  id: string;
  code: string;
  name_en: string;
  name_vn: string;
  names?: Record<string, string>;
  category_id: string | null;
  sale_price: number | null;
  vat_rate: number | null;
  note: string | null;
  lines: ErpDishLine[];
  channel_prices: { channel_id: string; sale_price: number }[];
};

/** Planned unit prices for a tech-card. Unknown stays null, never 0. */
export type ErpProductCostQuote = {
  product_id: string;
  last_lot: number | null;
  fifo_remaining: number | null;
  reference: number | null;
};

export type ErpCardEntity = "product" | "recipe" | "dish";

export type ErpCardRevision = {
  id: number;
  entity: ErpCardEntity;
  entity_id: string;
  saved_at: string;
  saved_by: string | null;
  action: string;
  snapshot: Record<string, unknown>;
};

export type ErpState = {
  settings: ErpSettings;
  categories: ErpCategory[];
  suppliers: ErpSupplier[];
  warehouses: ErpWarehouse[];
  locations?: ErpLocation[];
  channels: ErpChannel[];
  products: ErpProduct[];
  packs: ErpPack[];
  productPacks: ErpProductPack[];
  stock: ErpStockRow[];
  recipes: ErpRecipe[];
  dishes: ErpDish[];
  writeoffReasons: ErpWriteoffReason[];
  /** Optional: loaded with `?parts=costSources` or the full state after the menu migration. */
  costSources?: ErpProductCostQuote[];
  financeAccounts?: FinanceAccount[];
  financeCategories?: FinanceCategory[];
  financeTransactions?: FinanceTransaction[];
  financeShifts?: FinanceShift[];
  financeEmployees?: FinanceEmployee[];
  financePayroll?: FinancePayroll[];
  /** Phase 9B sales (accrual). Missing until migrations applied. */
  legalEntities?: ErpLegalEntity[];
  salesDocuments?: ErpSalesDocument[];
  salesLines?: ErpSalesLine[];
  salesSourceLinks?: ErpSalesSourceLink[];
  /** Phase 9C Input VAT register supporting catalogs/docs. */
  inputVatCategories?: Array<{
    code: string;
    name_en: string;
    name_ru?: string | null;
    name_vn?: string | null;
    sort: number;
  }>;
  taxInvoices?: Array<Record<string, unknown>>;
  expenseDocuments?: Array<Record<string, unknown>>;
  /** Phase 9D platforms / Grab settlements. */
  platformAccounts?: Array<Record<string, unknown>>;
  platformImportBatches?: Array<Record<string, unknown>>;
  platformSettlements?: Array<Record<string, unknown>>;
  platformSettlementLines?: Array<Record<string, unknown>>;
  platformPayouts?: Array<Record<string, unknown>>;
  platformReconciliation?: Array<Record<string, unknown>>;
  /** Phase 9E VAT settlement. */
  vatSettlements?: Array<Record<string, unknown>>;
  vatCarryforwards?: Array<Record<string, unknown>>;
  vatPayments?: Array<Record<string, unknown>>;
  vatPeriodCorrections?: Array<Record<string, unknown>>;
  /** Phase 9F pending COGS / BOM snapshots. */
  salesPendingCogs?: Array<Record<string, unknown>>;
  salesBomSnapshots?: Array<Record<string, unknown>>;
  /** Phase 9G */
  expensePayments?: Array<Record<string, unknown>>;
  payrollAccruals?: Array<Record<string, unknown>>;
  fixedAssets?: Array<Record<string, unknown>>;
  apArItems?: Array<Record<string, unknown>>;
  /** Phase 9H financial periods / audit */
  financialPeriods?: Array<Record<string, unknown>>;
  periodClosings?: Array<Record<string, unknown>>;
  periodCloseChecks?: Array<Record<string, unknown>>;
  periodSnapshots?: Array<Record<string, unknown>>;
  periodReopenRequests?: Array<Record<string, unknown>>;
  financialCorrections?: Array<Record<string, unknown>>;
  auditLog?: Array<Record<string, unknown>>;
  /** Products with a VAT rate other than the company default. Missing → none. */
  vatExceptions?: ErpVatException[];
  /** Tax rates catalog. Missing → UI falls back to hardcoded 0/5/8/10. */
  taxRates?: ErpTaxRate[];
};

export type ErpDocType = "opening" | "receipt" | "transfer" | "writeoff" | "count" | "production";
export type ErpDocStatus = "draft" | "posted" | "cancelled";

export type ErpCountKind = "full" | "partial";
export type ErpCountMode = "stock" | "explode";
/** Surplus lot cost: last known lot on the warehouse, else product estimate, else unknown (never treated as 0). */
export type ErpSurplusCostSource = "last_lot" | "product_reference" | "unknown";
export type ErpCountExcludeReason =
  | "no_movement_in_period"
  | "not_selected"
  | "archived"
  | "not_found"
  | "already_counted"
  | "superseded";

export type ErpCountMove = {
  document_id: string;
  doc_no: string;
  doc_type: ErpDocType;
  occurred_at: string;
  qty: number;
  direction: "in" | "out";
};

export type ErpDocumentLine = {
  id?: string;
  line_no?: number;
  product_id: string;
  qty: number;
  /** Count only. false / missing fact_qty = not counted; 0 qty with counted=true is an explicit zero. */
  counted?: boolean;
  fact_qty?: number | null;
  planned_qty?: number | null;
  pack_id?: string | null;
  pack_qty?: number | null;
  pack_name?: string | null;
  pack_unit?: string | null;
  pack_qty_base?: number | null;
  unit_price?: number | null;
  vat_rate?: number | null;
  /** Line override; when null, document `prices_include_vat` applies. */
  vat_included?: boolean | null;
  vat_deduction_status?: ErpVatDeductionStatus | string | null;
  deductible_vat_pct?: number | null;
  deductible_vat_amount?: number | null;
  non_deductible_vat_amount?: number | null;
  pending_vat_amount?: number | null;
  allocated_acquisition_cost?: number | null;
  effective_inventory_cost?: number | null;
  net_unit_price?: number | null;
  gross_unit_price?: number | null;
  batch_no?: string | null;
  expires_at?: string | null;
  reason?: string | null;
  net_amount?: number | null;
  vat_amount?: number | null;
  gross_amount?: number | null;
  system_qty?: number | null;
  diff_qty?: number | null;
  cost_amount?: number | null;
  unit_cost?: number | null;
  cost_known?: boolean | null;
  period_start?: string | null;
  opening_qty?: number | null;
  in_qty?: number | null;
  out_qty?: number | null;
  book_qty?: number | null;
  last_count_id?: string | null;
  in_composition_qty?: number | null;
  surplus_cost_source?: ErpSurplusCostSource | null;
  count_mode?: ErpCountMode | null;
  count_moves?: ErpCountMove[] | null;
  /** Counts API (`erp_count_get` / preview) uses this key for the same jsonb as `count_moves`. */
  moves?: ErpCountMove[] | null;
};

export type ErpDocument = {
  id?: string;
  doc_no?: string;
  doc_type: ErpDocType;
  status?: ErpDocStatus;
  doc_date?: string;
  warehouse_id?: string | null;
  target_warehouse_id?: string | null;
  supplier_id?: string | null;
  reason?: string | null;
  reason_id?: string | null;
  /** Time of day of the document (write-offs), HH:MM[:SS]. */
  doc_time?: string | null;
  /** Sent with a new document so that a repeated save/post returns the same document. */
  client_key?: string | null;
  comment?: string | null;
  prices_include_vat?: boolean;
  /** Supplier MST on the receipt (may differ from master until synced). */
  supplier_tax_code?: string | null;
  vat_invoice_number?: string | null;
  vat_invoice_serial?: string | null;
  vat_invoice_date?: string | null;
  invoice_attachment_url?: string | null;
  vat_verification_status?: ErpVatVerificationStatus | string | null;
  payment_status?: string | null;
  /** Phase 8C acquisition fees on receipts (allocated into line/lot cost on post). */
  acquisition_costs?: ErpAcquisitionCost[];
  recipe_id?: string | null;
  output_product_id?: string | null;
  plan_output_qty?: number | null;
  output_qty?: number | null;
  output_pieces?: number | null;
  output_weight_kg?: number | null;
  batch_no?: string | null;
  expires_at?: string | null;
  responsible?: string | null;
  total_cost?: number | null;
  cost_known?: boolean | null;
  output_unit_cost?: number | null;
  lock_version?: number;
  created_at?: string;
  created_by?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  occurred_at?: string | null;
  counted_at?: string | null;
  count_kind?: ErpCountKind | null;
  snapshot_hash?: string | null;
  snapshot_movement_max?: number | null;
  superseded_by?: string | null;
  correction_of?: string | null;
  count_scope?: { product_ids?: string[]; category_ids?: string[]; explode_product_ids?: string[] } | null;
  accept_stale?: boolean;
  dish_lines?: ErpCountDishLine[];
  lines: ErpDocumentLine[];
};

export type ErpCountDishLine = {
  dish_id: string;
  qty: number;
  counted: boolean;
};

export type ErpCountPreview = {
  warehouse_id: string;
  count_kind: ErpCountKind;
  counted_at: string;
  timezone: string;
  snapshot_hash: string;
  snapshot_movement_max: number | null;
  lines: ErpDocumentLine[];
  idle: { product_id: string; qty: number; reason: "no_movement_in_period" }[];
  excluded: { product_id?: string; reason: ErpCountExcludeReason | string; detail?: string }[];
  replaces: { id: string; doc_no: string; count_kind: ErpCountKind | null; counted_at: string | null }[];
  conflicts: { id: string; doc_no: string; product_id: string; reason: string }[];
  surplus_cost_policy: { order: ErpSurplusCostSource[]; unknown_is_not_zero: true };
};

export type ErpAction =
  | { action: "saveProduct"; product: Record<string, unknown> }
  | { action: "setPrepStockListed"; id: string; listed: boolean }
  | { action: "savePack"; pack: Record<string, unknown> }
  | { action: "setArchived"; entity: string; id: string; archived: boolean }
  | { action: "saveRef"; entity: "category" | "supplier" | "warehouse" | "channel"; value: Record<string, unknown> }
  | { action: "saveLocation"; value: Record<string, unknown> }
  | { action: "deleteLocation"; id: string }
  | { action: "deleteCategory"; id: string }
  | { action: "restoreCategory"; id: string }
  | { action: "purgeCategoryTrash" }
  | { action: "saveSettings"; settings: Partial<ErpSettings> }
  | { action: "saveTaxRate"; taxRate: Record<string, unknown> }
  | {
      action: "saveVatException";
      exception: {
        id?: string;
        direction?: "input" | "output";
        vat_direction?: "input" | "output";
        scope_kind?: "product" | "category" | "dish";
        scope?: "product" | "category" | "dish";
        product_id?: string | null;
        category_id?: string | null;
        dish_id?: string | null;
        vat_rate: number;
        tax_rate_id?: string | null;
        effective_from?: string | null;
        effective_to?: string | null;
        note?: string | null;
      };
    }
  | { action: "deleteVatException"; productId?: string; id?: string }
  | { action: "saveWriteoffReason"; reason: Record<string, unknown> }
  | { action: "saveDocument"; document: Record<string, unknown> }
  /** With `document`, the draft is saved first (and stays saved if posting fails). */
  | { action: "postDocument"; id?: string; document?: Record<string, unknown> }
  | { action: "cancelDocument"; id: string; reason: string }
  | { action: "deleteDraft"; id: string }
  | { action: "saveRecipe"; recipe: Record<string, unknown> }
  | { action: "activateRecipe"; id: string }
  | { action: "publishPrepToStaff"; productId: string }
  | { action: "resolveRecipeLine"; lineId: string; productId: string; qty: number; remember: boolean }
  | { action: "saveDish"; dish: Record<string, unknown> }
  | {
      action: "recordDishCostSnapshot";
      snapshot: {
        dish_id: string;
        cost_source?: string | null;
        food_cost?: number | null;
        packaging_cost?: number | null;
        total_product_cost?: number | null;
        cost_complete?: boolean;
        change_reason?: string | null;
        changed_ingredients?: unknown;
        line_breakdown?: unknown;
        previous_total?: number | null;
        notes?: string | null;
      };
    }
  | { action: "loadDishCostHistory"; dishId: string; limit?: number }
  | { action: "staffCatalogMerge"; apply: boolean }
  | { action: "importRecipes" }
  | { action: "previewCount"; preview: Record<string, unknown> }
  | { action: "refreshCount"; id: string }
  | { action: "reopenCount"; id: string; reason: string; cascade?: boolean }
  | { action: "saveFinanceAccount"; value: Record<string, unknown> }
  | { action: "deleteFinanceAccount"; id: string }
  | { action: "restoreFinanceAccount"; id: string }
  | { action: "saveFinanceCategory"; value: Record<string, unknown> }
  | { action: "deleteFinanceCategory"; id: string; moveToId?: string | null }
  | { action: "saveFinanceTransaction"; value: Record<string, unknown> }
  | { action: "deleteFinanceTransaction"; id: string }
  | { action: "restoreFinanceTransaction"; id: string }
  | { action: "saveFinanceShift"; value: Record<string, unknown> }
  | { action: "closeFinanceShift"; value: Record<string, unknown> }
  | { action: "saveFinanceEmployee"; value: Record<string, unknown> }
  | { action: "saveFinancePayroll"; value: Record<string, unknown> }
  | { action: "payFinancePayroll"; value: Record<string, unknown> }
  | { action: "saveSalesDocument"; value: Record<string, unknown> }
  | { action: "postSalesDocument"; id: string }
  | { action: "cancelSalesDocument"; id: string; reason?: string | null }
  | { action: "refundSalesDocument"; id: string; amount?: number | null; full?: boolean }
  | { action: "linkSalesSource"; value: Record<string, unknown> }
  | { action: "postSalesCogs"; id: string; autoConsume?: boolean }
  | { action: "validateSalesImportStub"; value: Record<string, unknown> }
  | { action: "inputVatRegister"; value: Record<string, unknown> }
  | { action: "saveTaxInvoice"; value: Record<string, unknown> }
  | { action: "saveExpenseDocument"; value: Record<string, unknown> }
  | { action: "postExpenseDocument"; id: string }
  | { action: "setExpenseVatStatus"; id: string; value: Record<string, unknown> }
  | { action: "platformDashboard"; value?: Record<string, unknown> }
  | { action: "savePlatformAccount"; value: Record<string, unknown> }
  | { action: "platformImportUpload"; value: Record<string, unknown> }
  | { action: "platformImportPreview"; id: string; value: Record<string, unknown> }
  | { action: "platformImportConfirm"; id: string }
  | { action: "platformImportApply"; id: string; value?: Record<string, unknown> }
  | { action: "savePlatformPayout"; value: Record<string, unknown> }
  | { action: "postPlatformPayout"; id: string }
  | { action: "platformManualMatch"; id: string; value: Record<string, unknown> }
  | { action: "saveVatSettlement"; value: Record<string, unknown> }
  | { action: "approveVatSettlement"; id: string; force?: boolean }
  | { action: "saveVatCarryforwardOpening"; value: Record<string, unknown> }
  | { action: "saveVatPayment"; value: Record<string, unknown> }
  | { action: "postVatPayment"; id: string }
  | { action: "saveVatPeriodCorrection"; value: Record<string, unknown> }
  | { action: "exportVatSettlement"; id: string }
  | { action: "profitabilityChannels"; value?: Record<string, unknown> }
  | { action: "profitabilityLocations"; value?: Record<string, unknown> }
  | { action: "profitabilityProducts"; value?: Record<string, unknown> }
  | { action: "profitabilityPendingCogs"; value?: Record<string, unknown> }
  | { action: "saveExpensePayment"; value: Record<string, unknown> }
  | { action: "postExpensePayment"; id: string }
  | { action: "saveExpenseAllocation"; value: Record<string, unknown> }
  | { action: "savePayrollAccrual"; value: Record<string, unknown> }
  | { action: "postPayrollAccrual"; id: string }
  | { action: "postPayrollPayment"; value: Record<string, unknown> }
  | { action: "saveFixedAsset"; value: Record<string, unknown> }
  | { action: "activateFixedAsset"; id: string }
  | { action: "runDepreciation"; value: Record<string, unknown> }
  | { action: "accrualPnl"; value?: Record<string, unknown> }
  | { action: "managementCashflow"; value?: Record<string, unknown> }
  | { action: "financeDashboard"; value?: Record<string, unknown> }
  | { action: "apArSummary" }
  | { action: "saveFinancialPeriod"; value: Record<string, unknown> }
  | { action: "setFinancialPeriodStatus"; id: string; value: Record<string, unknown> }
  | { action: "periodCloseChecklist"; id: string }
  | { action: "closeFinancialPeriod"; id: string; value?: Record<string, unknown> }
  | { action: "reopenFinancialPeriod"; id: string; value: Record<string, unknown> }
  | { action: "listPeriodSnapshots"; id: string }
  | { action: "saveFinancialCorrection"; value: Record<string, unknown> }
  | { action: "postFinancialCorrection"; id: string }
  | { action: "previewVatAdjustment"; preview: Record<string, unknown> }
  | { action: "saveVatAdjustment"; adjustment: Record<string, unknown> }
  | { action: "postVatAdjustment"; id: string; previewHash?: string | null }
  | { action: "reverseVatAdjustment"; id: string };
