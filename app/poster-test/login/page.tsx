import type { Metadata } from "next";
import { PosterTestLoginScreen } from "@/components/poster-test/PosterTestLoginScreen";
import { POSTER_TEST_ACCOUNT_PATH } from "@/lib/posterTestRoutes";

export const metadata: Metadata = {
  title: "Вход — Poster test",
  robots: { index: false, follow: false },
};

function formatLoginError(error: string): string {
  const label = error.replaceAll("_", " ");
  return `Не удалось войти (${label}). Попробуйте снова.`;
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
    <PosterTestLoginScreen
      returnTo={returnTo}
      errorMessage={params.error ? formatLoginError(params.error) : null}
    />
  );
}
