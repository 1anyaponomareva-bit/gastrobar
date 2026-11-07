import { listOrders, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withOrdersActor(request, (_timing, actor) => {
    const status = new URL(request.url).searchParams.get("status");
    return listOrders(actor.email, actor.erpAdmin, status);
  });
}
