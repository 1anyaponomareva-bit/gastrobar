import { check, erpDb, ErpHttpError, requireAdmin, ServerTiming } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  const timing = new ServerTiming();
  try {
    await timing.time("auth", requireAdmin());
    const result = await timing.time(
      "db",
      erpDb()
        .from("erp_vat_cost_adjustments")
        .select(
          "id, adj_no, adj_date, status, supplier_id, source_document_id, product_id, previous_vat_deduction_status, new_vat_deduction_status, vat_deduction_difference, total_cost_adjustment, consumed_cost_adjustment, unallocated_adjustment, created_by, approved_by, posted_at",
        )
        .order("adj_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
    );
    if (result.error && ["PGRST205", "42P01"].includes(result.error.code ?? "")) {
      return timing.json({ rows: [] });
    }
    return timing.json({ rows: check(result) ?? [] });
  } catch (error) {
    if (error instanceof ErpHttpError) return timing.error(error);
    throw error;
  }
}
