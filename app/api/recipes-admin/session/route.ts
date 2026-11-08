import { NextResponse } from "next/server";
import { RECIPES_ADMIN_COOKIE, getSessionEmail, sessionCookieOptions } from "@/lib/recipes-admin/auth";
import { displayNameForEmail, readAdmins, writeAdmins } from "@/lib/recipes-admin/storage";
import { getErpEmail, LOCAL_DEV_ADMIN } from "@/lib/erp/server";
import { erpLocalMode } from "@/lib/erp/localDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const email = await getErpEmail();
    const name = !email ? "" : erpLocalMode() && email === LOCAL_DEV_ADMIN ? "Local" : await displayNameForEmail(email);
    return NextResponse.json({ email, name });
  } catch (error) {
    console.error("[recipes-admin] session", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

/** Deletes the signed-in admin account. */
export async function DELETE() {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: "auth" }, { status: 401 });
    await writeAdmins((await readAdmins()).filter((admin) => admin.email !== email));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(RECIPES_ADMIN_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[recipes-admin] delete account", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
