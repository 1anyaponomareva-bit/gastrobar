import { jsonObject, saveOrderAdminSupplier, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function PUT(request: Request) {
  return withPurchasingAdmin(request, async (_timing, email) => {
    const body = jsonObject(await request.json().catch(() => null));
    return saveOrderAdminSupplier(jsonObject(body.supplier ?? body, "supplier"), email);
  });
}
