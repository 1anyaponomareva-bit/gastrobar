import { NextResponse } from "next/server";
import { sanitizeStaffCatalog } from "@/data/staffCatalog";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { writeStaffCatalog } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { catalog }; replaces the whole order catalog. */
export async function PUT(request: Request) {
  try {
    if (!(await getSessionEmail())) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { catalog?: unknown };
    const catalog = sanitizeStaffCatalog(body.catalog);
    if (!catalog) return NextResponse.json({ error: "invalid" }, { status: 400 });
    await writeStaffCatalog(catalog);
    return NextResponse.json({ catalog });
  } catch (error) {
    console.error("[staff-admin] catalog", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
