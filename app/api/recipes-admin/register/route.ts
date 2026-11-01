import { NextResponse } from "next/server";
import {
  RECIPES_ADMIN_COOKIE,
  createSessionToken,
  hashPassword,
  isValidEmail,
  isValidInvite,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/recipes-admin/auth";
import { readAdmins, writeAdmins } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isValidInvite(body.invite)) {
    return NextResponse.json({ error: "invite" }, { status: 403 });
  }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || password.length < 6) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const admins = await readAdmins();
    if (admins.some((admin) => admin.email === email)) {
      return NextResponse.json({ error: "exists" }, { status: 409 });
    }
    await writeAdmins([...admins, { email, ...hashPassword(password), createdAt: new Date().toISOString() }]);
    const response = NextResponse.json({ email });
    response.cookies.set(RECIPES_ADMIN_COOKIE, createSessionToken(email), sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("[recipes-admin] register", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
