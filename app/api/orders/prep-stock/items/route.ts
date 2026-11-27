import { withOrdersActor } from "@/lib/erp/supplierOrders";
import { listPrepStockItems } from "@/lib/erp/prepStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withOrdersActor(request, async () => {
    const items = await listPrepStockItems();
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        note: item.note ?? "",
        noWarehouse: Boolean(item.noWarehouse),
        sortOrder: item.sortOrder,
      })),
    };
  });
}
