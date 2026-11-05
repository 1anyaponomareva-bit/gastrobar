import { NextResponse } from "next/server";
import { loadStaffCatalog } from "@/lib/erp/staffCatalogSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const loaded = await loadStaffCatalog();
    return NextResponse.json(loaded, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[staff-catalog] read", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
