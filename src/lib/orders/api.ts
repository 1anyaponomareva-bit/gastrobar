import { parseQty } from "./qty";
import type { OrderPdfInput } from "./orderPdf";
import type {
  DiscrepancyKind,
  DraftLine,
  OrderCatalogPayload,
  OrderCategory,
  OrderDraft,
  OrderHistoryEvent,
  OrderLineDetail,
  OrderLineSnapshot,
  OrderListQuery,
  OrderPhoto,
  OrderProduct,
  OrderProductPack,
  OrderReceipt,
  OrderReceiptLine,
  OrderStatus,
  OrderSupplier,
  OrderWarehouse,
  PdfResult,
  ReceiveInput,
  ReceiptDocStatus,
  SessionInfo,
  SupplierOrder,
  SupplierProductsPayload,
  SuppliersPayload,
} from "./types";

export class OrdersApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(status: number, code: string, detail?: string) {
    super(detail || code);
    this.name = "OrdersApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof OrdersApiError && error.status === 401;
}

export function isApiMissing(error: unknown): boolean {
  return error instanceof OrdersApiError && (error.status === 404 || error.status === 405 || error.code === "not_found");
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pick(obj: Json, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function optStr(value: unknown): string | null {
  const text = str(value).trim();
  return text ? text : null;
}

function num(value: unknown): number {
  return parseQty(value as string | number | null);
}

function optNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listOf<T>(data: unknown, keys: string[], map: (row: Json) => T): T[] {
  const obj = asRecord(data);
  for (const key of keys) {
    if (Array.isArray(obj[key])) return (obj[key] as unknown[]).map((row) => map(asRecord(row)));
  }
  if (Array.isArray(data)) return data.map((row) => map(asRecord(row)));
  return [];
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "AbortError";
}

/** Genuine transport failure: fetch threw TypeError, not HTTP 4xx/5xx and not abort. */
export function isOrdersNetworkError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  if (error instanceof OrdersApiError) return error.code === "network";
  if (error instanceof TypeError) return true;
  return error instanceof Error && error.name === "TypeError";
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: unknown; blob: Blob | null; contentType: string; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw new OrdersApiError(0, "aborted");
    if (error instanceof TypeError || (error instanceof Error && error.name === "TypeError")) {
      throw new OrdersApiError(0, "network", "Failed to fetch");
    }
    throw new OrdersApiError(0, "server", error instanceof Error ? error.message : undefined);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    if (!response.ok) throw new OrdersApiError(response.status, "pdf", "pdf");
    return { status: response.status, data: null, blob: await response.blob(), contentType, headers: response.headers };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = asRecord(data);
    const code = str(body.error ?? body.code, `HTTP ${response.status}`);
    const detail = optStr(body.detail ?? body.message) ?? (body.error || body.code ? undefined : `HTTP ${response.status}`);
    throw new OrdersApiError(response.status, code, detail);
  }
  return { status: response.status, data, blob: null, contentType, headers: response.headers };
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await request(path, init);
  return result.data as T;
}

export function errorMessage(error: unknown, networkText: string, genericText: string): string {
  if (isOrdersNetworkError(error)) return networkText;
  if (error instanceof OrdersApiError) {
    if (error.detail && error.detail !== "Failed to fetch") return error.detail;
    if (error.code && error.code !== "server" && error.code !== "network" && error.code !== "aborted") return error.code;
  }
  return genericText;
}

function statusOf(value: unknown): OrderStatus {
  const raw = str(value, "draft");
  if (raw === "ordered" || raw === "partial" || raw === "received" || raw === "closed" || raw === "draft") return raw;
  return "draft";
}

function receiptStatusOf(value: unknown): ReceiptDocStatus {
  const raw = str(value, "draft");
  if (raw === "posted" || raw === "cancelled" || raw === "clarify" || raw === "draft") return raw;
  if (raw === "pending" || raw === "unpublished") return "draft";
  return "draft";
}

function discrepancyOf(value: unknown): DiscrepancyKind {
  const raw = str(value, "none");
  if (raw === "short" || raw === "over" || raw === "substitute" || raw === "other" || raw === "none") return raw;
  return "none";
}

function snapshot(raw: Json): OrderLineSnapshot {
  return {
    id: optStr(pick(raw, "id", "lineId", "line_id")) ?? undefined,
    product_id: str(pick(raw, "product_id", "productId")),
    pack_id: optStr(pick(raw, "pack_id", "packId")),
    nameEn: str(pick(raw, "nameEn", "name_en")),
    nameVn: str(pick(raw, "nameVn", "name_vn")),
    brand: optStr(pick(raw, "brand")),
    packLabel: str(pick(raw, "packLabel", "pack_label", "packName", "pack_name")),
    unit: str(pick(raw, "unit")),
    qty: num(pick(raw, "qty", "orderedQty", "ordered_qty")),
    qtyBase: optNum(pick(raw, "qtyBase", "qty_base")),
    unitPrice: pick(raw, "unitPrice", "unit_price") === null ? null : optNum(pick(raw, "unitPrice", "unit_price")),
  };
}

function supplierOf(raw: Json): OrderSupplier {
  return {
    id: str(pick(raw, "id", "supplierId", "supplier_id")),
    name: str(pick(raw, "name", "label")),
    code: str(pick(raw, "code")),
    zaloUrl: optStr(pick(raw, "zaloUrl", "zalo_url")),
    productCount: num(pick(raw, "productCount", "product_count")),
    draftLineCount: num(pick(raw, "draftLineCount", "draft_line_count", "marked")),
  };
}

function warehouseOf(raw: Json): OrderWarehouse {
  return {
    id: str(pick(raw, "id")),
    name: str(pick(raw, "name")),
    kind: str(pick(raw, "kind")),
    isDefault: Boolean(pick(raw, "isDefault", "is_default")),
    address: optStr(pick(raw, "address")),
    phone: optStr(pick(raw, "phone")),
  };
}

function packOf(raw: Json): OrderProductPack {
  const packId = str(pick(raw, "pack_id", "packId", "id"));
  return {
    id: str(pick(raw, "id"), packId),
    pack_id: packId,
    label: str(pick(raw, "label", "name", "packLabel", "pack_label")),
    unit: str(pick(raw, "unit")),
    qty_base: num(pick(raw, "qty_base", "qtyBase")) || 1,
    is_default: Boolean(pick(raw, "is_default", "isDefault")),
    code: optStr(pick(raw, "code", "packCode", "pack_code")),
    supplierId: optStr(pick(raw, "supplierId", "supplier_id")),
  };
}

function productOf(raw: Json): OrderProduct {
  return {
    id: str(pick(raw, "id", "product_id", "productId")),
    nameEn: str(pick(raw, "nameEn", "name_en", "name")),
    nameVn: str(pick(raw, "nameVn", "name_vn")),
    brand: optStr(pick(raw, "brand")),
    categoryId: optStr(pick(raw, "categoryId", "category_id")),
    categoryName: optStr(pick(raw, "categoryName", "category_name", "category")),
    categoryNameVn: optStr(pick(raw, "categoryNameVn", "category_name_vn", "categoryVn", "category_vn")),
    unit: str(pick(raw, "unit", "base_unit")),
    itemNo: optStr(pick(raw, "itemNo", "item_no")),
    productCode: optStr(pick(raw, "productCode", "product_code")),
    supplierId: optStr(pick(raw, "supplierId", "supplier_id")),
    sort: num(pick(raw, "sort", "staff_sort", "staffSort")),
    hidden: Boolean(pick(raw, "hidden", "staff_hidden")),
    packs: listOf(pick(raw, "packs", "productPacks", "product_packs") ?? raw, ["packs"], packOf),
  };
}

function draftLineOf(raw: Json): DraftLine {
  const packQty = optNum(pick(raw, "packQty", "pack_qty"));
  const qty = packQty != null && packQty > 0 ? packQty : num(pick(raw, "qty"));
  return {
    product_id: str(pick(raw, "product_id", "productId")),
    pack_id: optStr(pick(raw, "pack_id", "packId")),
    qty,
  };
}

function emptyDraft(supplierId: string): OrderDraft {
  return {
    id: "",
    supplierId,
    orderNo: null,
    status: "draft",
    warehouseId: null,
    comment: null,
    expectedDelivery: null,
    revision: 0,
    placedAt: null,
    pdfUrl: null,
    pdfRevision: null,
    lines: [],
  };
}

function draftOf(raw: Json, supplierId: string): OrderDraft {
  const id = str(pick(raw, "id", "draftId", "draft_id"));
  return {
    id,
    supplierId: str(pick(raw, "supplierId", "supplier_id"), supplierId),
    orderNo: optStr(pick(raw, "orderNo", "order_no", "docNo", "doc_no")) ?? (id || null),
    status: statusOf(pick(raw, "status")),
    warehouseId: optStr(pick(raw, "warehouseId", "warehouse_id")),
    comment: optStr(pick(raw, "comment")),
    expectedDelivery: optStr(pick(raw, "expectedDelivery", "expected_delivery")),
    revision: num(pick(raw, "revision")) || 0,
    placedAt: optStr(pick(raw, "placedAt", "placed_at")),
    pdfUrl: optStr(pick(raw, "pdfUrl", "pdf_url")),
    pdfRevision: optNum(pick(raw, "pdfRevision", "pdf_revision", "lastPdfRevision", "last_pdf_revision")),
    lines: listOf(pick(raw, "lines", "draft") ?? raw, ["lines"], draftLineOf).filter((line) => line.product_id && line.qty > 0),
  };
}

function lineDetailOf(raw: Json): OrderLineDetail {
  const base = snapshot(raw);
  const ordered = num(pick(raw, "orderedQty", "ordered_qty", "qty"));
  return {
    ...base,
    orderedQty: ordered,
    qty: ordered,
    acceptedQty: num(pick(raw, "acceptedQty", "accepted_qty", "receivedQty", "received_qty")),
    postedQty: num(pick(raw, "postedQty", "posted_qty", "stockQty", "stock_qty")),
    // Open-to-receive (ordered − accepted − closed). Table «Осталось» uses displayRemainingQty, not this.
    remainingQty: optNum(pick(raw, "remainingQty", "remaining_qty")) ?? Math.max(0, ordered - num(pick(raw, "acceptedQty", "accepted_qty"))),
  };
}

function receiptLineOf(raw: Json): OrderReceiptLine {
  const snap = snapshot(raw);
  return {
    orderLineId: optStr(pick(raw, "orderLineId", "order_line_id")),
    product_id: snap.product_id,
    nameEn: snap.nameEn,
    nameVn: snap.nameVn,
    packLabel: snap.packLabel,
    unit: snap.unit,
    orderedQty: num(pick(raw, "orderedQty", "ordered_qty", "qty")),
    actualQty: num(pick(raw, "actualQty", "actual_qty", "receivedQty", "received_qty", "qty")),
    discrepancyKind: discrepancyOf(pick(raw, "discrepancyKind", "discrepancy_kind", "discrepancy")),
    discrepancyNote: optStr(pick(raw, "discrepancyNote", "discrepancy_note", "note")),
  };
}

function photoOf(raw: Json): OrderPhoto {
  return {
    id: optStr(pick(raw, "id")) ?? undefined,
    url: optStr(pick(raw, "url", "href")) ?? undefined,
    fileName: str(pick(raw, "fileName", "file_name", "name"), "photo.jpg"),
    mimeType: str(pick(raw, "mimeType", "mime_type", "type"), "image/jpeg"),
    dataUrl: optStr(pick(raw, "dataUrl", "data_url", "data")) ?? undefined,
  };
}

function receiptOf(raw: Json): OrderReceipt {
  const document = asRecord(pick(raw, "document") ?? raw);
  return {
    id: str(pick(raw, "id", "documentId", "document_id") ?? pick(document, "id")),
    docNo: str(pick(raw, "docNo", "doc_no") ?? pick(document, "doc_no", "docNo")),
    status: receiptStatusOf(pick(raw, "status", "receiptStatus") ?? pick(document, "status")),
    createdAt: optStr(pick(raw, "createdAt", "created_at") ?? pick(document, "created_at")),
    createdBy: optStr(pick(raw, "createdBy", "created_by") ?? pick(document, "created_by")),
    comment: optStr(pick(raw, "comment") ?? pick(document, "comment")),
    clarifyReason: optStr(pick(raw, "clarifyReason", "clarify_reason", "returnReason", "return_reason")),
    lines: listOf(pick(raw, "lines", "actuals") ?? pick(document, "lines"), ["lines"], receiptLineOf),
    photos: listOf(pick(raw, "photos"), ["photos"], photoOf),
  };
}

function historyOf(raw: Json): OrderHistoryEvent {
  return {
    at: str(pick(raw, "at", "createdAt", "created_at")),
    by: optStr(pick(raw, "by", "createdBy", "created_by")),
    type: str(pick(raw, "type", "action"), "event"),
    text: str(pick(raw, "text", "message", "comment")),
  };
}

function orderOf(raw: Json): SupplierOrder {
  const nested = asRecord(pick(raw, "order"));
  const src = nested.id ? nested : raw;
  return {
    id: str(pick(src, "id")),
    docNo: str(pick(src, "docNo", "doc_no", "orderNo", "order_no")),
    status: statusOf(pick(src, "status")),
    supplierId: str(pick(src, "supplierId", "supplier_id")),
    supplierName: str(pick(src, "supplierName", "supplier_name", "supplier")),
    warehouseId: optStr(pick(src, "warehouseId", "warehouse_id")),
    warehouseName: optStr(pick(src, "warehouseName", "warehouse_name")),
    createdAt: optStr(pick(src, "createdAt", "created_at")),
    createdBy: optStr(pick(src, "createdBy", "created_by")),
    placedAt: optStr(pick(src, "placedAt", "placed_at")),
    placedBy: optStr(pick(src, "placedBy", "placed_by")),
    receivedAt: optStr(pick(src, "receivedAt", "received_at")),
    receivedBy: optStr(pick(src, "receivedBy", "received_by")),
    expectedDelivery: optStr(pick(src, "expectedDelivery", "expected_delivery")),
    comment: optStr(pick(src, "comment")),
    revision: num(pick(src, "revision")) || 0,
    pdfUrl: optStr(pick(src, "pdfUrl", "pdf_url")),
    clarifyReason: optStr(pick(src, "clarifyReason", "clarify_reason")),
    lines: listOf(pick(src, "lines"), ["lines"], lineDetailOf),
    receipts: listOf(pick(src, "receipts"), ["receipts"], receiptOf),
    history: listOf(pick(src, "history", "events"), ["history", "events"], historyOf),
  };
}

function queryString(query?: OrderListQuery): string {
  const params = new URLSearchParams();
  if (query?.supplierId) params.set("supplierId", query.supplierId);
  if (query?.status) params.set("status", query.status);
  if (query?.q) params.set("q", query.q);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function getSession(): Promise<SessionInfo> {
  try {
    const data = asRecord(await json("/api/orders/session"));
    const email = optStr(pick(data, "email")) ?? "kitchen@gastrofood";
    return {
      email,
      erpAdmin: Boolean(pick(data, "erpAdmin", "erp_admin")),
      public: pick(data, "public") === undefined ? !pick(data, "erpAdmin", "erp_admin") : Boolean(pick(data, "public")),
    };
  } catch (error) {
    if (isApiMissing(error)) {
      return { email: "kitchen@gastrofood", erpAdmin: false, public: true };
    }
    if (isAuthError(error)) {
      return { email: "kitchen@gastrofood", erpAdmin: false, public: true };
    }
    throw error;
  }
}

export async function login(email: string, password: string, invite?: string): Promise<SessionInfo> {
  try {
    const data = asRecord(
      await json("/api/orders/session", {
        method: "POST",
        body: JSON.stringify({ email, password, invite: invite?.trim() || undefined }),
      }),
    );
    return { email: str(data.email, email), erpAdmin: Boolean(data.erpAdmin), public: false };
  } catch (error) {
    if (isApiMissing(error)) {
      try {
        const data = asRecord(await json("/api/recipes-admin/login", { method: "POST", body: JSON.stringify({ email, password }) }));
        return { email: str(data.email, email), erpAdmin: true, public: false };
      } catch (inner) {
        if (isApiMissing(inner)) throw new OrdersApiError(404, "login_api_missing");
        throw inner;
      }
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await request("/api/orders/session", { method: "DELETE" }).catch(() => null);
  await request("/api/recipes-admin/logout", { method: "POST" }).catch(() => null);
}

export async function getSuppliers(): Promise<SuppliersPayload> {
  const data = await json("/api/orders/suppliers");
  const obj = asRecord(data);
  const suppliers = listOf(data, ["suppliers"], supplierOf).filter((row) => row.id);
  const warehouses = listOf(pick(obj, "warehouses") ?? data, ["warehouses"], warehouseOf);
  const defaultWarehouseId =
    optStr(pick(obj, "defaultWarehouseId", "default_warehouse_id")) ?? warehouses.find((row) => row.isDefault)?.id ?? warehouses[0]?.id ?? null;
  return { suppliers, warehouses, defaultWarehouseId };
}

function catalogOf(data: unknown): OrderCatalogPayload {
  const obj = asRecord(data);
  const suppliers = listOf(pick(obj, "suppliers") ?? data, ["suppliers"], supplierOf).filter((row) => row.id);
  const products = listOf(pick(obj, "products") ?? data, ["products"], productOf).filter((row) => row.id);
  const warehouses = listOf(pick(obj, "warehouses") ?? data, ["warehouses"], warehouseOf);
  const defaultWarehouseId =
    optStr(pick(obj, "defaultWarehouseId", "default_warehouse_id")) ?? warehouses.find((row) => row.isDefault)?.id ?? warehouses[0]?.id ?? null;
  return { products, suppliers, warehouses, defaultWarehouseId };
}

export async function getOrderCatalog(): Promise<OrderCatalogPayload> {
  try {
    return catalogOf(await json("/api/orders/catalog"));
  } catch (error) {
    if (!isApiMissing(error)) throw error;
    const listed = await getSuppliers();
    return { products: [], ...listed };
  }
}

export async function getAdminCatalog(): Promise<OrderCatalogPayload> {
  return catalogOf(await json("/api/orders/admin/catalog"));
}

export async function reorderAdminProducts(ids: string[]): Promise<OrderProduct[]> {
  const data = await json("/api/orders/admin/reorder", { method: "PUT", body: JSON.stringify({ products: ids }) });
  return listOf(asRecord(data), ["products"], productOf).filter((row) => row.id);
}

export async function reorderAdminSuppliers(ids: string[]): Promise<OrderSupplier[]> {
  const data = await json("/api/orders/admin/reorder", { method: "PUT", body: JSON.stringify({ suppliers: ids }) });
  return listOf(asRecord(data), ["suppliers"], supplierOf).filter((row) => row.id);
}

export async function saveAdminProduct(product: Record<string, unknown>): Promise<{ id: string; products: OrderProduct[] }> {
  const data = asRecord(await json("/api/orders/admin/product", { method: "PUT", body: JSON.stringify({ product }) }));
  return {
    id: str(data.id),
    products: listOf(data, ["products"], productOf).filter((row) => row.id),
  };
}

export async function saveAdminSupplier(value: Record<string, unknown>): Promise<{ id: string }> {
  const data = asRecord(await json("/api/orders/admin/supplier", { method: "PUT", body: JSON.stringify({ supplier: value }) }));
  return { id: str(data.id) };
}

export async function archiveAdmin(entity: "product" | "supplier", id: string, archived: boolean): Promise<void> {
  await json("/api/orders/admin/archive", {
    method: "POST",
    body: JSON.stringify({ entity, id, archived }),
  });
}

export async function getSupplierProducts(supplierId: string): Promise<SupplierProductsPayload> {
  const data = await json(`/api/orders/suppliers/${encodeURIComponent(supplierId)}/products`);
  const obj = asRecord(data);
  const products = listOf(data, ["products", "items"], productOf).filter((row) => row.id);
  const categoriesMap = new Map<string, OrderCategory>();
  for (const product of products) {
    if (product.categoryId) categoriesMap.set(product.categoryId, { id: product.categoryId, name: product.categoryName ?? product.categoryId });
  }
  for (const category of listOf(pick(obj, "categories") ?? data, ["categories"], (raw) => ({ id: str(raw.id), name: str(raw.name ?? raw.label, str(raw.id)) }))) {
    if (category.id) categoriesMap.set(category.id, category);
  }
  return {
    supplier: obj.supplier ? supplierOf(asRecord(obj.supplier)) : null,
    products,
    categories: [...categoriesMap.values()],
  };
}

export async function getDraft(supplierId: string): Promise<OrderDraft> {
  try {
    const data = await json(`/api/orders/drafts/${encodeURIComponent(supplierId)}`);
    const obj = asRecord(data);
    return draftOf(asRecord(pick(obj, "draft") ?? data), supplierId);
  } catch (error) {
    if (error instanceof OrdersApiError && error.status === 404) return emptyDraft(supplierId);
    throw error;
  }
}

/** POST is the public /orders write; PUT stays accepted for older clients. */
export const DRAFT_SAVE_METHOD = "POST";

export async function saveDraft(
  supplierId: string,
  draft: Pick<OrderDraft, "warehouseId" | "comment" | "expectedDelivery" | "lines">,
): Promise<OrderDraft> {
  const data = await json(`/api/orders/drafts/${encodeURIComponent(supplierId)}`, {
    method: DRAFT_SAVE_METHOD,
    body: JSON.stringify({
      warehouseId: draft.warehouseId,
      warehouse_id: draft.warehouseId,
      comment: draft.comment,
      expectedDelivery: draft.expectedDelivery,
      expected_delivery: draft.expectedDelivery,
      lines: draft.lines.map((line) => ({
        product_id: line.product_id,
        pack_id: line.pack_id,
        qty: line.qty,
        packQty: line.qty,
        pack_qty: line.qty,
      })),
    }),
  });
  const obj = asRecord(data);
  return draftOf(asRecord(pick(obj, "draft") ?? data), supplierId);
}

/** Freeze the current draft snapshot. Does not place and does not return a file. */
export async function freezeDraftPdf(supplierId: string): Promise<void> {
  await request(`/api/orders/drafts/${encodeURIComponent(supplierId)}/pdf`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function buildDraftPdf(orderId: string, fallback?: OrderPdfInput): Promise<PdfResult> {
  const result = await request(`/api/orders/${encodeURIComponent(orderId)}/pdf`, { method: "POST", body: JSON.stringify({}) });
  if (result.blob) {
    return {
      pdfUrl: URL.createObjectURL(result.blob),
      revision: Number(result.headers.get("x-order-revision")) || fallback?.revision || 0,
      blob: result.blob,
    };
  }
  const obj = asRecord(result.data);
  const pdfUrl = optStr(pick(obj, "pdfUrl", "pdf_url"));
  const revision = num(pick(obj, "revision")) || fallback?.revision || 0;
  if (pdfUrl) {
    const file = await fetch(pdfUrl, { credentials: "same-origin", cache: "no-store" });
    if (!file.ok) throw new OrdersApiError(file.status, "pdf");
    return { pdfUrl, revision, blob: await file.blob() };
  }
  throw new OrdersApiError(422, "pdf", "PDF_MODULE_UNAVAILABLE");
}

export async function placeOrder(id: string, extra?: { comment?: string | null; expectedDelivery?: string | null }): Promise<SupplierOrder> {
  const data = await json(`/api/orders/${encodeURIComponent(id)}/place`, {
    method: "POST",
    body: JSON.stringify({
      comment: extra?.comment ?? null,
      expectedDelivery: extra?.expectedDelivery ?? null,
      expected_delivery: extra?.expectedDelivery ?? null,
    }),
  });
  return orderOf(asRecord(data));
}

export async function listOrders(query?: OrderListQuery): Promise<SupplierOrder[]> {
  const data = await json(`/api/orders${queryString(query)}`);
  return listOf(data, ["orders", "items"], orderOf).filter((row) => row.id);
}

export async function getOrder(id: string): Promise<SupplierOrder> {
  const data = await json(`/api/orders/${encodeURIComponent(id)}`);
  return orderOf(asRecord(data));
}

export async function receiveOrder(id: string, input: ReceiveInput): Promise<SupplierOrder> {
  const data = await json(`/api/orders/${encodeURIComponent(id)}/receive`, {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      idempotency_key: input.idempotencyKey,
      comment: input.comment,
      photos: input.photos.map((photo) => ({
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        dataUrl: photo.dataUrl,
        name: photo.fileName,
        type: photo.mimeType,
        data: photo.dataUrl,
      })),
      lines: input.lines.map((line) => ({
        orderLineId: line.orderLineId,
        order_line_id: line.orderLineId,
        product_id: line.product_id,
        pack_id: line.pack_id,
        actualQty: line.actualQty,
        actual_qty: line.actualQty,
        qty: line.actualQty,
        discrepancyKind: line.discrepancyKind,
        discrepancy_kind: line.discrepancyKind,
        discrepancyNote: line.discrepancyNote,
        discrepancy_note: line.discrepancyNote,
      })),
    }),
  });
  return orderOf(asRecord(data));
}

export async function listPurchasingOrders(query?: OrderListQuery): Promise<SupplierOrder[]> {
  const data = await json(`/api/erp/purchasing/orders${queryString(query)}`);
  return listOf(data, ["orders", "items"], orderOf).filter((row) => row.id);
}

export async function getPurchasingOrder(id: string): Promise<SupplierOrder> {
  const data = await json(`/api/erp/purchasing/orders/${encodeURIComponent(id)}`);
  return orderOf(asRecord(data));
}

export async function getPurchasingReceipt(id: string): Promise<{ receipt: OrderReceipt; order: SupplierOrder | null }> {
  const data = await json(`/api/erp/purchasing/receipts/${encodeURIComponent(id)}`);
  const obj = asRecord(data);
  return {
    receipt: receiptOf(asRecord(pick(obj, "receipt", "document") ?? data)),
    order: pick(obj, "order") ? orderOf(asRecord(pick(obj, "order"))) : null,
  };
}

export async function returnReceiptToClarify(id: string, reason: string): Promise<OrderReceipt> {
  const data = await json(`/api/erp/purchasing/receipts/${encodeURIComponent(id)}/return-to-clarify`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return receiptOf(asRecord(pick(asRecord(data), "receipt") ?? data));
}

export async function closePurchasingOrder(id: string, reason: string): Promise<SupplierOrder> {
  const data = await json(`/api/erp/purchasing/orders/${encodeURIComponent(id)}/close`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return orderOf(asRecord(data));
}

/** Posts the unpublished ERP receipt. Prefers documents/:id/post, then the existing action API. */
export async function postErpDocument(id: string): Promise<{ ok: true }> {
  try {
    await json(`/api/erp/purchasing/documents/${encodeURIComponent(id)}/post`, { method: "POST", body: JSON.stringify({}) });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof OrdersApiError) || (error.status !== 404 && error.status !== 405)) throw error;
    try {
      await json(`/api/erp/documents/${encodeURIComponent(id)}/post`, { method: "POST", body: JSON.stringify({}) });
      return { ok: true };
    } catch (inner) {
      if (inner instanceof OrdersApiError && (inner.status === 404 || inner.status === 405)) {
        await json("/api/erp/action", { method: "POST", body: JSON.stringify({ action: "postDocument", id }) });
        return { ok: true };
      }
      throw inner;
    }
  }
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type { OrderPdfInput };
