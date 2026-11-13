import type { ErpProductType, ErpUnit, LossMethod, LossPcts } from "./costing";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceEmployee,
  FinancePayroll,
  FinanceShift,
  FinanceTransaction,
} from "./finance";
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

export type ErpSettings = {
  input_vat_enabled: boolean;
  output_vat_enabled: boolean;
  default_input_vat_rate: number | null;
  default_output_vat_rate: number | null;
  timezone?: string;
};

/** Ingredient whose input VAT differs from the company default. Edited in Служебное. */
export type ErpVatException = {
  product_id: string;
  vat_rate: number;
};

type Archivable = { archived_at: string | null };

export type ErpCategory = Archivable & {
  id: string;
  code: string;
  name_en: string;
  name_vn: string;
  sort: number;
  deleted_at?: string | null;
};
export type ErpSupplier = Archivable & { id: string; code: string; name: string; zalo_url: string | null; sort: number };
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
export type ErpChannel = Archivable & { id: string; code: string; name: string; commission_pct: number | null; sort: number };

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
  category_id: string | null;
  base_unit: ErpUnit | null;
  unit_weight_kg: number | null;
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
};

export type ErpRecipeStep = { title?: { en?: string; vn?: string }; items?: { en?: string; vn?: string }[] };

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
  /** Products with a VAT rate other than the company default. Missing → none. */
  vatExceptions?: ErpVatException[];
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
  | { action: "savePack"; pack: Record<string, unknown> }
  | { action: "setArchived"; entity: string; id: string; archived: boolean }
  | { action: "saveRef"; entity: "category" | "supplier" | "warehouse" | "channel"; value: Record<string, unknown> }
  | { action: "saveLocation"; value: Record<string, unknown> }
  | { action: "deleteLocation"; id: string }
  | { action: "deleteCategory"; id: string }
  | { action: "restoreCategory"; id: string }
  | { action: "purgeCategoryTrash" }
  | { action: "saveSettings"; settings: Partial<ErpSettings> }
  | { action: "saveVatException"; exception: { product_id: string; vat_rate: number } }
  | { action: "deleteVatException"; productId: string }
  | { action: "saveWriteoffReason"; reason: Record<string, unknown> }
  | { action: "saveDocument"; document: Record<string, unknown> }
  /** With `document`, the draft is saved first (and stays saved if posting fails). */
  | { action: "postDocument"; id?: string; document?: Record<string, unknown> }
  | { action: "cancelDocument"; id: string; reason: string }
  | { action: "deleteDraft"; id: string }
  | { action: "saveRecipe"; recipe: Record<string, unknown> }
  | { action: "activateRecipe"; id: string }
  | { action: "resolveRecipeLine"; lineId: string; productId: string; qty: number; remember: boolean }
  | { action: "saveDish"; dish: Record<string, unknown> }
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
  | { action: "payFinancePayroll"; value: Record<string, unknown> };
