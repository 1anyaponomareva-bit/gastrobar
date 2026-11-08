import { NextResponse } from "next/server";
import {
  RECIPES_ADMIN_COOKIE,
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/recipes-admin/auth";
import { readAdmins } from "@/lib/recipes-admin/storage";
import { normalizePersonName } from "@/lib/orders/person";
import { rememberOrderUser } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  try {
    const account = (await readAdmins()).find((admin) => admin.email === email);
    if (!account || !verifyPassword(account, password)) {
      return NextResponse.json({ error: "credentials" }, { status: 401 });
    }
    const name = normalizePersonName(account.name);
    if (name) await rememberOrderUser(email, name);
    const response = NextResponse.json({ email, name });
    response.cookies.set(RECIPES_ADMIN_COOKIE, createSessionToken(email), sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("[recipes-admin] login", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
