import { NextResponse } from "next/server";
import { check, erpDb, errorResponse, requireAdmin } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["opening", "receipt", "transfer", "writeoff", "count", "production"]);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const type = new URL(request.url).searchParams.get("type");
    let query = erpDb()
      .from("erp_documents")
      .select(
        "id, doc_no, doc_type, status, doc_date, warehouse_id, target_warehouse_id, supplier_id, reason, output_product_id, output_qty, output_pieces, batch_no, total_cost, cost_known, output_unit_cost, created_by, created_at, posted_by, posted_at, cancelled_by, cancelled_at, cancel_reason",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (type && TYPES.has(type)) query = query.eq("doc_type", type);
    return NextResponse.json({ documents: check(await query) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
