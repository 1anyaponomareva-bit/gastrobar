import { NextResponse } from "next/server";
import { check, erpDb, ErpHttpError, errorResponse, requireAdmin } from "@/lib/erp/server";
import type { ErpProductReceipt } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN = 20;

type Doc = Pick<ErpProductReceipt, "doc_no" | "doc_type" | "warehouse_id" | "supplier_id"> & { id: string; doc_date: string | Date };
type Line = { document_id: string; qty: number | string; unit_cost: number | string | null; cost_amount: number | string | null };

const num = (value: number | string | null) => (value === null ? null : Number(value));
const dateOnly = (value: string | Date) =>
  typeof value === "string"
    ? value.slice(0, 10)
    : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

/** Latest posted deliveries and opening balances of one product. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const product = new URL(request.url).searchParams.get("product") ?? "";
    if (!UUID.test(product)) throw new ErpHttpError(400, "ERP_INVALID", "product");

    const docs = new Map<string, Doc>();
    for (const type of ["receipt", "opening"]) {
      const rows = check(
        await erpDb()
          .from("erp_documents")
          .select("id, doc_no, doc_type, doc_date, warehouse_id, supplier_id")
          .eq("doc_type", type)
          .eq("status", "posted")
          .order("doc_date", { ascending: false })
          .limit(1000),
      ) as Doc[];
      for (const doc of rows) docs.set(doc.id, doc);
    }

    const lines = check(
      await erpDb().from("erp_document_lines").select("document_id, qty, unit_cost, cost_amount").eq("product_id", product).limit(5000),
    ) as Line[];

    const receipts: ErpProductReceipt[] = lines
      .filter((line) => docs.has(line.document_id))
      .map((line) => {
        const doc = docs.get(line.document_id)!;
        return {
          document_id: doc.id,
          doc_no: doc.doc_no,
          doc_type: doc.doc_type,
          warehouse_id: doc.warehouse_id,
          supplier_id: doc.supplier_id,
          doc_date: dateOnly(doc.doc_date),
          qty: Number(line.qty),
          unit_cost: num(line.unit_cost),
          cost_amount: num(line.cost_amount),
        };
      })
      .sort((a, b) => b.doc_date.localeCompare(a.doc_date) || b.doc_no.localeCompare(a.doc_no))
      .slice(0, SHOWN);

    return NextResponse.json({ receipts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
