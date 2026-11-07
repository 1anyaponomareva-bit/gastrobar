/** Shared DTOs for the employee /orders app and ERP purchasing screens. */

export type OrderStatus = "draft" | "ordered" | "partial" | "received" | "closed";
export type ReceiptDocStatus = "draft" | "posted" | "cancelled" | "clarify";
export type DiscrepancyKind = "none" | "short" | "over" | "substitute" | "other";

/** Frozen catalog names on an order/PDF line. Agent 1 PDF uses the same fields. */
export type OrderLineSnapshot = {
  id?: string;
  product_id: string;
  pack_id: string | null;
  nameEn: string;
  nameVn: string;
  brand: string | null;
  packLabel: string;
  unit: string;
  qty: number;
  qtyBase?: number | null;
  unitPrice?: number | null;
};

export type OrderSupplier = {
  id: string;
  name: string;
  code: string;
  zaloUrl: string | null;
  productCount: number;
  draftLineCount: number;
};

export type OrderWarehouse = {
  id: string;
  name: string;
  kind: string;
  isDefault?: boolean;
  address?: string | null;
  phone?: string | null;
};

export type OrderCategory = {
  id: string;
  name: string;
};

export type OrderProductPack = {
  id: string;
  pack_id: string;
  label: string;
  unit: string;
  qty_base: number;
  is_default: boolean;
  /** Supplier SKU for this pack; optional, ignored by older clients. */
  code?: string | null;
  supplierId?: string | null;
};

export type OrderProduct = {
  id: string;
  nameEn: string;
  nameVn: string;
  brand: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryNameVn?: string | null;
  unit: string;
  itemNo: string | null;
  /** ERP `product_code` only — not Staff itemNo. PDF SKU fallback when pack.code is empty. */
  productCode?: string | null;
  supplierId: string | null;
  sort: number;
  hidden?: boolean;
  packs: OrderProductPack[];
};

export type OrderCatalogPayload = {
  products: OrderProduct[];
  suppliers: OrderSupplier[];
  warehouses: OrderWarehouse[];
  defaultWarehouseId: string | null;
};

export type DraftLine = {
  product_id: string;
  pack_id: string | null;
  qty: number;
};

export type OrderDraft = {
  id: string;
  supplierId: string;
  orderNo: string | null;
  status: OrderStatus;
  warehouseId: string | null;
  comment: string | null;
  expectedDelivery: string | null;
  revision: number;
  placedAt: string | null;
  pdfUrl: string | null;
  pdfRevision: number | null;
  lines: DraftLine[];
};

export type OrderLineDetail = OrderLineSnapshot & {
  orderedQty: number;
  acceptedQty: number;
  postedQty: number;
  remainingQty: number;
};

export type OrderPhoto = {
  id?: string;
  url?: string;
  fileName: string;
  mimeType: string;
  dataUrl?: string;
};

export type OrderReceiptLine = {
  orderLineId: string | null;
  product_id: string;
  nameEn: string;
  nameVn: string;
  packLabel: string;
  unit: string;
  orderedQty: number;
  actualQty: number;
  discrepancyKind: DiscrepancyKind;
  discrepancyNote: string | null;
};

export type OrderReceipt = {
  id: string;
  docNo: string;
  status: ReceiptDocStatus;
  createdAt: string | null;
  createdBy: string | null;
  comment: string | null;
  clarifyReason: string | null;
  lines: OrderReceiptLine[];
  photos: OrderPhoto[];
};

export type OrderHistoryEvent = {
  at: string;
  by: string | null;
  type: string;
  text: string;
};

export type SupplierOrder = {
  id: string;
  docNo: string;
  status: OrderStatus;
  supplierId: string;
  supplierName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  createdAt: string | null;
  createdBy: string | null;
  placedAt: string | null;
  placedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  expectedDelivery: string | null;
  comment: string | null;
  revision: number;
  pdfUrl: string | null;
  clarifyReason: string | null;
  lines: OrderLineDetail[];
  receipts: OrderReceipt[];
  history: OrderHistoryEvent[];
};

export type OrderListQuery = {
  supplierId?: string;
  status?: OrderStatus | "";
  q?: string;
};

export type ReceiveLineInput = {
  orderLineId: string;
  product_id: string;
  pack_id: string | null;
  actualQty: number;
  discrepancyKind: DiscrepancyKind;
  discrepancyNote: string | null;
};

export type ReceiveInput = {
  idempotencyKey: string;
  comment: string;
  lines: ReceiveLineInput[];
  photos: OrderPhoto[];
};

export type PdfResult = {
  pdfUrl: string | null;
  revision: number;
  blob?: Blob | null;
};

export type SessionInfo = {
  email: string;
  erpAdmin: boolean;
  public: boolean;
};

export type SuppliersPayload = {
  suppliers: OrderSupplier[];
  warehouses: OrderWarehouse[];
  defaultWarehouseId: string | null;
};

export type SupplierProductsPayload = {
  supplier: OrderSupplier | null;
  products: OrderProduct[];
  categories: OrderCategory[];
};
