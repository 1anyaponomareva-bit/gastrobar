import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/poster-test-auth/oauth";
import {
  createPosterTestSessionToken,
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnTo = POSTER_TEST_ACCOUNT_PATH;

  if (!code) {
    return NextResponse.redirect(`${url.origin}/poster-test/login?error=google_cancelled`);
  }

  if (!isPosterTestDbConfigured()) {
    return NextResponse.redirect(`${url.origin}/poster-test/login?error=db_not_configured`);
  }

  const profile = await exchangeGoogleCode({
    code,
    redirectUri: getRedirectUri(request),
  });

  if (!profile) {
    return NextResponse.redirect(`${url.origin}/poster-test/login?error=google_failed`);
  }

  const user = await upsertGoogleUser(profile);
  if (!user) {
    return NextResponse.redirect(`${url.origin}/poster-test/login?error=user_create_failed`);
  }

  const token = createPosterTestSessionToken(user.id);
  if (!token) {
    return NextResponse.redirect(`${url.origin}/poster-test/login?error=auth_secret_missing`);
  }

  const response = NextResponse.redirect(`${url.origin}${returnTo}`);
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
