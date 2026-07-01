"use client";

import { useState } from "react";
import { POSTER_TEST_ACCOUNT_PATH } from "@/lib/posterTestRoutes";

type PosterTestLoginScreenProps = {
  title?: string;
  subtitle?: string;
  returnTo?: string;
  compact?: boolean;
};

export function PosterTestLoginScreen({
  title = "Войдите в аккаунт",
  subtitle = "Войдите через Google, чтобы открыть личный кабинет.",
  returnTo = POSTER_TEST_ACCOUNT_PATH,
  compact = false,
}: PosterTestLoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const googleHref = `/api/poster-test/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div
      className={
        compact
          ? "space-y-4"
          : "mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-8"
      }
    >
      <div className={compact ? "" : "text-center"}>
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">Личный кабинет</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">{subtitle}</p>
      </div>

      <a
        href={googleHref}
        onClick={() => setLoading(true)}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90"
      >
        <span aria-hidden="true">G</span>
        {loading ? "Переход в Google..." : "Continue with Google"}
      </a>
    </div>
  );
}
