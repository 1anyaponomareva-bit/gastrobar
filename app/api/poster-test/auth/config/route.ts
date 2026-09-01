import { NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  getTelegramBotUsername,
} from "@/lib/poster-test-auth/oauth";
import { isPosterTestDbConfigured, probePosterTestDbSchema } from "@/lib/poster-test-auth/db";

export const runtime = "nodejs";

function authSecretConfigured(): boolean {
  const secret = process.env.POSTER_TEST_AUTH_SECRET?.trim() ?? "";
  return secret.length >= 32;
}

export async function GET() {
  const dbConfigured = isPosterTestDbConfigured();
  const schema = dbConfigured ? await probePosterTestDbSchema() : null;

  return NextResponse.json({
    dbConfigured,
    dbSchemaReady: schema?.ok ?? false,
    dbSchemaError: schema?.error ?? null,
    dbSchemaHint: schema?.hint ?? null,
    authSecretConfigured: authSecretConfigured(),
    googleConfigured: getGoogleOAuthConfig().configured,
    telegramBotUsername: getTelegramBotUsername(),
  });
}
