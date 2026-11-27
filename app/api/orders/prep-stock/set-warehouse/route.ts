import { jsonObject, withOrdersActor } from "@/lib/erp/supplierOrders";
import { setPrepStockWarehouseBatch } from "@/lib/erp/prepStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: Request) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => null));
    const rawValues = Array.isArray(body.values) ? body.values : [];
    const values = rawValues
      .map((row) => {
        const obj = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
        return {
          itemId: String(obj.itemId ?? obj.item_id ?? ""),
          warehouse: Number(obj.warehouse ?? obj.qty ?? NaN),
        };
      })
      .filter((row) => row.itemId && Number.isFinite(row.warehouse) && row.warehouse >= 0);

    return setPrepStockWarehouseBatch({
      values,
      actor: actor.email || "kitchen@gastrofood",
    });
  });
}
