import {
  archivePrepStockItem,
  listPrepStockItems,
  upsertPrepStockItem,
} from "@/lib/erp/prepStock";
import { jsonObject, withPurchasingAdmin } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  return withPurchasingAdmin(request, async () => {
    const items = await listPrepStockItems({ includeArchived: false });
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        note: item.note ?? "",
        noWarehouse: Boolean(item.noWarehouse),
        sortOrder: item.sortOrder,
      })),
    };
  });
}

export async function POST(request: Request) {
  return withPurchasingAdmin(request, async (_timing, email) => {
    const body = jsonObject(await request.json().catch(() => null));
    const action = String(body.action ?? "upsert").trim();

    if (action === "archive") {
      return archivePrepStockItem({
        id: String(body.id ?? ""),
        actor: email,
      });
    }

    const item = await upsertPrepStockItem({
      id: typeof body.id === "string" ? body.id : null,
      nameEn: String(body.nameEn ?? body.name_en ?? ""),
      nameRu: String(body.nameRu ?? body.name_ru ?? ""),
      nameVn: String(body.nameVn ?? body.name_vn ?? ""),
      note: typeof body.note === "string" ? body.note : "",
      noWarehouse: Boolean(body.noWarehouse ?? body.no_warehouse),
      actor: email,
    });

    return {
      item: {
        id: item.id,
        name: item.name,
        note: item.note ?? "",
        noWarehouse: Boolean(item.noWarehouse),
        sortOrder: item.sortOrder,
      },
    };
  });
}
