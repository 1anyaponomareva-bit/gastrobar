import { createPrepStockTransfer, listPrepStockTransfers } from "@/lib/erp/prepStock";
import { jsonObject, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withOrdersActor(request, async () => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const transfers = await listPrepStockTransfers(
      status === "pending" || status === "received" || status === "cancelled" ? status : null,
    );
    return { transfers };
  });
}

export async function POST(request: Request) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => null));
    const direction = String(body.direction ?? body.moveType ?? body.move_type ?? "");
    if (direction !== "to_warehouse" && direction !== "to_kitchen") {
      const { ErpHttpError } = await import("@/lib/erp/server");
      throw new ErpHttpError(400, "ERP_INVALID", "direction");
    }
    const transfer = await createPrepStockTransfer({
      itemId: String(body.itemId ?? body.item_id ?? ""),
      direction,
      qty: Number(body.qty),
      actor: actor.email || "kitchen@gastrofood",
      note: typeof body.note === "string" ? body.note : null,
    });
    return {
      transfer,
      balance: {
        itemId: transfer.itemId,
        kitchen: transfer.kitchen ?? 0,
        warehouse: transfer.warehouse ?? 0,
        total: transfer.total ?? 0,
      },
    };
  });
}
