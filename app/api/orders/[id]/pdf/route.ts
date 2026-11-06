import { NextResponse } from "next/server";
import {
  bumpPdfRevision,
  getOrderPdfSnapshot,
  renderOrderPdf,
  requireOrdersActor,
  ServerTiming,
} from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Serves the frozen snapshot PDF. Download does not place the order. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", () => requireOrdersActor(request));
    const snapshot = await getOrderPdfSnapshot((await params).id, actor.email, actor.erpAdmin);
    const { bytes, fileName } = await renderOrderPdf(snapshot);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "Server-Timing": timing.header(),
      },
    });
  } catch (error) {
    return timing.error(error);
  }
}

/** Bumps the PDF revision, freezes names/qty, and returns the file. Does not place the order. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", () => requireOrdersActor(request));
    const id = (await params).id;
    const meta = await bumpPdfRevision(id, actor.email);
    const { bytes, fileName } = await renderOrderPdf(meta.snapshot);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Order-Revision": String(meta.revision),
        "X-Order-Id": String(meta.id ?? id),
        "Server-Timing": timing.header(),
      },
    });
  } catch (error) {
    return timing.error(error);
  }
}
