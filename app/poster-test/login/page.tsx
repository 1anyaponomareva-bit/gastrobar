import type { Metadata } from "next";
import { PosterTestLoginScreen } from "@/components/poster-test/PosterTestLoginScreen";
import { POSTER_TEST_ACCOUNT_PATH } from "@/lib/posterTestRoutes";

export const metadata: Metadata = {
  title: "Вход — Poster test",
  robots: { index: false, follow: false },
};

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
    <PosterTestLoginScreen
      returnTo={returnTo}
      subtitle={
        params.error
          ? `Ошибка входа: ${params.error.replaceAll("_", " ")}`
          : "Войдите через Google, чтобы открыть личный кабинет."
      }
    />
  );
}
