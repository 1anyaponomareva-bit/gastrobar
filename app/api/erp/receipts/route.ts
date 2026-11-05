import { check, erpDb, readAsAdmin, ServerTiming } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 1000;
/** Ids per lines request: keeps the request URL short. */
const CHUNK = 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type DocRow = { id: string } & Record<string, unknown>;
type LineRow = { document_id: string } & Record<string, unknown>;

/**
 * Deliveries (and opening balances) of a period with their lines, newest first, for the
 * deliveries table: search and filters work on the client over the whole period. `more` is set
 * when the period holds more than the limit.
 */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const { data } = await readAsAdmin(timing, async () => {
      let query = erpDb()
        .from("erp_documents")
        .select(
          "id, doc_no, doc_type, status, doc_date, warehouse_id, supplier_id, comment, prices_include_vat, total_cost, cost_known, created_by, created_at, posted_by, posted_at, cancelled_by, cancelled_at, cancel_reason",
        )
        .in("doc_type", ["receipt", "opening"])
        .order("doc_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (from && DATE.test(from)) query = query.gte("doc_date", from);
      if (to && DATE.test(to)) query = query.lte("doc_date", to);
      const docs = check<DocRow[]>(await query.limit(MAX + 1));
      const shown = docs.slice(0, MAX);
      const ids = shown.map((doc) => doc.id);
      const parts = await Promise.all(
        Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) =>
          erpDb()
            .from("erp_document_lines")
            .select("document_id, line_no, product_id, qty, pack_id, pack_qty, unit_price, vat_rate, net_amount, gross_amount, cost_amount")
            .in("document_id", ids.slice(i * CHUNK, i * CHUNK + CHUNK))
            .order("line_no")
            .then((result) => check<LineRow[]>(result)),
        ),
      );
      const byDoc = new Map<string, LineRow[]>();
      for (const line of parts.flat()) {
        const list = byDoc.get(line.document_id) ?? [];
        list.push(line);
        byDoc.set(line.document_id, list);
      }
      return { documents: shown.map((doc) => ({ ...doc, lines: byDoc.get(doc.id) ?? [] })), more: docs.length > MAX };
    });
    return timing.json(data);
  } catch (error) {
    return timing.error(error);
  }
}
