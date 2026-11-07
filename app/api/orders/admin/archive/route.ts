import { jsonObject, archiveOrderAdmin, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: Request) {
  return withPurchasingAdmin(request, async (_timing, email) => {
    const body = jsonObject(await request.json().catch(() => null));
    const entity = body.entity === "supplier" ? "supplier" : "product";
    const id = String(body.id ?? "");
    return archiveOrderAdmin(entity, id, body.archived === true, email);
  });
}
