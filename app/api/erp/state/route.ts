import { ErpHttpError, readAsAdmin, ServerTiming } from "@/lib/erp/server";
import { ALL_PARTS, loadState, type StatePart } from "@/lib/erp/stateLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the ERP screens need except documents (reference data is small), plus the signed-in
 * email so the first screen needs one request. `?parts=stock,products` loads only those parts.
 */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const asked = new URL(request.url).searchParams.get("parts");
    const parts = asked ? (asked.split(",") as StatePart[]) : ALL_PARTS;
    if (parts.some((part) => !ALL_PARTS.includes(part))) throw new ErpHttpError(400, "ERP_INVALID", "parts");
    const { email, data } = await readAsAdmin(timing, () => loadState(parts));
    return timing.json({ ...data, email });
  } catch (error) {
    return timing.error(error);
  }
}
