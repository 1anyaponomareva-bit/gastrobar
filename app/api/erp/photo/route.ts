import { NextResponse } from "next/server";
import { jpegFromUpload, uploadErpPhoto } from "@/lib/erp/photos";
import { errorResponse, requireAdmin, ServerTiming } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JPEG for a prep-card header or cooking step. Stored in the erp-photos bucket, not Staff JSON. */
export async function POST(request: Request) {
  const timing = new ServerTiming();
  try {
    await timing.time("auth", requireAdmin());
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return timing.json({ error: "ERP_INVALID", detail: "file" }, 400);
    const jpeg = await jpegFromUpload(file);
    const url = await timing.time("db", uploadErpPhoto(jpeg, "preps"));
    return timing.json({ url });
  } catch (error) {
    if (error instanceof Error && error.message === "ERP_PHOTO_FILE") {
      return NextResponse.json({ error: "ERP_INVALID", detail: "file" }, { status: 400 });
    }
    return timing.error(error);
  }
}
