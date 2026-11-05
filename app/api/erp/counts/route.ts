import { check, ErpHttpError, erpDb, readAsAdmin, requireAdmin, rpc, ServerTiming } from "@/lib/erp/server";
import { loadDocument } from "@/lib/erp/stateLoader";
import type { ErpCountPreview } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function uuid(value: unknown, name = "id"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ErpHttpError(400, "ERP_INVALID", name);
  return value;
}

/**
 * Count list / one count with book breakdown (GET), and preview / refresh / reopen /
 * save / post (POST). Posting is the same `erp_post_document` path as other documents
 * so a UI can also use `/api/erp/action` `{ action: "postDocument" }`.
 */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      const { data } = await readAsAdmin(timing, () => rpc<unknown>("erp_count_get", { p_id: uuid(id) }));
      return timing.json({ count: data });
    }
    const warehouse = params.get("warehouse");
    const from = params.get("from");
    const to = params.get("to");
    if (warehouse && !UUID.test(warehouse)) throw new ErpHttpError(400, "ERP_INVALID", "warehouse");
    let query = erpDb()
      .from("erp_documents")
      .select(
        "id, doc_no, doc_type, status, doc_date, occurred_at, counted_at, count_kind, warehouse_id, snapshot_hash, superseded_by, correction_of, total_cost, cost_known, created_at, created_by, posted_at, posted_by, lock_version, comment, reason",
      )
      .eq("doc_type", "count")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (warehouse) query = query.eq("warehouse_id", warehouse);
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("doc_date", from);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("doc_date", to);
    const { data } = await readAsAdmin(timing, async () => check<unknown[]>(await query));
    return timing.json({ documents: data });
  } catch (error) {
    return timing.error(error);
  }
}

export async function POST(request: Request) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", requireAdmin());
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isObject(body)) throw new ErpHttpError(400, "ERP_INVALID", "body");
    const action = String(body.action ?? "");
    switch (action) {
      case "preview": {
        const preview = isObject(body.preview) ? body.preview : body;
        const data = await timing.time("db", () => rpc<ErpCountPreview>("erp_count_preview", { p: preview }));
        return timing.json({ preview: data });
      }
      case "refresh": {
        const data = await timing.time("db", () => rpc("erp_count_refresh", { p_id: uuid(body.id), p_actor: actor }));
        return timing.json({ count: data });
      }
      case "reopen": {
        const data = await timing.time("db", () =>
          rpc("erp_reopen_count", {
            p_id: uuid(body.id),
            p_actor: actor,
            p_cascade: body.cascade === true,
            p_reason: String(body.reason ?? ""),
          }),
        );
        return timing.json({ count: data });
      }
      case "save": {
        const document = object(body.document, "document");
        const id = await timing.time("db", () => rpc<string>("erp_save_document", { p_doc: { ...document, doc_type: "count" }, p_actor: actor }));
        const [saved, count] = await Promise.all([loadDocument(id), rpc("erp_count_get", { p_id: id })]);
        return timing.json({ id, document: saved, count });
      }
      case "post": {
        const id = body.document
          ? await timing.time("db", () =>
              rpc<string>("erp_save_document", { p_doc: { ...object(body.document, "document"), doc_type: "count" }, p_actor: actor }),
            )
          : uuid(body.id);
        try {
          const result = await timing.time("db", () => rpc("erp_post_document", { p_id: id, p_actor: actor }));
          const [document, count] = await Promise.all([loadDocument(id), rpc("erp_count_get", { p_id: id })]);
          return timing.json({ id, result, document, count });
        } catch (error) {
          if (error instanceof ErpHttpError && error.code === "ERP_COUNT_STALE") {
            error.extra = { id, count: await rpc("erp_count_get", { p_id: id }).catch(() => null) };
          }
          throw error;
        }
      }
      default:
        throw new ErpHttpError(400, "ERP_INVALID", "action");
    }
  } catch (error) {
    return timing.error(error);
  }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!isObject(value)) throw new ErpHttpError(400, "ERP_INVALID", name);
  return value;
}
