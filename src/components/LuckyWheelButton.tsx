"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { BonusRibbonTimer } from "@/components/BonusRibbonTimer";
import { getAssetUrl } from "@/lib/appVersion";
import { useTranslation } from "@/lib/useTranslation";

/** Иконка колеса справа: `public/fab-wheel-reference.png` */
const FAB_WHEEL_SRC = "/fab-wheel-reference.png";

const FAB_WHEEL_ROTATION_SEC = 36;

type Props = {
  onClick: () => void;
  hasBonus: boolean;
  remainingTime: string;
};

export function LuckyWheelButton({ onClick, hasBonus, remainingTime }: Props) {
  const { t } = useTranslation();
  const [baseError, setBaseError] = useState(false);

  const showFallbackGradient = baseError;
  const showRibbon = hasBonus && Boolean(remainingTime);

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed z-[1020] inline-flex w-max max-w-[min(8rem,100vw)] flex-col items-center justify-end bg-transparent p-0 transition-transform active:scale-[0.98]"
      style={{
        bottom: showRibbon
          ? "var(--fab-bottom-nav-stack-ribbon)"
          : "var(--fab-bottom-nav-stack)",
        right: "max(16px, env(safe-area-inset-right, 0px) + 16px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      }}
      aria-label={
        hasBonus
          ? remainingTime
            ? t("wheel_fab_aria_open_bonus_left").replace("{time}", remainingTime)
            : t("wheel_fab_aria_open_bonus")
          : t("wheel_fab_aria_spin")
      }
    >
      <div className="flex flex-col items-center">
        <div className="relative h-16 w-16 max-h-[64px] max-w-[64px] shrink-0 overflow-visible">
          <span
            className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full ${
              hasBonus
                ? "bg-[#2a0a0f] ring-2 ring-amber-400/55"
                : "bg-black/20 ring-1 ring-amber-500/40"
            }`}
          >
            {!showFallbackGradient ? (
              <motion.div
                className="h-full w-full"
                style={{ transformOrigin: "50% 50%" }}
                animate={{ rotate: 360 }}
                transition={{
                  duration: FAB_WHEEL_ROTATION_SEC,
                  repeat: Infinity,
                  ease: "linear",
                }}
                aria-hidden
              >
                <Image
                  src={getAssetUrl(FAB_WHEEL_SRC)}
                  alt=""
                  width={128}
                  height={128}
                  unoptimized
                  className="h-full w-full select-none rounded-full object-cover"
                  draggable={false}
                  priority={hasBonus}
                  onError={() => setBaseError(true)}
                />
              </motion.div>
            ) : (
              <motion.div
                className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#5c1522] via-[#3a0f18] to-[#240810] text-lg font-bold text-amber-400/90 ring-1 ring-amber-500/40"
                style={{ transformOrigin: "50% 50%" }}
                animate={{ rotate: 360 }}
                transition={{
                  duration: FAB_WHEEL_ROTATION_SEC,
                  repeat: Infinity,
                  ease: "linear",
                }}
                aria-hidden
              >
                %
              </motion.div>
            )}
          </span>
          {showRibbon ? (
            <div className="pointer-events-none absolute left-1/2 top-full z-20 -translate-x-1/2 -translate-y-[42%]">
              <BonusRibbonTimer
                time={remainingTime}
                className="pointer-events-auto"
              />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
