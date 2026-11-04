import { NextResponse } from "next/server";
import { check, erpDb, ErpHttpError, errorResponse, requireAdmin } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    if (!UUID.test(id)) throw new ErpHttpError(404, "ERP_NOT_FOUND");
    const db = erpDb();
    const [document, lines] = await Promise.all([
      db.from("erp_documents").select("*").eq("id", id).maybeSingle(),
      db.from("erp_document_lines").select("*").eq("document_id", id).order("line_no"),
    ]);
    const doc = check(document);
    if (!doc) throw new ErpHttpError(404, "ERP_NOT_FOUND");
    return NextResponse.json({ document: { ...doc, lines: check(lines) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
