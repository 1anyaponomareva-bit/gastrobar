import { NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  getTelegramBotUsername,
} from "@/lib/poster-test-auth/oauth";
import { isPosterTestDbConfigured } from "@/lib/poster-test-auth/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    dbConfigured: isPosterTestDbConfigured(),
    googleConfigured: getGoogleOAuthConfig().configured,
    telegramBotUsername: getTelegramBotUsername(),
  });
}
