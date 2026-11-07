import { listOrderCatalog, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withPurchasingAdmin(request, () => listOrderCatalog(true));
}
