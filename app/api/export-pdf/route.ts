import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Echo PDF bytes with attachment headers — helps iOS build a shareable File. */
export async function POST(request: NextRequest) {
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) {
    return NextResponse.json({ error: "Empty PDF" }, { status: 400 });
  }

  const rawName = request.headers.get("x-file-name");
  const fileName = rawName ? decodeURIComponent(rawName) : "export.pdf";
  const safeName = fileName.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
