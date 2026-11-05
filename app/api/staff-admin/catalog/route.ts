import { NextResponse } from "next/server";
import { sanitizeStaffCatalog } from "@/data/staffCatalog";
import { ErpHttpError, getErpEmail } from "@/lib/erp/server";
import { saveStaffCatalog } from "@/lib/erp/staffCatalogSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { catalog, version }; replaces the whole order catalog if `version` is still current. */
export async function PUT(request: Request) {
  try {
    const email = await getErpEmail();
    if (!email) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { catalog?: unknown; version?: unknown };
    const catalog = sanitizeStaffCatalog(body.catalog);
    if (!catalog || typeof body.version !== "string" || !body.version) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    return NextResponse.json(await saveStaffCatalog(catalog, body.version, email));
  } catch (error) {
    if (error instanceof ErpHttpError) {
      return NextResponse.json({ error: error.code === "ERP_STALE" ? "stale" : error.code, detail: error.detail }, { status: error.status });
    }
    console.error("[staff-admin] catalog", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
