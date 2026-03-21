"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

/**
 * Иконка кнопки в меню — отдельный файл, не то же изображение, что колесо в попапе (bonus-wheel.png).
 * Положите свой макет в public/images/fab-wheel-reference.png
 */
const WHEEL_IMG = "/images/fab-wheel-reference.png";

/** Полный оборот колеса на кнопке (секунды) — медленное вращение */
const FAB_WHEEL_ROTATION_SEC = 36;

type Props = {
  onClick: () => void;
  hasBonus: boolean;
  remainingTime: string;
};

export function LuckyWheelButton({ onClick, hasBonus, remainingTime }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="fixed z-[38] flex items-center justify-center rounded-full bg-transparent p-0"
      style={{
        bottom: "max(90px, env(safe-area-inset-bottom, 0px) + 60px)",
        right: "max(16px, env(safe-area-inset-right, 0px) + 16px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      }}
      whileTap={{ scale: 0.98 }}
      aria-label={hasBonus ? "Открыть бонус" : "Крутить колесо"}
    >
      <span className="relative flex h-16 w-16 max-h-[64px] max-w-[64px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/20 ring-1 ring-amber-500/40">
        {!imgError ? (
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
              src={WHEEL_IMG}
              alt=""
              width={128}
              height={128}
              unoptimized
              className="h-full w-full select-none rounded-full object-cover"
              draggable={false}
              priority
              onError={() => setImgError(true)}
            />
          </motion.div>
        ) : (
          <motion.div
            className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#6b1520] via-[#4a1018] to-[#2c080c] text-lg font-bold text-amber-400/90 ring-1 ring-amber-500/40"
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
        {hasBonus && (
          <>
            <motion.span
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-[28px] leading-none drop-shadow-md" aria-hidden>
                🎁
              </span>
            </motion.span>
            {remainingTime ? (
              <span
                className="pointer-events-none absolute bottom-1 left-0 right-0 z-10 text-center font-mono text-[9px] font-bold tabular-nums text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                aria-hidden
              >
                {remainingTime}
              </span>
            ) : null}
          </>
        )}
      </span>
    </motion.button>
  );
}
