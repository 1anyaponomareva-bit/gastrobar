"use client";

import { cn } from "@/lib/utils";

type Props = {
  time: string;
  className?: string;
};

/**
 * Таймер активного бонуса: бейдж как «Хит» в карточках (скруглённая капсула),
 * полупрозрачный чёрный фон и тонкая золотая окантовка.
 */
export function BonusRibbonTimer({ time, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-[#C9A227]/90 bg-black/70 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums tracking-wide text-[#fffef5] backdrop-blur-sm sm:text-[12px]",
        className
      )}
      style={{
        boxShadow:
          "0 0 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
      aria-live="polite"
    >
      {time}
    </span>
  );
}
