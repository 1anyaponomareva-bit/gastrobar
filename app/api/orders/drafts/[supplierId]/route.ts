import { getDraft, jsonObject, saveDraft, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => getDraft((await params).supplierId, actor.email));
}

export async function PUT(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => {
    const body = jsonObject(await request.json().catch(() => null));
    return saveDraft((await params).supplierId, body, actor.email);
  });
}

/** Same as PUT: public kitchen actor, no gf_orders cookie. Some browsers/WAFs drop PUT. */
export async function POST(request: Request, context: { params: Promise<{ supplierId: string }> }) {
  return PUT(request, context);
}
