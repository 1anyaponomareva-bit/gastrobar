"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import {
  BONUS_WHEEL_FULL_TURNS,
  computeRotationTargetDegrees,
  type SpinOutcome,
  type WheelSegmentData,
} from "@/lib/wheel";

/** Только полное колесо в модалке; FAB использует другой файл (fab-wheel-reference.png). */
const WHEEL_IMAGE_SRC = "/images/bonus-wheel.png";

/** Размер колеса на экране (крупнее на телефоне). */
const WHEEL_SIZE = "min(92vw, 400px)";

/** Длительность одного спина — дольше = заметнее финальное замедление. */
const SPIN_DURATION_SEC = 5.8;

/**
 * Ease-out: быстрый старт, долгое плавное замедление к стопу (стрелка «выбирает» сектор).
 * cubic-bezier с крутым началом и пологим концом.
 */
const SPIN_EASE: [number, number, number, number] = [0.12, 0.78, 0.18, 1];

type Props = {
  segments: readonly WheelSegmentData[];
  spinSession: { id: number; outcome: SpinOutcome } | null;
  spinActive: boolean;
  onSpinComplete: (outcome: SpinOutcome) => void;
  onSpinClick: () => void;
  allowedToSpin: boolean;
  isSpinning: boolean;
};

function WheelImageFallback() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#1a0a0f] p-6 text-center"
      style={{
        background:
          "conic-gradient(from -90deg at 50% 50%, #6b1520 0deg 45deg, #f0e6d8 45deg 90deg, #6b1520 90deg 135deg, #f0e6d8 135deg 180deg, #6b1520 180deg 225deg, #f0e6d8 225deg 270deg, #6b1520 270deg 315deg, #f0e6d8 315deg 360deg)",
      }}
    >
      <p className="text-[11px] font-semibold uppercase leading-tight text-white/90 drop-shadow">
        Добавьте файл
        <br />
        <span className="font-mono text-amber-200/90">public/images/bonus-wheel.png</span>
      </p>
    </div>
  );
}

export function WheelOfFortune({
  segments,
  spinSession,
  spinActive,
  onSpinComplete,
  onSpinClick,
  allowedToSpin,
  isSpinning,
}: Props) {
  const sectorCount = segments.length;
  const rotation = useMotionValue(0);
  const lastRotationRef = useRef(0);
  const completedSessionRef = useRef<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const clearCompleted = useCallback(() => {
    completedSessionRef.current = null;
  }, []);

  useEffect(() => {
    if (!spinSession) {
      clearCompleted();
    }
  }, [spinSession, clearCompleted]);

  useEffect(() => {
    if (!spinActive || !spinSession) return;

    const sessionId = spinSession.id;
    const outcome = spinSession.outcome;
    completedSessionRef.current = null;

    const target = computeRotationTargetDegrees(
      lastRotationRef.current,
      outcome.segmentIndex,
      sectorCount,
      BONUS_WHEEL_FULL_TURNS
    );

    let cancelled = false;

    const controls = animate(rotation, target, {
      duration: SPIN_DURATION_SEC,
      ease: SPIN_EASE,
      onComplete: () => {
        if (cancelled) return;
        if (completedSessionRef.current === sessionId) return;
        completedSessionRef.current = sessionId;
        lastRotationRef.current = target;
        onSpinComplete(outcome);
      },
    });

    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [spinActive, spinSession, sectorCount, rotation, onSpinComplete]);

  return (
    <div className="relative flex max-w-[100vw] flex-col items-center overflow-x-hidden px-1">
      {/* Один контейнер: стрелка absolute — кончик на ободе крутящегося круга (не «в воздухе») */}
      <div
        className="relative mx-auto shrink-0"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          maxWidth: "100%",
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 z-30 w-[clamp(2rem,10vw,2.5rem)]"
          style={{
            /* Ниже верха блока: у PNG с object-contain обод визуально ниже края контейнера */
            top: "clamp(0.4rem, 2.2vw, 0.85rem)",
            transform:
              "translate(-50%, calc(-100% + clamp(1.05rem, 6.5vw, 2rem)))",
          }}
          aria-hidden
        >
          <svg viewBox="0 0 40 28" className="h-auto w-full drop-shadow-md">
            <path
              d="M20 26 L4 4 Q20 -2 36 4 Z"
              fill="#C4A35A"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="1"
            />
          </svg>
        </div>

        <div
          className="relative z-10 flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/30"
          style={{
            boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
          }}
        >
          {/* Обводка по границе клипа вращающегося круга (совпадает с motion.div) */}
          <div
            className="pointer-events-none absolute inset-0 z-[15] rounded-full border border-[rgba(196,163,90,0.35)]"
            aria-hidden
          />

          <motion.div
            className="relative z-10 h-full w-full overflow-hidden rounded-full"
            style={{
              rotate: rotation,
              transformOrigin: "50% 50%",
              contain: "paint",
            }}
          >
            {imageFailed ? (
              <WheelImageFallback />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- локальный арт; при 404 показываем fallback
              <img
                src={WHEEL_IMAGE_SRC}
                alt=""
                width={400}
                height={400}
                decoding="async"
                loading="eager"
                className="block h-full w-full max-h-full max-w-full object-contain select-none"
                draggable={false}
                onError={() => setImageFailed(true)}
              />
            )}
          </motion.div>

          <button
            type="button"
            onClick={() => {
              if (!isSpinning && allowedToSpin) onSpinClick();
            }}
            disabled={isSpinning || !allowedToSpin}
            className="absolute left-1/2 top-1/2 z-30 flex h-[72px] w-[72px] max-h-[26%] max-w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            aria-label="Крутить колесо"
            style={{ cursor: allowedToSpin && !isSpinning ? "pointer" : "default" }}
          />
        </div>
      </div>
    </div>
  );
}
