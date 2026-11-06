import { bumpPdfRevision, ErpHttpError, getDraft, withOrdersActor } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Bumps revision, freezes the OrderPdfInput snapshot, does not place. Filename uses _rN_. */
export async function POST(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  return withOrdersActor(request, async (_timing, actor) => {
    const supplierId = (await params).supplierId;
    const draft = await getDraft(supplierId, actor.email);
    const id =
      draft && typeof draft === "object" && "id" in draft && typeof (draft as { id: unknown }).id === "string"
        ? (draft as { id: string }).id
        : "";
    if (!id) throw new ErpHttpError(404, "ERP_NOT_FOUND", "draft");
    return bumpPdfRevision(id, actor.email);
  });
}
