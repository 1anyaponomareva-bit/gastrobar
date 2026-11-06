import { closeOrderRemainder, jsonObject, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPurchasingAdmin(request, async (_timing, email) => {
    const body = jsonObject(await request.json().catch(() => null));
    const reason = typeof body.reason === "string" ? body.reason : "";
    return closeOrderRemainder((await params).id, reason, email, body.lines, true);
  });
}
