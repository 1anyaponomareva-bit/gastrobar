import { ErpHttpError, readAsAdmin, ServerTiming } from "@/lib/erp/server";
import { loadDocument } from "@/lib/erp/stateLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = new ServerTiming();
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new ErpHttpError(404, "ERP_NOT_FOUND");
    const { data: document } = await readAsAdmin(timing, () => loadDocument(id));
    if (!document) throw new ErpHttpError(404, "ERP_NOT_FOUND");
    return timing.json({ document });
  } catch (error) {
    return timing.error(error);
  }
}
