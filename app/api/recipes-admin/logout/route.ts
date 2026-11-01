import { NextResponse } from "next/server";
import { RECIPES_ADMIN_COOKIE, sessionCookieOptions } from "@/lib/recipes-admin/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(RECIPES_ADMIN_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
