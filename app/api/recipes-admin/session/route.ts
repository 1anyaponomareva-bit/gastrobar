import { NextResponse } from "next/server";
import { RECIPES_ADMIN_COOKIE, getSessionEmail, sessionCookieOptions } from "@/lib/recipes-admin/auth";
import { readAdmins, writeAdmins } from "@/lib/recipes-admin/storage";
import { getErpEmail } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ email: await getErpEmail() });
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
