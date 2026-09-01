"use client";

import { useState } from "react";
import { GoogleSignInButton } from "@/components/poster-test/GoogleSignInButton";
import { getAssetUrl } from "@/lib/appVersion";
import { CONFIG } from "@/lib/config";
import { GASTROBAR_LOGO_WIDTH_PX } from "@/lib/appShellLayout";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_BANNER_HEIGHT_PX,
} from "@/lib/posterTestRoutes";
import { useTranslation } from "@/lib/useTranslation";

type PosterTestLoginScreenProps = {
  returnTo?: string;
  errorMessage?: string | null;
};

export function PosterTestLoginScreen({
  returnTo = POSTER_TEST_ACCOUNT_PATH,
  errorMessage = null,
}: PosterTestLoginScreenProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const googleHref = `/api/poster-test/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center px-5 py-10 sm:px-6"
      style={{
        paddingTop: `calc(${POSTER_TEST_BANNER_HEIGHT_PX}px + env(safe-area-inset-top, 0px) + 2rem)`,
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-5%,rgba(248,214,109,0.14),transparent_58%),radial-gradient(ellipse_60%_45%_at_100%_100%,rgba(127,180,255,0.08),transparent_50%)]"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-8 sm:py-10">
          <div className="mb-8 flex justify-center">
            <img
              src={getAssetUrl(CONFIG.logoSrc)}
              alt="GASTROBAR"
              width={GASTROBAR_LOGO_WIDTH_PX}
              height={64}
              className="h-14 w-auto max-w-[min(220px,70vw)] object-contain drop-shadow-[0_2px_24px_rgba(0,0,0,0.75)]"
              draggable={false}
            />
          </div>

          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("poster_test_bonuses_heading")}
            </p>
            <h1 className="mt-3 text-[1.65rem] font-semibold leading-tight tracking-tight text-white sm:text-[1.75rem]">
              {t("poster_test_login_title")}
            </h1>
            <p className="mt-4 text-sm leading-[1.65] text-white/58 sm:text-[15px]">
              {t("poster_test_login_subtitle")}
            </p>
          </div>

          {errorMessage ? (
            <p
              className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm leading-relaxed text-red-100"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-8">
            <GoogleSignInButton
              href={googleHref}
              loading={loading}
              onClick={() => setLoading(true)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
