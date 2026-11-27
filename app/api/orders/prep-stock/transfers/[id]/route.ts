import { getPrepStockTransfer, receivePrepStockTransfer } from "@/lib/erp/prepStock";
import { jsonObject, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withOrdersActor(request, async () => {
    const { id } = await context.params;
    const transfer = await getPrepStockTransfer(id);
    return { transfer };
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withOrdersActor(request, async (_timing, actor) => {
    const { id } = await context.params;
    const body = jsonObject(await request.json().catch(() => null));
    const action = String(body.action ?? "receive").trim();
    if (action !== "receive") {
      const { ErpHttpError } = await import("@/lib/erp/server");
      throw new ErpHttpError(400, "ERP_INVALID", "action");
    }
    const transfer = await receivePrepStockTransfer({
      transferId: id,
      actor: actor.email || "kitchen@gastrofood",
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
