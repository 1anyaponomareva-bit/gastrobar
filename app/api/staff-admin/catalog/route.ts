import { NextResponse } from "next/server";
import { sanitizeStaffCatalog } from "@/data/staffCatalog";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { saveStaffCatalog } from "@/lib/erp/staffCatalogSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { catalog }; replaces the whole order catalog. */
export async function PUT(request: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { catalog?: unknown };
    const catalog = sanitizeStaffCatalog(body.catalog);
    if (!catalog) return NextResponse.json({ error: "invalid" }, { status: 400 });
    return NextResponse.json({ catalog: await saveStaffCatalog(catalog, email) });
  } catch (error) {
    console.error("[staff-admin] catalog", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
