"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Image from "next/image";
import { motion, useMotionValue, animate } from "framer-motion";
import {
  BONUS_WHEEL_FULL_TURNS,
  computeRotationTargetDegrees,
  reconcileOutcomeWithRotation,
  type SpinOutcome,
  type WheelSegmentData,
} from "@/lib/wheel";

/** Локальный арт из `public/koleso.png` (абсолютный путь от корня сайта). */
const WHEEL_IMAGE_SRC = "/koleso.png" as const;

/** Размер колеса на экране (крупнее на телефоне). */
const WHEEL_SIZE = "min(92vw, 400px)";

/** Длительность одного спина */
const SPIN_DURATION_SEC = 5.5;

/** Плавное замедление к стопу, без «рывков» — только вращение вокруг центра */
const SPIN_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Лёгкое покачивание до нажатия «Крутить» */
const IDLE_WOBBLE_DEG = 1.8;
const IDLE_DURATION_SEC = 5.2;

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
        <span className="font-mono text-amber-200/90">public/koleso.png</span>
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

  const idleEnabled = !spinActive && !isSpinning;

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
    const snappedTarget = Math.round(target * 1000) / 1000;

    let cancelled = false;

    const controls = animate(rotation, target, {
      duration: SPIN_DURATION_SEC,
      ease: SPIN_EASE,
      onComplete: () => {
        if (cancelled) return;
        if (completedSessionRef.current === sessionId) return;
        completedSessionRef.current = sessionId;
        rotation.set(snappedTarget);
        lastRotationRef.current = snappedTarget;
        onSpinComplete(reconcileOutcomeWithRotation(outcome, snappedTarget));
      },
    });

    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [spinActive, spinSession, sectorCount, rotation, onSpinComplete]);

  return (
    <div className="relative flex max-w-[100vw] flex-col items-center overflow-x-hidden px-1">
      <div
        className="relative mx-auto shrink-0"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          maxWidth: "100%",
        }}
      >
        {/* Круг: обрезка по окружности — колесо не «выкатывается» за край */}
        <div
          className="relative isolate z-10 flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0a0a0a] ring-1 ring-white/10"
          style={{
            boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
          }}
        >
          {/* Лёгкое покачивание до спина; вращение спина внутри, относительно центра */}
          <motion.div
            className="flex h-full w-full items-center justify-center"
            style={{ transformOrigin: "50% 50%" }}
            animate={
              idleEnabled
                ? { rotate: [0, IDLE_WOBBLE_DEG, 0, -IDLE_WOBBLE_DEG, 0] }
                : { rotate: 0 }
            }
            transition={{
              duration: IDLE_DURATION_SEC,
              repeat: idleEnabled ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            <motion.div
              className="relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-full"
              style={{
                rotate: rotation,
                transformOrigin: "50% 50%",
              }}
            >
              {imageFailed ? (
                <WheelImageFallback />
              ) : (
                <Image
                  src={WHEEL_IMAGE_SRC}
                  alt="Колесо удачи"
                  fill
                  unoptimized
                  priority
                  sizes="min(92vw, 400px)"
                  className="pointer-events-none select-none object-contain object-center"
                  onError={() => setImageFailed(true)}
                />
              )}
            </motion.div>
          </motion.div>

          {/* Клик по колесу — без круга и надписи поверх картинки */}
          <button
            type="button"
            onClick={() => {
              if (!isSpinning && allowedToSpin) onSpinClick();
            }}
            disabled={isSpinning || !allowedToSpin}
            className={`absolute inset-0 z-20 rounded-full border-0 bg-transparent p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] ${
              isSpinning || !allowedToSpin
                ? "cursor-not-allowed"
                : "cursor-pointer"
            }`}
            aria-label="Крутить колесо"
          />
        </div>

        {/* Стрелка ниже, кончик на ободе картинки */}
        <div
          className="pointer-events-none absolute left-1/2 z-40 w-[clamp(2rem,9vw,2.75rem)] -translate-x-1/2"
          style={{
            top: "clamp(10px, 3.5%, 20px)",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))",
          }}
          aria-hidden
        >
          <svg viewBox="0 0 48 36" className="block h-auto w-full" preserveAspectRatio="xMidYMax meet">
            <path
              d="M24 34 L6 6 Q24 -1 42 6 Z"
              fill="#d4a84b"
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="1.25"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
