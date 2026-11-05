import { check, erpDb, readAsAdmin, ServerTiming } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["opening", "receipt", "transfer", "writeoff", "count", "production"]);
const PAGE = 50;
const MAX_PAGE = 300;

/**
 * Newest documents first, one page at a time. `type` may list several types; `before` is the
 * `created_at` of the last document already shown. `more` tells whether older ones exist.
 */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const params = new URL(request.url).searchParams;
    const types = (params.get("type") ?? "").split(",").filter((type) => TYPES.has(type));
    const before = params.get("before");
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(params.get("limit")) || PAGE));
    let query = erpDb()
      .from("erp_documents")
      .select(
        "id, doc_no, doc_type, status, doc_date, occurred_at, counted_at, count_kind, warehouse_id, target_warehouse_id, supplier_id, reason, output_product_id, output_qty, output_pieces, batch_no, total_cost, cost_known, output_unit_cost, superseded_by, created_by, created_at, posted_by, posted_at, cancelled_by, cancelled_at, cancel_reason",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (types.length === 1) query = query.eq("doc_type", types[0]);
    else if (types.length > 1) query = query.in("doc_type", types);
    // Inclusive, so documents created in the same instant are not skipped; the client drops repeats.
    const cursor = before && !Number.isNaN(Date.parse(before));
    if (cursor) query = query.lte("created_at", before);
    const { data } = await readAsAdmin(timing, async () => check<unknown[]>(await query.limit(limit + 1)));
    return timing.json({ documents: data.slice(0, limit), more: data.length > limit });
  } catch (error) {
    return timing.error(error);
  }
}
