import { getPrepStockSettings, setPrepStockSettings } from "@/lib/erp/prepStock";
import { jsonObject, withOrdersActor, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withOrdersActor(request, async () => getPrepStockSettings());
}

export async function POST(request: Request) {
  return withPurchasingAdmin(request, async (_timing, email) => {
    const body = jsonObject(await request.json().catch(() => null));
    const raw = body.zaloUrl ?? body.zalo_url;
    const zaloUrl = typeof raw === "string" ? raw.trim() : "";
    return setPrepStockSettings({
      zaloUrl: zaloUrl || null,
      actor: email,
    });
  });
}
