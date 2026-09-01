import type { Metadata } from "next";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { PosterTestLoginScreen } from "@/components/poster-test/PosterTestLoginScreen";
import { POSTER_TEST_ACCOUNT_PATH } from "@/lib/posterTestRoutes";

export const metadata: Metadata = {
  title: "Вход — Poster test",
  robots: { index: false, follow: false },
};

function formatLoginError(error: string): string {
  switch (error) {
    case "google_cancelled":
      return "Вход через Google отменён.";
    case "google_failed":
      return "Google не вернул профиль. Проверьте redirect URI в Google Cloud Console.";
    case "db_not_configured":
      return "На сервере не настроена база (SUPABASE_SERVICE_ROLE_KEY).";
    case "db_schema_missing":
      return "Таблица аккаунтов не создана в Supabase. Нужно выполнить миграцию poster_test_users.";
    case "auth_secret_missing":
      return "На сервере не настроен POSTER_TEST_AUTH_SECRET (минимум 32 символа).";
    case "user_create_failed":
      return "Не удалось сохранить пользователя в базе. Попробуйте снова или обратитесь к администратору.";
    default:
      return `Не удалось войти (${error.replaceAll("_", " ")}). Попробуйте снова.`;
  }
}

export default async function PosterTestLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo =
    params.returnTo && params.returnTo.startsWith("/poster-test")
      ? params.returnTo
      : POSTER_TEST_ACCOUNT_PATH;

  return (
    <>
      <PosterTestLoginScreen
        returnTo={returnTo}
        errorMessage={params.error ? formatLoginError(params.error) : null}
      />
      <PosterTestBottomNav />
    </>
  );
}
