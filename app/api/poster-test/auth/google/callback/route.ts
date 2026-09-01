import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/poster-test-auth/oauth";
import {
  createPosterTestSessionToken,
  parseOAuthState,
  sessionCookieOptions,
} from "@/lib/poster-test-auth/session";
import { upsertGoogleUser } from "@/lib/poster-test-auth/userService";
import { isPosterTestDbConfigured } from "@/lib/poster-test-auth/db";
import { POSTER_TEST_ACCOUNT_PATH } from "@/lib/posterTestRoutes";

export const runtime = "nodejs";

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/poster-test/auth/google/callback`;
}

function loginRedirect(origin: string, error: string, returnTo?: string) {
  const params = new URLSearchParams({ error });
  if (returnTo?.startsWith("/poster-test")) {
    params.set("returnTo", returnTo);
  }
  return NextResponse.redirect(`${origin}/poster-test/login?${params.toString()}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const parsedState = parseOAuthState(state);
  const returnTo = parsedState?.returnTo ?? POSTER_TEST_ACCOUNT_PATH;

  if (!code) {
    return loginRedirect(url.origin, "google_cancelled", returnTo);
  }

  if (!isPosterTestDbConfigured()) {
    return loginRedirect(url.origin, "db_not_configured", returnTo);
  }

  const profile = await exchangeGoogleCode({
    code,
    redirectUri: getRedirectUri(request),
  });

  if (!profile) {
    return loginRedirect(url.origin, "google_failed", returnTo);
  }

  const upsert = await upsertGoogleUser(profile);
  if (!upsert.ok) {
    const errorCode =
      upsert.code === "db_schema_missing"
        ? "db_schema_missing"
        : upsert.code === "db_not_configured"
          ? "db_not_configured"
          : "user_create_failed";
    console.error("[poster-test-auth] Google callback upsert failed:", upsert.code, upsert.message);
    return loginRedirect(url.origin, errorCode, returnTo);
  }

  const token = createPosterTestSessionToken(upsert.user.id);
  if (!token) {
    return loginRedirect(url.origin, "auth_secret_missing", returnTo);
  }

  const response = NextResponse.redirect(`${url.origin}${returnTo}`);
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
