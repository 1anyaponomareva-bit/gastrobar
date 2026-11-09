import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { readAdmins, readOrderStaff } from "@/lib/recipes-admin/storage";
import {
  ErpHttpError,
  LOCAL_DEV_ADMIN,
  requireAdmin,
  rpc,
  ServerTiming,
  erpDb,
  check,
} from "@/lib/erp/server";
import { erpLocalMode } from "@/lib/erp/localDb";
import { initialWarehouses } from "@/lib/erp/docDefaults";
import {
  getOrderPdfFileName,
  makeOrderPdfBlob,
  orderPdfPrintWarehouse,
  setOrderPdfFonts,
  type OrderPdfInput,
} from "@/lib/orders/orderPdf";
import { orderPackUnit } from "@/lib/orders/orderList";
import { resolvePublicOrdersActor, type OrdersAccess } from "@/lib/orders/access";
import { normalizePersonName } from "@/lib/orders/person";

if (typeof window !== "undefined") throw new Error("erp/supplierOrders is server-only");

export const ORDERS_COOKIE = "gf_orders";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrdersActor = OrdersAccess;

/** /orders access never implies ERP admin. Posting stock requires a separate admin session. */
export function ordersAccessIsErpAdmin(erpAdmin: boolean): boolean {
  return erpAdmin === true;
}

export function canPostOrderReceipt(actor: Pick<OrdersActor, "erpAdmin">): boolean {
  return actor.erpAdmin === true;
}

export function defaultOrderWarehouseId(
  warehouses: Array<{ id: string; kind: string; archived_at?: string | null }>,
  saved: string | null,
): string | null {
  return initialWarehouses("receipt", warehouses, saved).warehouse_id;
}

function ordersSecret(): string {
  const secret = process.env.ORDERS_SESSION_SECRET?.trim() || process.env.RECIPES_ADMIN_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("ORDERS_SESSION_SECRET is not configured");
  return secret;
}

function signOrders(payload: string): string {
  return createHmac("sha256", ordersSecret()).update(payload).digest("base64url");
}

export function createOrdersSessionToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: Date.now() + 30 * 86_400_000 })).toString(
    "base64url",
  );
  return `${payload}.${signOrders(payload)}`;
}

export const ordersCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86_400,
};

function parseOrdersToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(signOrders(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; x: number };
    if (typeof e !== "string" || typeof x !== "number" || x < Date.now()) return null;
    return e.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function headerActor(request: Request | undefined): string | null {
  if (!request || process.env.VERCEL) return null;
  const email = request.headers.get("x-orders-actor")?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

export async function resolveOrdersActor(request?: Request): Promise<OrdersActor> {
  if (erpLocalMode()) {
    const header = headerActor(request);
    if (header) return resolvePublicOrdersActor(header === LOCAL_DEV_ADMIN ? header : null, header);
    return { email: LOCAL_DEV_ADMIN, erpAdmin: true, public: false };
  }
  const header = headerActor(request);
  const token = (await cookies()).get(ORDERS_COOKIE)?.value;
  const ordersEmail = header || parseOrdersToken(token);
  const adminEmail = await getSessionEmail();
  return resolvePublicOrdersActor(adminEmail, ordersEmail);
}

export async function requireOrdersActor(request?: Request): Promise<OrdersActor> {
  return resolveOrdersActor(request);
}

export async function requirePurchasingAdmin(): Promise<string> {
  return requireAdmin();
}

export async function withOrdersActor(
  request: Request,
  work: (timing: ServerTiming, actor: OrdersActor) => Promise<unknown>,
) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", () => requireOrdersActor(request));
    return timing.json(await work(timing, actor));
  } catch (error) {
    return timing.error(error);
  }
}

export async function withPurchasingAdmin(
  _request: Request,
  work: (timing: ServerTiming, email: string) => Promise<unknown>,
) {
  const timing = new ServerTiming();
  try {
    const email = await timing.time("auth", () => requirePurchasingAdmin());
    return timing.json(await work(timing, email));
  } catch (error) {
    return timing.error(error);
  }
}

function mapOrderError(error: unknown): never {
  if (error instanceof ErpHttpError) {
    if (error.code === "ERP_FORBIDDEN" || error.code === "auth") {
      throw new ErpHttpError(error.code === "auth" ? 401 : 403, error.code, error.detail);
    }
    if (error.code === "ERP_NOT_FOUND") throw new ErpHttpError(404, error.code, error.detail);
  }
  throw error;
}

async function orderRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(fn, args);
  } catch (error) {
    mapOrderError(error);
  }
}

function uuid(value: string, label = "id"): string {
  if (!UUID.test(value)) throw new ErpHttpError(400, "ERP_INVALID", label);
  return value;
}

export async function listOrderSuppliers() {
  const [suppliers, warehouseRows] = await Promise.all([
    orderRpc<unknown>("erp_order_list_suppliers", {}),
    check(
      await erpDb()
        .from("erp_warehouses")
        .select("id, name, kind, archived_at, address, phone")
        .is("archived_at", null)
        .order("sort"),
    ),
  ]);
  const warehouses = (Array.isArray(warehouseRows) ? warehouseRows : []) as Array<{
    id: string;
    name: string;
    kind: string;
    archived_at?: string | null;
    address?: string | null;
    phone?: string | null;
  }>;
  const defaultWarehouseId = defaultOrderWarehouseId(warehouses, null);
  return {
    suppliers,
    warehouses: warehouses.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      address: row.address ?? null,
      phone: row.phone ?? null,
      isDefault: row.id === defaultWarehouseId,
    })),
    defaultWarehouseId,
  };
}

export async function rememberOrderUser(email: string, displayName?: string | null) {
  const value = email.trim().toLowerCase();
  if (!value.includes("@") || erpLocalMode()) return;
  try {
    const row: Record<string, unknown> = { email: value, active: true };
    const name = normalizePersonName(displayName);
    if (name) row.display_name = name;
    await erpDb().from("erp_order_users").upsert(row, { onConflict: "email" });
  } catch (error) {
    console.error("[orders] remember user", error);
  }
}

const ACTOR_EMAIL_KEYS = new Set([
  "author",
  "by",
  "createdBy",
  "created_by",
  "placedBy",
  "placed_by",
  "postedBy",
  "posted_by",
  "receivedBy",
  "received_by",
]);

function collectActorEmails(value: unknown, into: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectActorEmails(item, into);
    return;
  }
  const rec = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(rec)) {
    if (ACTOR_EMAIL_KEYS.has(key) && typeof item === "string" && item.includes("@")) {
      into.add(item.trim().toLowerCase());
    } else if (item && typeof item === "object") {
      collectActorEmails(item, into);
    }
  }
}

async function lookupDisplayNames(emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!emails.length) return map;
  try {
    const rows = check(await erpDb().from("erp_order_users").select("email, display_name").in("email", emails)) as
      | Array<{ email?: string; display_name?: string | null }>
      | null;
    for (const row of rows ?? []) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      const name = normalizePersonName(row.display_name);
      if (email && name) map.set(email, name);
    }
  } catch (error) {
    console.error("[orders] lookup names", error);
  }
  const missing = emails.filter((email) => !map.has(email));
  if (!missing.length || erpLocalMode()) return map;
  try {
    const [admins, staff] = await Promise.all([readAdmins(), readOrderStaff()]);
    const accounts = [...admins, ...staff];
    for (const email of missing) {
      const account = accounts.find((row) => row.email === email);
      const name = normalizePersonName(account?.name);
      if (name) map.set(email, name);
    }
  } catch (error) {
    console.error("[orders] lookup account names", error);
  }
  return map;
}

function applyDisplayNames(value: unknown, names: Map<string, string>): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => applyDisplayNames(item, names));
  const rec = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(rec)) {
    next[key] = item && typeof item === "object" ? applyDisplayNames(item, names) : item;
  }
  const setName = (emailKey: string, nameKey: string) => {
    const email = typeof rec[emailKey] === "string" ? rec[emailKey].trim().toLowerCase() : "";
    if (email && names.has(email)) next[nameKey] = names.get(email);
  };
  setName("placedBy", "placedByName");
  setName("placed_by", "placedByName");
  setName("receivedBy", "receivedByName");
  setName("received_by", "receivedByName");
  setName("createdBy", "createdByName");
  setName("created_by", "createdByName");
  setName("author", "createdByName");
  setName("postedBy", "postedByName");
  setName("posted_by", "postedByName");
  setName("by", "byName");
  return next;
}

async function withActorNames<T>(payload: T): Promise<T> {
  const emails = new Set<string>();
  collectActorEmails(payload, emails);
  if (!emails.size) return payload;
  const names = await lookupDisplayNames([...emails]);
  if (!names.size) return payload;
  return applyDisplayNames(payload, names) as T;
}

function collectOrderSupplierIds(value: unknown, into: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectOrderSupplierIds(item, into);
    return;
  }
  const rec = value as Record<string, unknown>;
  const supplierId = rec.supplierId ?? rec.supplier_id;
  if (typeof supplierId === "string" && UUID.test(supplierId) && typeof rec.status === "string") {
    into.add(supplierId);
  }
  for (const item of Object.values(rec)) {
    if (item && typeof item === "object") collectOrderSupplierIds(item, into);
  }
}

function applySupplierZalo(value: unknown, urls: Map<string, string | null>): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => applySupplierZalo(item, urls));
  const rec = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(rec)) {
    next[key] = item && typeof item === "object" ? applySupplierZalo(item, urls) : item;
  }
  const supplierId =
    typeof rec.supplierId === "string" ? rec.supplierId : typeof rec.supplier_id === "string" ? rec.supplier_id : "";
  if (supplierId && urls.has(supplierId) && typeof rec.status === "string") {
    next.zaloUrl = urls.get(supplierId) ?? null;
  }
  return next;
}

async function withSupplierZalo<T>(payload: T): Promise<T> {
  const ids = new Set<string>();
  collectOrderSupplierIds(payload, ids);
  if (!ids.size) return payload;
  try {
    const rows = check(await erpDb().from("erp_suppliers").select("id, zalo_url").in("id", [...ids])) as
      | Array<{ id?: string; zalo_url?: string | null }>
      | null;
    const urls = new Map<string, string | null>();
    for (const row of rows ?? []) {
      if (typeof row.id === "string") urls.set(row.id, typeof row.zalo_url === "string" ? row.zalo_url.trim() || null : null);
    }
    if (!urls.size) return payload;
    return applySupplierZalo(payload, urls) as T;
  } catch (error) {
    console.error("[orders] lookup zalo", error);
    return payload;
  }
}

async function withOrderPayload<T>(payload: T): Promise<T> {
  return withSupplierZalo(await withActorNames(payload));
}

export async function listSupplierProducts(supplierId: string) {
  return { products: await orderRpc<unknown>("erp_order_supplier_products", { p_supplier: uuid(supplierId, "supplier") }) };
}

export async function listOrderCatalog(includeHidden = false) {
  const [products, listed] = await Promise.all([
    orderRpc<unknown>("erp_order_catalog_products", { p_include_hidden: includeHidden }),
    listOrderSuppliers(),
  ]);
  return { products, ...listed };
}

export async function reorderOrderProducts(ids: string[]) {
  return {
    products: await orderRpc<unknown>("erp_order_reorder_products", {
      p_ids: ids.map((id) => uuid(id, "product")),
    }),
  };
}

export async function reorderOrderSuppliers(ids: string[]) {
  return {
    suppliers: await orderRpc<unknown>("erp_order_reorder_suppliers", {
      p_ids: ids.map((id) => uuid(id, "supplier")),
    }),
  };
}

export async function saveOrderAdminProduct(product: Record<string, unknown>, actor: string) {
  const id = await rpc<string>("erp_save_product", { p: product, p_actor: actor });
  return { id, products: await orderRpc<unknown>("erp_order_catalog_products", { p_include_hidden: true }) };
}

export async function saveOrderAdminSupplier(value: Record<string, unknown>, actor: string) {
  const id = await rpc<string>("erp_save_ref", { p_entity: "supplier", p: value, p_actor: actor });
  return { id, suppliers: await listOrderSuppliers() };
}

export async function archiveOrderAdmin(entity: "product" | "supplier", id: string, archived: boolean, actor: string) {
  await rpc("erp_set_archived", { p_entity: entity, p_id: uuid(id, entity), p_archived: archived, p_actor: actor });
  return listOrderCatalog(true);
}

export async function getDraft(supplierId: string, actor: string) {
  return orderRpc<unknown>("erp_order_get_draft", { p_supplier: uuid(supplierId, "supplier"), p_actor: actor });
}

export async function saveDraft(supplierId: string, doc: Record<string, unknown>, actor: string) {
  return orderRpc<unknown>("erp_order_save_draft", {
    p_supplier: uuid(supplierId, "supplier"),
    p_doc: doc,
    p_actor: actor,
  });
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(bytes);
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
}

let orderPdfFontsReady = false;

export function ensureOrderPdfFonts() {
  if (orderPdfFontsReady) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  setOrderPdfFonts({
    regular: toArrayBuffer(readFileSync(path.join(dir, "NotoSans-Regular.ttf"))),
    bold: toArrayBuffer(readFileSync(path.join(dir, "NotoSans-Bold.ttf"))),
  });
  orderPdfFontsReady = true;
}

export function asOrderPdfInput(value: unknown): OrderPdfInput {
  const row = jsonObject(value, "snapshot");
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const kind = row.kind === "pre" || row.kind === "final" ? row.kind : undefined;
  const warehouse = orderPdfPrintWarehouse({
    kind,
    warehouseName: row.warehouseName == null ? undefined : String(row.warehouseName),
    warehouseAddress: row.warehouseAddress == null ? undefined : String(row.warehouseAddress),
    warehousePhone: row.warehousePhone == null ? undefined : String(row.warehousePhone),
  });
  return {
    orderNo: String(row.orderNo ?? ""),
    revision: Number(row.revision) || 0,
    orderedAt: String(row.orderedAt ?? ""),
    supplierName: String(row.supplierName ?? ""),
    warehouseName: warehouse.warehouseName,
    warehouseAddress: warehouse.warehouseAddress,
    warehousePhone: warehouse.warehousePhone,
    kind,
    comment: row.comment == null ? undefined : String(row.comment),
    lines: lines.map((line) => {
      const item = jsonObject(line, "line");
      const packLabel = String(item.packLabel ?? "");
      const fallbackUnit = String(item.unit ?? "");
      return {
        nameEn: String(item.nameEn ?? ""),
        nameVn: String(item.nameVn ?? ""),
        brand: String(item.brand ?? ""),
        packLabel,
        packCode: item.packCode == null ? undefined : String(item.packCode),
        unit: orderPackUnit({ label: packLabel, unit: fallbackUnit }, fallbackUnit),
        qty: Number(item.qty) || 0,
      };
    }),
  };
}

export async function renderOrderPdf(snapshot: OrderPdfInput): Promise<{ bytes: Uint8Array; fileName: string }> {
  ensureOrderPdfFonts();
  const blob = await makeOrderPdfBlob(snapshot);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), fileName: getOrderPdfFileName(snapshot) };
}

export async function bumpPdfRevision(id: string, actor: string) {
  const meta = await orderRpc<Record<string, unknown>>("erp_order_pdf_revision", {
    p_id: uuid(id),
    p_actor: actor,
  });
  const snapshot = asOrderPdfInput(meta.snapshot ?? meta);
  const fileName = getOrderPdfFileName(snapshot);
  const orderId = String(meta.id ?? id);
  return {
    ...meta,
    id: orderId,
    snapshot,
    fileName,
    pdfUrl: typeof meta.pdfUrl === "string" ? meta.pdfUrl : `/api/orders/${orderId}/pdf?rev=${snapshot.revision}`,
    revision: snapshot.revision,
  };
}

export async function getOrderPdfSnapshot(id: string, actor: string, admin: boolean) {
  await getOrder(id, actor, admin);
  return asOrderPdfInput(await orderRpc<unknown>("erp_order_pdf_input", { p_id: uuid(id) }));
}

export async function placeOrder(id: string, actor: string) {
  return withOrderPayload(await orderRpc<unknown>("erp_order_place", { p_id: uuid(id), p_actor: actor }));
}

export async function listOrders(actor: string, admin: boolean, status?: string | null) {
  return {
    orders: await withOrderPayload(
      await orderRpc<unknown>("erp_order_list", {
        p_actor: actor,
        p_admin: admin,
        p_status: status || null,
      }),
    ),
  };
}

export async function getOrder(id: string, actor: string, admin: boolean) {
  return withOrderPayload(await orderRpc<unknown>("erp_order_get", { p_id: uuid(id), p_actor: actor, p_admin: admin }));
}

/** TEMPORARY: flags the order received. Does not create a поставка or move stock. */
export async function receiveOrder(id: string, payload: Record<string, unknown>, actor: string) {
  return withOrderPayload(await orderRpc<unknown>("erp_order_receive", { p_id: uuid(id), p_payload: payload, p_actor: actor }));
}

export async function closeOrderRemainder(id: string, reason: string, actor: string, lines?: unknown, admin = false) {
  return withOrderPayload(
    await orderRpc<unknown>("erp_order_close_remainder", {
      p_id: uuid(id),
      p_reason: reason,
      p_actor: actor,
      p_lines: lines ?? null,
      p_admin: admin,
    }),
  );
}

export async function getPurchasingReceipt(documentId: string, email: string) {
  const id = uuid(documentId);
  const doc = check(
    await erpDb()
      .from("erp_documents")
      .select("id, source_order_id, status, doc_no, doc_type")
      .eq("id", id)
      .maybeSingle(),
  ) as { id: string; source_order_id: string | null; status: string; doc_no: string; doc_type: string } | null;
  if (!doc) throw new ErpHttpError(404, "ERP_NOT_FOUND", "receipt");
  const order = doc.source_order_id ? await getOrder(String(doc.source_order_id), email, true) : null;
  return { receipt: doc, order };
}

export async function returnReceiptToClarify(documentId: string, reason: string, actor: string) {
  return orderRpc<unknown>("erp_order_return_to_clarify", {
    p_document: uuid(documentId),
    p_reason: reason,
    p_actor: actor,
    p_admin: true,
  });
}

export async function adminPostOrderReceipt(documentId: string, actor: string) {
  return orderRpc<unknown>("erp_order_admin_post", {
    p_id: uuid(documentId),
    p_actor: actor,
    p_admin: true,
  });
}

export async function grantOrderAccess(owner: string, grantee: string) {
  return orderRpc<null>("erp_order_grant", { p_owner: owner, p_grantee: grantee });
}

export function jsonObject(value: unknown, label = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ErpHttpError(400, "ERP_INVALID", label);
  return value as Record<string, unknown>;
}

export { ServerTiming, ErpHttpError, check, erpDb };
