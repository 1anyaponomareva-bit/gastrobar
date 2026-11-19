import { NextResponse } from "next/server";
import { applyErpPrepsToStoredRecipes } from "@/lib/erp/publishPrepToStaff";
import { loadState } from "@/lib/erp/stateLoader";
import { readOverrides, readStoredRecipes } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything admins changed: amount overrides and stored (created / edited / deleted) recipes. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const [overrides, stored] = await Promise.all([readOverrides(), readStoredRecipes()]);
    try {
      const state = await loadState(["products", "recipes"]);
      const next = await applyErpPrepsToStoredRecipes(stored, state.products ?? [], state.recipes ?? []);
      return NextResponse.json({ overrides, stored: next }, { headers });
    } catch (error) {
      console.error("[recipes] erp merge", error);
      return NextResponse.json({ overrides, stored }, { headers });
    }
  } catch (error) {
    console.error("[recipes] overrides", error);
    return NextResponse.json({ overrides: {}, stored: null }, { headers });
  }
}
