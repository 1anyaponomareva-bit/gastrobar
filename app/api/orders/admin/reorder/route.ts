import { jsonObject, reorderOrderProducts, reorderOrderSuppliers, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function PUT(request: Request) {
  return withPurchasingAdmin(request, async () => {
    const body = jsonObject(await request.json().catch(() => null));
    const products = Array.isArray(body.products) ? body.products.map(String) : [];
    const suppliers = Array.isArray(body.suppliers) ? body.suppliers.map(String) : [];
    if (products.length) return reorderOrderProducts(products);
    if (suppliers.length) return reorderOrderSuppliers(suppliers);
    return { ok: false };
  });
}
