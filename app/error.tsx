"use client";

import { useTranslation } from "@/lib/useTranslation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-white">
      <h2 className="text-lg font-semibold mb-2">{t("app_error_title")}</h2>
      <p className="text-white/70 text-sm text-center mb-6">
        {error.message || t("app_error_body_fallback")}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20"
      >
        {t("app_error_retry")}
      </button>
    </div>
  );
}
