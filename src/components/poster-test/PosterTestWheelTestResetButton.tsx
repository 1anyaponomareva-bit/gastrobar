"use client";

import { useTranslation } from "@/lib/useTranslation";

type Props = {
  onReset: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function PosterTestWheelTestResetButton({ onReset, disabled, className = "" }: Props) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => void onReset()}
      disabled={disabled}
      className={`rounded-full border border-dashed border-amber-500/45 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-200/90 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {t("poster_test_wheel_reset")}
    </button>
  );
}
