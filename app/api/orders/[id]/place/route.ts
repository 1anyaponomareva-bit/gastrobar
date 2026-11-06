import { placeOrder, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => placeOrder((await params).id, actor.email));
}
