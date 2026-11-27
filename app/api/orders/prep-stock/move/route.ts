import { jsonObject, withOrdersActor } from "@/lib/erp/supplierOrders";
import { movePrepStock, type PrepStockMoveType } from "@/lib/erp/prepStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const MOVE_TYPES = new Set<PrepStockMoveType>([
  "produce",
  "to_warehouse",
  "to_kitchen",
  "writeoff_kitchen",
  "writeoff_warehouse",
  "set_warehouse",
  "set_kitchen",
]);

export async function POST(request: Request) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => null));
    const moveType = String(body.moveType ?? body.move_type ?? "") as PrepStockMoveType;
    if (!MOVE_TYPES.has(moveType)) {
      const { ErpHttpError } = await import("@/lib/erp/server");
      throw new ErpHttpError(400, "ERP_INVALID", "move_type");
    }
    const qty = Number(body.qty);
    const result = await movePrepStock({
      itemId: String(body.itemId ?? body.item_id ?? ""),
      moveType,
      qty,
      actor: actor.email || "kitchen@gastrofood",
      note: typeof body.note === "string" ? body.note : null,
    });
    return { balance: result };
  });
}
