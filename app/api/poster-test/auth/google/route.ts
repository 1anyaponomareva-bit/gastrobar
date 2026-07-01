import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
} from "@/lib/poster-test-auth/oauth";
import { createOAuthState } from "@/lib/poster-test-auth/session";

export const runtime = "nodejs";

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/poster-test/auth/google/callback`;
}

export async function GET(request: Request) {
  if (!getGoogleOAuthConfig().configured) {
    return NextResponse.json(
      {
        success: false,
        error: "GOOGLE_NOT_CONFIGURED",
        message: "Google OAuth не настроен (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/poster-test/account";
  const safeReturnTo = returnTo.startsWith("/poster-test") ? returnTo : "/poster-test/account";
  const authUrl = buildGoogleAuthUrl({
    redirectUri: getRedirectUri(request),
    state: createOAuthState(safeReturnTo),
  });

  if (!authUrl) {
    return NextResponse.json(
      { success: false, message: "Не удалось сформировать ссылку Google OAuth." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(authUrl);
}
