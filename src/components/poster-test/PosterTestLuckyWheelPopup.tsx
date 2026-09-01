"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WheelOfFortune } from "@/components/WheelOfFortune";
import { WheelResultView } from "@/components/WheelResultView";
import { useBonusScreen } from "@/components/BonusScreenContext";
import {
  getWheelSegments,
  formatWheelCooldownRemaining,
  type SpinOutcome,
} from "@/lib/wheel";
import type { Bonus } from "@/services/bonusService";
import { syncPosterTestActiveBonus } from "@/lib/posterTestWheelClientReset";
import { useTranslation } from "@/lib/useTranslation";
import { PosterTestWheelTestResetButton } from "@/components/poster-test/PosterTestWheelTestResetButton";

type View = "wheel" | "result";

type WheelStatusResponse = {
  success: boolean;
  canSpin?: boolean;
  msUntilNextSpin?: number;
  activeBonus?: Bonus | null;
};

type WheelSpinResponse = {
  success: boolean;
  outcome?: SpinOutcome;
  bonus?: Bonus | null;
  msUntilNextSpin?: number;
  error?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  activeBonusStorageKey?: string;
  onStatusChange?: () => void;
  testMode?: boolean;
  onTestReset?: () => void | Promise<void>;
};

export function PosterTestLuckyWheelPopup({
  isOpen,
  onClose,
  activeBonusStorageKey,
  onStatusChange,
  testMode = false,
  onTestReset,
}: Props) {
  const { t } = useTranslation();
  const { openBonusScreen } = useBonusScreen();
  const [view, setView] = useState<View>("wheel");
  const [resultOutcome, setResultOutcome] = useState<SpinOutcome | null>(null);
  const [wonBonus, setWonBonus] = useState<Bonus | null>(null);
  const [spinSession, setSpinSession] = useState<{ id: number; outcome: SpinOutcome } | null>(null);
  const [spinActive, setSpinActive] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [allowedToSpin, setAllowedToSpin] = useState(false);
  const [msUntilNext, setMsUntilNext] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [resetting, setResetting] = useState(false);
  const sessionIdRef = useRef(0);

  const segments = getWheelSegments(true);

  const syncLocalBonus = useCallback(
    (bonus: Bonus | null) => {
      syncPosterTestActiveBonus(bonus, activeBonusStorageKey);
    },
    [activeBonusStorageKey],
  );

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch("/api/poster-test/wheel", { cache: "no-store" });
      const data = (await response.json()) as WheelStatusResponse;
      if (data.success) {
        setAllowedToSpin(Boolean(data.canSpin));
        setMsUntilNext(data.msUntilNextSpin ?? 0);
        syncLocalBonus(data.activeBonus ?? null);
      }
    } finally {
      setLoadingStatus(false);
    }
  }, [syncLocalBonus]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshStatus();
    const timer = setInterval(() => {
      setMsUntilNext((current) => Math.max(0, current - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, refreshStatus]);

  const handleClose = useCallback(() => {
    setView("wheel");
    setResultOutcome(null);
    setWonBonus(null);
    setSpinSession(null);
    setSpinActive(false);
    setIsSpinning(false);
    onClose();
    onStatusChange?.();
  }, [onClose, onStatusChange]);

  const handleSpinComplete = useCallback(
    (outcome: SpinOutcome) => {
      setResultOutcome(outcome);
      setIsSpinning(false);
      setSpinActive(false);
      setSpinSession(null);
      setView("result");
      onStatusChange?.();
    },
    [onStatusChange],
  );

  const handleStartSpin = useCallback(async () => {
    if (isSpinning || !allowedToSpin) return;
    setIsSpinning(true);

    try {
      const response = await fetch("/api/poster-test/wheel", { method: "POST" });
      const data = (await response.json()) as WheelSpinResponse;

      if (!data.success || !data.outcome) {
        setIsSpinning(false);
        if (data.error === "COOLDOWN") {
          setAllowedToSpin(false);
          setMsUntilNext(data.msUntilNextSpin ?? 0);
        }
        return;
      }

      const bonus = data.bonus ?? null;
      setWonBonus(bonus);
      syncLocalBonus(bonus);
      setAllowedToSpin(false);
      setMsUntilNext(data.msUntilNextSpin ?? 0);

      sessionIdRef.current += 1;
      setSpinSession({ id: sessionIdRef.current, outcome: data.outcome });
      setSpinActive(true);
    } catch {
      setIsSpinning(false);
    }
  }, [allowedToSpin, isSpinning, syncLocalBonus]);

  const handleTestReset = useCallback(async () => {
    if (!testMode || resetting) return;
    setResetting(true);
    try {
      await onTestReset?.();
      setView("wheel");
      setResultOutcome(null);
      setWonBonus(null);
      setSpinSession(null);
      setSpinActive(false);
      setIsSpinning(false);
      setAllowedToSpin(true);
      setMsUntilNext(0);
      await refreshStatus();
      onStatusChange?.();
    } finally {
      setResetting(false);
    }
  }, [onStatusChange, onTestReset, refreshStatus, resetting, testMode]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="wheel-popup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1200] flex flex-col bg-[#0a0a0a]"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div
          className="relative z-[1210] flex shrink-0 items-center border-b border-white/5 bg-[#0a0a0a]/98 px-4 py-3"
          style={{ paddingTop: "max(0.85rem, calc(env(safe-area-inset-top) + 6px))" }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-500/50 bg-white/10 text-amber-400"
            aria-label={t("back")}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          {testMode ? (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/70">
                {t("poster_test_wheel_test_mode")}
              </span>
              <PosterTestWheelTestResetButton
                onReset={handleTestReset}
                disabled={resetting || isSpinning}
              />
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
          {view === "result" && resultOutcome ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-sm rounded-2xl bg-white/5"
            >
              <WheelResultView
                outcome={resultOutcome}
                bonus={wonBonus}
                onClose={handleClose}
                onAction={(action) => {
                  if (action === "menu") handleClose();
                }}
                onShowToBartender={openBonusScreen}
              />
            </motion.div>
          ) : (
            <motion.div
              key="wheel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 max-w-[min(92vw,24rem)] text-center">
                <h2 className="text-lg font-semibold tracking-wide text-white/95">
                  {t("wheel_popup_title")}
                </h2>
                <p className="mt-1.5 text-xs text-white/50">{t("wheel_popup_cooldown_rule")}</p>
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.12em] text-amber-400/95">
                  {t("wheel_popup_tap_to_spin")}
                </p>
              </div>
              <WheelOfFortune
                segments={segments}
                spinSession={spinSession}
                spinActive={spinActive}
                onSpinComplete={handleSpinComplete}
                onSpinClick={() => void handleStartSpin()}
                allowedToSpin={allowedToSpin && !loadingStatus}
                isSpinning={isSpinning}
              />
              {!isSpinning && !allowedToSpin && msUntilNext > 0 ? (
                <div className="mt-5 w-full max-w-sm text-center">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
                    {t("wheel_popup_next_spin")}
                  </p>
                  <p
                    className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-amber-300/95"
                    aria-live="polite"
                  >
                    {formatWheelCooldownRemaining(msUntilNext)}
                  </p>
                  {testMode ? (
                    <div className="mt-4">
                      <PosterTestWheelTestResetButton
                        onReset={handleTestReset}
                        disabled={resetting}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {isSpinning ? (
                <p className="mt-4 text-center text-xs text-white/50">{t("wheel_popup_selecting")}</p>
              ) : null}
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
