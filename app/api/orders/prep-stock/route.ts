import { withOrdersActor } from "@/lib/erp/supplierOrders";
import { listPrepStockBalances } from "@/lib/erp/prepStock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withOrdersActor(request, async () => {
    const balances = await listPrepStockBalances();
    return { balances };
  });
}
