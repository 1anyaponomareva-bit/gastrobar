import { NextResponse } from "next/server";
import { readOverrides } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { overrides: await readOverrides() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[recipes] overrides", error);
    return NextResponse.json({ overrides: {} }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
