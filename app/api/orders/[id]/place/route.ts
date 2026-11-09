import { jsonObject, placeOrder, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => ({})), "body");
    const name = typeof body.name === "string" ? body.name : typeof body.placedByName === "string" ? body.placedByName : null;
    return placeOrder((await params).id, actor.email, name);
  });
}
