"use client";

import { readStoredAppLang, translate, type AppLang } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";

function docLangFor(lang: AppLang) {
  return lang === "vn" ? "vi" : lang;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<AppLang>(() => readStoredAppLang());
  const t = useCallback((k: string) => translate(lang, k), [lang]);

  useEffect(() => {
    setLang(readStoredAppLang());
  }, []);

  return (
    <html lang={docLangFor(lang)} suppressHydrationWarning>
      <body className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-6 text-white font-sans antialiased">
        <h1 className="text-xl font-semibold mb-2">{t("app_error_title")}</h1>
        <p className="text-white/70 text-sm text-center mb-6">
          {error?.message && error.message.length > 0
            ? error.message
            : t("app_error_body_fallback")}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20 transition-colors"
        >
          {t("app_error_refresh")}
        </button>
      </body>
    </html>
  );
}
