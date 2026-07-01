import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { posterTestUserPath } from "@/lib/posterTestRoutes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ success: false, message: "slug is required" }, { status: 400 });
  }

  const target = `${url.origin}${posterTestUserPath(slug)}`;
  const svg = await QRCode.toString(target, {
    type: "svg",
    margin: 1,
    color: {
      dark: "#000000",
      light: "#FFFFFFFF",
    },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
