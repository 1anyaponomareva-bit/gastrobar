import { NextResponse } from "next/server";
import { DEFAULT_STAFF_CATALOG } from "@/data/staffCatalog";
import { readStaffCatalog } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = (await readStaffCatalog()) ?? DEFAULT_STAFF_CATALOG;
    return NextResponse.json({ catalog }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[staff-catalog] read", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
