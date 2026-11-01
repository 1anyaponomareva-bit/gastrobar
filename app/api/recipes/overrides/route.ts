import { NextResponse } from "next/server";
import { readOverrides, readStoredRecipes } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything admins changed: amount overrides and stored (created / edited / deleted) recipes. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const [overrides, stored] = await Promise.all([readOverrides(), readStoredRecipes()]);
    return NextResponse.json({ overrides, stored }, { headers });
  } catch (error) {
    console.error("[recipes] overrides", error);
    return NextResponse.json({ overrides: {}, stored: null }, { headers });
  }
}
