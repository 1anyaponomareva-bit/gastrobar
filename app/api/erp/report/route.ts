import { ErpHttpError, readAsAdmin, rpc, ServerTiming } from "@/lib/erp/server";
import type { ErpMovementRow } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stock movement report for a period of document dates, optionally for one location. */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const warehouse = params.get("warehouse") || null;
    if (!DATE.test(from) || !DATE.test(to) || from > to) throw new ErpHttpError(400, "ERP_INVALID", "period");
    if (warehouse && !UUID.test(warehouse)) throw new ErpHttpError(400, "ERP_INVALID", "warehouse");
    const { data: rows } = await readAsAdmin(timing, () =>
      rpc<ErpMovementRow[]>("erp_movement_report_json", { p_from: from, p_to: to, p_warehouse: warehouse }),
    );
    return timing.json({ rows: rows ?? [] });
  } catch (error) {
    return timing.error(error);
  }
}
