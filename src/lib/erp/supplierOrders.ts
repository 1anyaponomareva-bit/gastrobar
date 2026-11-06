import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
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
  setOrderPdfFonts,
  type OrderPdfInput,
} from "@/lib/orders/orderPdf";

if (typeof window !== "undefined") throw new Error("erp/supplierOrders is server-only");

export const ORDERS_COOKIE = "gf_orders";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrdersActor = { email: string; erpAdmin: boolean };

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
    const email = headerActor(request) || LOCAL_DEV_ADMIN;
    return { email, erpAdmin: email === LOCAL_DEV_ADMIN };
  }
  const header = headerActor(request);
  const token = (await cookies()).get(ORDERS_COOKIE)?.value;
  const ordersEmail = header || parseOrdersToken(token);
  const adminEmail = await getSessionEmail();
  if (adminEmail && (!ordersEmail || ordersEmail === adminEmail)) {
    return { email: adminEmail, erpAdmin: true };
  }
  if (ordersEmail) return { email: ordersEmail, erpAdmin: adminEmail === ordersEmail };
  throw new ErpHttpError(401, "auth");
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
        .select("id, name, kind, archived_at")
        .is("archived_at", null)
        .order("sort"),
    ),
  ]);
  const warehouses = (Array.isArray(warehouseRows) ? warehouseRows : []) as Array<{
    id: string;
    name: string;
    kind: string;
    archived_at?: string | null;
  }>;
  const defaultWarehouseId = defaultOrderWarehouseId(warehouses, null);
  return {
    suppliers,
    warehouses: warehouses.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      isDefault: row.id === defaultWarehouseId,
    })),
    defaultWarehouseId,
  };
}

export async function rememberOrderUser(email: string) {
  const value = email.trim().toLowerCase();
  if (!value.includes("@") || erpLocalMode()) return;
  try {
    await erpDb().from("erp_order_users").upsert({ email: value, active: true }, { onConflict: "email" });
  } catch (error) {
    console.error("[orders] remember user", error);
  }
}

export async function listSupplierProducts(supplierId: string) {
  return { products: await orderRpc<unknown>("erp_order_supplier_products", { p_supplier: uuid(supplierId, "supplier") }) };
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
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
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
  return {
    orderNo: String(row.orderNo ?? ""),
    revision: Number(row.revision) || 0,
    orderedAt: String(row.orderedAt ?? ""),
    supplierName: String(row.supplierName ?? ""),
    warehouseName: row.warehouseName == null ? undefined : String(row.warehouseName),
    comment: row.comment == null ? undefined : String(row.comment),
    lines: lines.map((line) => {
      const item = jsonObject(line, "line");
      return {
        nameEn: String(item.nameEn ?? ""),
        nameVn: String(item.nameVn ?? ""),
        brand: String(item.brand ?? ""),
        packLabel: String(item.packLabel ?? ""),
        unit: String(item.unit ?? ""),
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
  return orderRpc<unknown>("erp_order_place", { p_id: uuid(id), p_actor: actor });
}

export async function listOrders(actor: string, admin: boolean, status?: string | null) {
  return {
    orders: await orderRpc<unknown>("erp_order_list", {
      p_actor: actor,
      p_admin: admin,
      p_status: status || null,
    }),
  };
}

export async function getOrder(id: string, actor: string, admin: boolean) {
  return orderRpc<unknown>("erp_order_get", { p_id: uuid(id), p_actor: actor, p_admin: admin });
}

export async function receiveOrder(id: string, payload: Record<string, unknown>, actor: string) {
  return orderRpc<unknown>("erp_order_receive", { p_id: uuid(id), p_payload: payload, p_actor: actor });
}

export async function closeOrderRemainder(id: string, reason: string, actor: string, lines?: unknown, admin = false) {
  return orderRpc<unknown>("erp_order_close_remainder", {
    p_id: uuid(id),
    p_reason: reason,
    p_actor: actor,
    p_lines: lines ?? null,
    p_admin: admin,
  });
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
