import type { ErpProductType, ErpUnit, LossMethod, LossPcts } from "./costing";
export type { StaffMergeResult } from "./staffMerge";

export type ErpSettings = {
  input_vat_enabled: boolean;
  output_vat_enabled: boolean;
  default_input_vat_rate: number | null;
  default_output_vat_rate: number | null;
};

type Archivable = { archived_at: string | null };

export type ErpCategory = Archivable & { id: string; code: string; name_en: string; name_vn: string; sort: number };
export type ErpSupplier = Archivable & { id: string; code: string; name: string; zalo_url: string | null; sort: number };
export type ErpWarehouseKind = "warehouse" | "prep_kitchen" | "online_kitchen" | "food_truck" | "other";
export type ErpWarehouse = Archivable & { id: string; code: string; name: string; kind: ErpWarehouseKind; sort: number };
export type ErpWriteoffReason = Archivable & { id: string; name: string; color: string; pnl_block: "cost" | "expense"; sort: number };
export type ErpChannel = Archivable & { id: string; code: string; name: string; commission_pct: number | null; sort: number };

export type ErpPack = {
  id: string;
  product_id: string;
  supplier_id: string | null;
  label: string;
  qty_base: number;
  is_default: boolean;
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

export type ErpState = {
  settings: ErpSettings;
  categories: ErpCategory[];
  suppliers: ErpSupplier[];
  warehouses: ErpWarehouse[];
  channels: ErpChannel[];
  products: ErpProduct[];
  packs: ErpPack[];
  stock: ErpStockRow[];
  recipes: ErpRecipe[];
  dishes: ErpDish[];
  writeoffReasons: ErpWriteoffReason[];
};

export type ErpDocType = "opening" | "receipt" | "transfer" | "writeoff" | "count" | "production";
export type ErpDocStatus = "draft" | "posted" | "cancelled";

export type ErpDocumentLine = {
  id?: string;
  line_no?: number;
  product_id: string;
  qty: number;
  planned_qty?: number | null;
  pack_id?: string | null;
  pack_qty?: number | null;
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
  lines: ErpDocumentLine[];
};

export type ErpAction =
  | { action: "saveProduct"; product: Record<string, unknown> }
  | { action: "setArchived"; entity: string; id: string; archived: boolean }
  | { action: "saveRef"; entity: "category" | "supplier" | "warehouse" | "channel"; value: Record<string, unknown> }
  | { action: "saveSettings"; settings: Partial<ErpSettings> }
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
  | { action: "importRecipes" };
