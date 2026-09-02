import { NextResponse } from "next/server";
import { isPosterTestDbConfigured } from "@/lib/poster-test-auth/db";
import {
  createPosterTestSessionToken,
  getPosterTestSessionUserId,
} from "@/lib/poster-test-auth/session";
import { getPosterTestUserById } from "@/lib/poster-test-auth/userService";
import type { PosterTestUser } from "@/lib/poster-test-auth/types";
import { isPosterTestMerchantUser } from "@/lib/poster-test-auth/merchantAccess";

export async function requirePosterTestUser(): Promise<
  | { user: PosterTestUser; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  if (!isPosterTestDbConfigured()) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "DB_NOT_CONFIGURED",
          message: "База данных для личного кабинета не настроена.",
        },
        { status: 503 },
      ),
    };
  }

  const userId = await getPosterTestSessionUserId();
  if (!userId) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: "Войдите в аккаунт, чтобы продолжить.",
        },
        { status: 401 },
      ),
    };
  }

  const user = await getPosterTestUserById(userId);
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "USER_NOT_FOUND",
          message: "Пользователь не найден.",
        },
        { status: 401 },
      ),
    };
  }

  return { user, errorResponse: null };
}

export async function requirePosterTestStaff(): Promise<
  | { user: PosterTestUser; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth;

  if (!isPosterTestMerchantUser({ role: auth.user.role, email: auth.user.email })) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: "Нет доступа к панели заказов.",
        },
        { status: 403 },
      ),
    };
  }

  return auth;
}

export function createAuthSuccessResponse(user: PosterTestUser) {
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

  return NextResponse.json({
    success: true,
    user: serializePosterTestUser(user),
  });
}

export function serializePosterTestUser(user: PosterTestUser) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    email: user.email,
    telegramId: user.telegramId,
    provider: user.provider,
    role: user.role,
    bonusPoints: user.bonusPoints,
    qrSlug: user.qrSlug,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
