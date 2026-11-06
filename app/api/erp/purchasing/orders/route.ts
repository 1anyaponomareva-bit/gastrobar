import { listOrders, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withPurchasingAdmin(request, (_timing, email) => {
    const status = new URL(request.url).searchParams.get("status");
    return listOrders(email, true, status);
  });
}
