import { jsonObject, receiveOrder, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** TEMPORARY: marks the supplier order received. Skips unpublished ERP receipt / stock. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => null));
    return receiveOrder((await params).id, body, actor.email);
  });
}
