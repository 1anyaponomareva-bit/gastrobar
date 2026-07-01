import { NextResponse } from "next/server";
import { createAuthSuccessResponse } from "@/lib/poster-test-auth/api";
import { isPosterTestDbConfigured } from "@/lib/poster-test-auth/db";import { getTelegramBotToken } from "@/lib/poster-test-auth/oauth";
import {
  createPosterTestSessionToken,
  sessionCookieOptions,
} from "@/lib/poster-test-auth/session";
import {
  telegramDisplayName,
  upsertTelegramUser,
  verifyTelegramAuth,
  type TelegramAuthPayload,
} from "@/lib/poster-test-auth/userService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPosterTestDbConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "DB_NOT_CONFIGURED",
        message: "База данных для личного кабинета не настроена.",
      },
      { status: 503 },
    );
  }

  const botToken = getTelegramBotToken();
  if (!botToken) {
    return NextResponse.json(
      {
        success: false,
        error: "TELEGRAM_NOT_CONFIGURED",
        message: "Telegram Login не настроен (TELEGRAM_BOT_TOKEN).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Некорректный JSON." },
      { status: 400 },
    );
  }

  const payload = body as TelegramAuthPayload;
  if (!payload?.id || !payload.hash || !payload.auth_date) {
    return NextResponse.json(
      { success: false, message: "Некорректные данные Telegram." },
      { status: 400 },
    );
  }

  if (!verifyTelegramAuth(payload, botToken)) {
    return NextResponse.json(
      { success: false, message: "Не удалось проверить подпись Telegram." },
      { status: 401 },
    );
  }

  const user = await upsertTelegramUser({
    telegramId: payload.id,
    name: telegramDisplayName(payload),
    avatar: payload.photo_url ?? null,
  });

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Не удалось создать пользователя." },
      { status: 500 },
    );
  }

  const token = createPosterTestSessionToken(user.id);
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: "AUTH_SECRET_MISSING",
        message: "POSTER_TEST_AUTH_SECRET не настроен на сервере.",
      },
      { status: 500 },
    );
  }

  const response = createAuthSuccessResponse(user);
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
