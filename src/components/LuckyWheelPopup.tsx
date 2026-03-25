"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WheelOfFortune } from "@/components/WheelOfFortune";
import { WheelResultView } from "@/components/WheelResultView";
import { useBonusScreen } from "@/components/BonusScreenContext";
import {
  canSpin,
  computeSpinOutcome,
  saveSpinOutcome,
  hasPlayedWheelBefore,
  getWheelSegments,
  IS_TEST_MODE,
  resetWheelForTest,
  type SpinOutcome,
} from "@/lib/wheel";
import type { Bonus } from "@/services/bonusService";
import { submitWheelSpinAnalytics } from "@/lib/wheelSpinAnalytics";

type View = "wheel" | "result";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function LuckyWheelPopup({ isOpen, onClose }: Props) {
  const { openBonusScreen } = useBonusScreen();
  const [view, setView] = useState<View>("wheel");
  const [resultOutcome, setResultOutcome] = useState<SpinOutcome | null>(null);
  const [wonBonus, setWonBonus] = useState<Bonus | null>(null);
  const [spinSession, setSpinSession] = useState<{ id: number; outcome: SpinOutcome } | null>(null);
  const [spinActive, setSpinActive] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const sessionIdRef = useRef(0);

  const isFirstWheel = !hasPlayedWheelBefore();
  const segments = getWheelSegments(isFirstWheel);

  const handleClose = useCallback(() => {
    setView("wheel");
    setResultOutcome(null);
    setWonBonus(null);
    setSpinSession(null);
    setSpinActive(false);
    setIsSpinning(false);
    onClose();
  }, [onClose]);

  const handleSpinComplete = useCallback((outcome: SpinOutcome) => {
    let bonus = saveSpinOutcome(outcome);
    if (!bonus && !outcome.isLoss) {
      bonus = saveSpinOutcome(outcome);
    }
    submitWheelSpinAnalytics(outcome);
    setResultOutcome(outcome);
    setWonBonus(bonus ?? null);
    setIsSpinning(false);
    setSpinActive(false);
    setSpinSession(null);
    setView("result");
  }, []);

  const handleStartSpin = useCallback(() => {
    if (!canSpin() || isSpinning) return;
    const outcome = computeSpinOutcome();
    sessionIdRef.current += 1;
    setSpinSession({ id: sessionIdRef.current, outcome });
    setSpinActive(true);
    setIsSpinning(true);
  }, [isSpinning]);

  const handleReset = useCallback(() => {
    resetWheelForTest();
    setResetKey((k) => k + 1);
    setSpinSession(null);
    setSpinActive(false);
    setIsSpinning(false);
  }, []);

  if (!isOpen) return null;

  const allowedToSpin = canSpin();

  return (
    <AnimatePresence>
      <motion.div
        key={resetKey}
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
            aria-label="Назад"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
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
                  Крути колесо - получи бонус
                </h2>
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.12em] text-amber-400/95">
                  Нажми на кнопку КРУТИТЬ
                </p>
              </div>
              <WheelOfFortune
                segments={segments}
                spinSession={spinSession}
                spinActive={spinActive}
                onSpinComplete={handleSpinComplete}
                onSpinClick={handleStartSpin}
                allowedToSpin={allowedToSpin}
                isSpinning={isSpinning}
              />
              {!isSpinning && !allowedToSpin && (
                <p className="mt-4 text-center text-xs text-white/50">
                  {IS_TEST_MODE ? "Крутить можно через 8 сек" : "Крутить можно раз в 24 часа"}
                </p>
              )}
              {!isSpinning && IS_TEST_MODE && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-3 text-center text-xs text-white/40 underline underline-offset-2"
                >
                  Reset (вкл. первый спин)
                </button>
              )}
              {isSpinning && (
                <p className="mt-4 text-center text-xs text-white/50">Выбор сектора…</p>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
