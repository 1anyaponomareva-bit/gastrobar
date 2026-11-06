import { ErpHttpError, readAsAdmin, rpc, ServerTiming } from "@/lib/erp/server";
import type { ErpCardEntity, ErpCardRevision } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITIES = new Set<ErpCardEntity>(["product", "recipe", "dish"]);

/**
 * Snapshots of a product, recipe or dish card. Reading history does not touch stock
 * or posted documents. Newest first.
 */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const params = new URL(request.url).searchParams;
    const entity = params.get("entity") ?? "";
    const id = params.get("id") ?? "";
    const limit = Number(params.get("limit") ?? 50);
    if (!ENTITIES.has(entity as ErpCardEntity)) throw new ErpHttpError(400, "ERP_INVALID", "entity");
    if (!UUID.test(id)) throw new ErpHttpError(400, "ERP_INVALID", "id");
    const { data } = await readAsAdmin(timing, () =>
      rpc<ErpCardRevision[]>("erp_card_history", { p_entity: entity, p_id: id, p_limit: Number.isFinite(limit) ? limit : 50 }),
    );
    return timing.json({ entity, id, revisions: data ?? [] });
  } catch (error) {
    return timing.error(error);
  }
}
