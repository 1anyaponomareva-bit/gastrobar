"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Bonus, BonusStatus } from "@/services/bonusService";
import {
  getBonusStatus,
  getCurrentBonus,
  redeemBonus,
  formatRemainingTime,
  isBonusExpired,
  removeActiveBonus,
  getBonusDescription,
} from "@/services/bonusService";
import { BONUS_VALIDITY_LABEL } from "@/lib/bonusCopy";

const HOLD_DURATION_MS = 1800; // 1.8 сек long press

const STATUS_LABELS: Record<BonusStatus, string> = {
  active: "Активен",
  redeemed: "Использован",
  expired: "Сгорел",
};


type Props = { bonus: Bonus; onClose: () => void };

export function BonusShowScreen({ bonus: initialBonus, onClose }: Props) {
  const [bonus, setBonus] = useState(initialBonus);
  const status = getBonusStatus(bonus);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = status === "active";

  useEffect(() => {
    const current = getCurrentBonus();
    if (current && current.id === bonus.id) setBonus(current);
  }, [bonus.id]);

  // Live timer из bonus.expiresAt (после reload таймер продолжает корректно)
  useEffect(() => {
    const tick = () => {
      const current = getCurrentBonus();
      if (current && current.id === bonus.id) setBonus(current);
      if (isBonusExpired(initialBonus)) removeActiveBonus();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [initialBonus.expiresAt, initialBonus.id, bonus.id]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(() => {
    if (!isActive || status !== "active") return;
    cancelHold();
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - (holdStartRef.current ?? 0);
      const p = Math.min(1, elapsed / HOLD_DURATION_MS);
      setHoldProgress(p);
      if (p >= 1) {
        cancelHold();
        setShowConfirmModal(true);
      }
    }, 50);
  }, [isActive, status, cancelHold]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const handleConfirmRedeem = useCallback(() => {
    redeemBonus(bonus.id);
    const current = getCurrentBonus();
    if (current) setBonus(current);
    setShowConfirmModal(false);
  }, [bonus.id]);

  const isHolding = holdProgress > 0 && holdProgress < 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1200] flex flex-col items-center justify-center overflow-y-auto bg-[#0b0b0b]"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(30,26,20,0.6) 0%, #0b0b0b 60%)",
      }}
    >
      {/* Кнопка закрытия */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex justify-end px-4 py-3"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 8px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Закрыть"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Центральный блок — premium pass */}
      <div
        className="relative mx-4 mt-4 mb-40 w-full max-w-sm shrink-0 rounded-3xl border border-amber-500/40 px-6 py-8 shadow-[0_0_48px_rgba(212,175,55,0.08)]"
        style={{
          marginTop: "max(3.5rem, calc(env(safe-area-inset-top) + 2.5rem))",
          background:
            "linear-gradient(180deg, rgba(26,24,22,0.95) 0%, rgba(15,14,13,0.98) 100%)",
        }}
      >
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/75">
          Бонус
        </p>
        <h1 className="mt-2 text-center text-xl font-bold leading-snug text-white sm:text-2xl">
          {bonus.title}
        </h1>
        <p className="mt-3 text-center text-sm text-white/55">
          Покажи этот экран бармену
        </p>

        <p className="mt-5 text-center text-[15px] leading-relaxed text-white/78">
          {bonus.description ?? getBonusDescription(bonus.type, bonus.productId)}
        </p>
        <p className="mt-2 text-center text-xs text-amber-500/70">
          Действует 2 часа
        </p>

        {isActive && (
          <p className="mt-4 text-center font-mono text-2xl tabular-nums text-amber-400/95">
            Осталось {formatRemainingTime(initialBonus.expiresAt)}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-amber-500/35 bg-black/50 px-5 py-5">
          <p className="text-center text-[10px] uppercase tracking-widest text-white/50">
            Код бонуса
          </p>
          <p className="mt-2 text-center font-mono text-3xl font-bold tracking-[0.25em] text-amber-400">
            {bonus.id}
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <span
            className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${
              status === "active"
                ? "bg-amber-500/20 text-amber-400"
                : status === "redeemed"
                  ? "bg-white/10 text-white/50"
                  : "bg-red-950/40 text-red-400/90"
            }`}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>

        {status === "redeemed" && (
          <p className="mt-4 text-center text-sm text-white/40">
            Бонус погашен
          </p>
        )}

        {status === "expired" && (
          <p className="mt-4 text-center text-sm text-white/40">
            Время действия истекло
          </p>
        )}
      </div>

      {/* Нижняя зона — отступ сверху, чтобы не заходить на карточку */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 px-4 pb-6 pt-6"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          minHeight: "140px",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full border border-amber-500/50 bg-transparent py-3.5 font-semibold text-amber-400"
        >
          Закрыть
        </button>

        {/* Зона погашения для персонала: long press */}
        {isActive && (
          <div className="flex flex-col items-center gap-1.5">
            <div
              role="button"
              tabIndex={0}
              className="relative w-full max-w-[200px] overflow-hidden rounded-xl border border-white/15 bg-white/5 py-2.5"
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              onTouchCancel={cancelHold}
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              aria-label="Удерживайте для погашения бонуса"
            >
              {/* Линейный прогресс удержания */}
              <div
                className="absolute inset-y-0 left-0 bg-amber-500/25 transition-[width] duration-75"
                style={{ width: `${holdProgress * 100}%` }}
              />
              <p className="relative z-10 text-center text-sm font-medium text-white/70">
                {isHolding
                  ? "Удерживайте для погашения"
                  : "Погасить бонус"}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-white/30">
              Для персонала
            </span>
          </div>
        )}
      </div>

      {/* Модал подтверждения погашения */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
            }}
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-[#141414] p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-center text-lg font-semibold text-white">
                Погасить бонус?
              </h3>
              <p className="mt-2 text-center text-sm text-white/60">
                После подтверждения бонус нельзя будет использовать повторно.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 rounded-full border border-white/25 py-3 font-semibold text-white/90"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRedeem}
                  className="flex-1 rounded-full bg-amber-500 py-3 font-semibold text-black"
                >
                  Подтвердить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
