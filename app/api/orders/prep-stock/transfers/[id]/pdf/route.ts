import { listPrepStockItems, getPrepStockTransfer } from "@/lib/erp/prepStock";
import { requireOrdersActor, ServerTiming } from "@/lib/erp/supplierOrders";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const timing = new ServerTiming();
  try {
    await timing.time("auth", () => requireOrdersActor(request));
    const { id } = await context.params;
    const [transfer, items] = await Promise.all([
      getPrepStockTransfer(id),
      listPrepStockItems(),
    ]);
    const item = items.find((row) => row.id === transfer.itemId);
    const pdfSafe = (value: string) => value.replace(/[^\x20-\x7E]/g, "?");
    const name = pdfSafe(item?.name.en || item?.name.ru || item?.name.vn || transfer.itemId);
    const note = pdfSafe(String(item?.note || "").trim());
    const directionLabel =
      transfer.direction === "to_warehouse" ? "TO WAREHOUSE" : "TO KITCHEN";
    const statusLabel = String(transfer.status || "").toUpperCase();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let y = 780;
    const draw = (text: string, size = 12, useBold = false) => {
      page.drawText(pdfSafe(text), {
        x: 48,
        y,
        size,
        font: useBold ? bold : font,
        color: rgb(0.07, 0.07, 0.07),
      });
      y -= size + 10;
    };

    draw("PREP STOCK TRANSFER", 18, true);
    draw(`Status: ${statusLabel}`);
    draw(`Direction: ${directionLabel}`);
    draw(`Item: ${name}${note ? ` / ${note}` : ""}`);
    draw(`Qty: ${transfer.qty} pcs`);
    draw(`From: ${transfer.actor || "-"}`);
    if (transfer.createdAt) draw(`Created: ${transfer.createdAt}`);
    if (transfer.receivedAt) {
      draw(`Received: ${transfer.receivedAt}`);
      draw(`Received by: ${transfer.receivedBy || "-"}`);
    }

    const bytes = await pdfDoc.save();
    const fileName = `PrepTransfer-${transfer.id.slice(0, 8)}.pdf`;
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
