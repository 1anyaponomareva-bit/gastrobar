import { adminPostOrderReceipt, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Posts the unpublished ERP receipt created on employee receive. Stock moves here, once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPurchasingAdmin(request, async (_timing, email) => adminPostOrderReceipt((await params).id, email));
}
