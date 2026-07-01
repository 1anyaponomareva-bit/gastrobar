import { NextResponse } from "next/server";
import { clearSessionCookieOptions } from "@/lib/poster-test-auth/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearSessionCookieOptions());
  return response;
}
