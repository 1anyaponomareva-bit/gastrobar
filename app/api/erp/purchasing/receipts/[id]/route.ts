import { getPurchasingReceipt, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPurchasingAdmin(request, async (_timing, email) => getPurchasingReceipt((await params).id, email));
}
