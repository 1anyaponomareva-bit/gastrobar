"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Bonus } from "@/services/bonusService";
import {
  formatRemainingTime,
  getBonusStatus,
  isBonusExpired,
  saveActiveBonus,
} from "@/services/bonusService";
import { bonusDisplayDescriptionT, bonusDisplayTitleT } from "@/lib/bonusCopyI18n";
import type { BonusTypeKey } from "@/lib/bonusCopy";
import { useBonusScreen } from "@/components/BonusScreenContext";
import { usePosterTestWheelScope } from "@/components/poster-test/PosterTestWheelScopeContext";
import { formatWheelCooldownRemaining } from "@/lib/wheel";
import { POSTER_TEST_BAR_PATH } from "@/lib/posterTestRoutes";
import { useTranslation } from "@/lib/useTranslation";
import { PosterTestWheelTestResetButton } from "@/components/poster-test/PosterTestWheelTestResetButton";
import { clearPosterTestWheelClientState } from "@/lib/posterTestWheelClientReset";

type WheelStatusResponse = {
  success: boolean;
  canSpin?: boolean;
  msUntilNextSpin?: number;
  activeBonus?: Bonus | null;
  testMode?: boolean;
};

export function PosterTestWheelBonusCard() {
  const { t, lang } = useTranslation();
  const { openBonusScreen } = useBonusScreen();
  const { scope } = usePosterTestWheelScope();
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [canSpin, setCanSpin] = useState(false);
  const [msUntilNext, setMsUntilNext] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);

  const syncLocalBonus = useCallback(
    (nextBonus: Bonus | null) => {
      if (!scope?.activeBonusStorageKey) return;
      if (nextBonus) saveActiveBonus(nextBonus, scope.activeBonusStorageKey);
    },
    [scope?.activeBonusStorageKey],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/poster-test/wheel", { cache: "no-store" });
      const data = (await response.json()) as WheelStatusResponse;
      if (!data.success) return;
      const activeBonus = data.activeBonus ?? null;
      setBonus(activeBonus);
      setCanSpin(Boolean(data.canSpin));
      setMsUntilNext(data.msUntilNextSpin ?? 0);
      setTestMode(Boolean(data.testMode));
      syncLocalBonus(activeBonus);
    } finally {
      setLoading(false);
    }
  }, [syncLocalBonus]);

  const handleTestReset = useCallback(async () => {
    if (!testMode || resetting) return;
    setResetting(true);
    try {
      const response = await fetch("/api/poster-test/wheel", { method: "DELETE" });
      const data = (await response.json()) as WheelStatusResponse;
      if (!data.success) return;
      clearPosterTestWheelClientState({
        activeBonusStorageKey: scope?.activeBonusStorageKey,
        wheelStorageKeys: scope?.wheelStorageKeys,
      });
      setBonus(null);
      setCanSpin(true);
      setMsUntilNext(0);
      await refresh();
    } finally {
      setResetting(false);
    }
  }, [refresh, resetting, scope, testMode]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!bonus) return;
    const timer = setInterval(() => {
      if (isBonusExpired(bonus)) {
        setBonus(null);
        return;
      }
      setMsUntilNext((value) => Math.max(0, value - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [bonus]);

  if (loading) {
    return (
      <div className="poster-test-wheel-bonus-card rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/50">
        {t("poster_test_wheel_loading")}
      </div>
    );
  }

  if (bonus && getBonusStatus(bonus) === "active") {
    const title = bonusDisplayTitleT(t, bonus.type as BonusTypeKey, bonus.productId ?? null, lang);
    const description = bonusDisplayDescriptionT(
      t,
      bonus.type as BonusTypeKey,
      bonus.productId ?? null,
      lang,
    );

    return (
      <div className="poster-test-wheel-bonus-card rounded-[24px] border border-amber-300/25 bg-amber-300/[0.08] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
          {t("poster_test_wheel_prize_title")}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{description}</p>
        <p className="mt-3 text-xs text-white/45">
          {t("bonus_card_show_bartender")} · {t("valid_for").replace("{hours}", formatRemainingTime(bonus.expiresAt))}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => openBonusScreen(bonus)}
            className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-black"
          >
            {t("show_to_bartender")}
          </button>
          <Link
            href={POSTER_TEST_BAR_PATH}
            className="flex items-center justify-center rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/85"
          >
            {t("bar")}
          </Link>
        </div>
        {testMode ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-500/20 pt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/70">
              {t("poster_test_wheel_test_mode")}
            </span>
            <PosterTestWheelTestResetButton onReset={handleTestReset} disabled={resetting} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="poster-test-wheel-bonus-card rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <p className="text-sm text-white/65">{t("poster_test_wheel_no_prize")}</p>
      {canSpin ? (
        <p className="mt-2 text-sm text-amber-200/90">{t("poster_test_wheel_can_spin")}</p>
      ) : msUntilNext > 0 ? (
        <p className="mt-2 text-sm text-white/50">
          {t("poster_test_wheel_next_spin")}:{" "}
          <span className="font-mono text-amber-200/90">{formatWheelCooldownRemaining(msUntilNext)}</span>
        </p>
      ) : null}
      {testMode ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-500/20 pt-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/70">
            {t("poster_test_wheel_test_mode")}
          </span>
          <PosterTestWheelTestResetButton onReset={handleTestReset} disabled={resetting} />
        </div>
      ) : null}
    </div>
  );
}
