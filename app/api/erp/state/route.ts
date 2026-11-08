import { ErpHttpError, LOCAL_DEV_ADMIN, readAsAdmin, ServerTiming } from "@/lib/erp/server";
import { ALL_PARTS, loadState, type StatePart } from "@/lib/erp/stateLoader";
import { erpLocalMode } from "@/lib/erp/localDb";
import { displayNameForEmail } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

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
    const name = erpLocalMode() && email === LOCAL_DEV_ADMIN ? "Local" : await displayNameForEmail(email);
    return timing.json({ ...data, email, name });
  } catch (error) {
    return timing.error(error);
  }
}
