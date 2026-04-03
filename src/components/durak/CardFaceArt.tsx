"use client";

import type { Card } from "@/games/durak/types";
import { rankLabel, suitLabel } from "@/games/durak/cards";
import { cn } from "@/lib/utils";

/** Единый классический стиль: светлое поле, масти ♠♥♦♣, ранг как в колоде. */
export function CardFaceArt({
  card,
  className,
  compact,
}: {
  card: Card;
  className?: string;
  compact?: boolean;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const rank = rankLabel(card.rank);
  const suit = suitLabel(card.suit);
  const color = red ? "text-red-600" : "text-neutral-900";

  return (
    <div
      className={cn(
        "pointer-events-none relative flex h-full w-full flex-col overflow-hidden rounded-[10px]",
        "border border-neutral-400/85 bg-neutral-50",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
        compact && "rounded-[8px] border-neutral-400/80",
        className
      )}
    >
      <div
        className={cn(
          "absolute z-10 flex flex-row items-start gap-0.5 leading-none",
          compact ? "left-[3px] top-[3px]" : "left-[4px] top-[4px]",
          color
        )}
      >
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            compact ? "text-[0.55rem] sm:text-[0.58rem]" : "text-[0.65rem] sm:text-[0.72rem]"
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "font-semibold leading-[0.95]",
            compact ? "text-[0.56rem] sm:text-[0.6rem]" : "text-[0.66rem] sm:text-[0.74rem]"
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>
      <div
        className={cn(
          "absolute z-10 flex flex-row items-end gap-0.5 leading-none [transform:rotate(180deg)]",
          compact ? "bottom-[3px] right-[3px]" : "bottom-[4px] right-[4px]",
          color
        )}
      >
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            compact ? "text-[0.55rem] sm:text-[0.58rem]" : "text-[0.65rem] sm:text-[0.72rem]"
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "font-semibold leading-[0.95]",
            compact ? "text-[0.56rem] sm:text-[0.6rem]" : "text-[0.66rem] sm:text-[0.74rem]"
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-0",
          compact ? "px-0.5 pb-2 pt-2" : "px-1 pb-4 pt-4"
        )}
      >
        <span
          className={cn(
            "select-none font-bold tabular-nums leading-none",
            compact ? "text-[0.78rem] sm:text-[0.88rem]" : "text-[1.12rem] sm:text-[1.28rem]",
            color
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "select-none font-semibold leading-none",
            compact ? "text-[1.02rem] sm:text-[1.12rem]" : "text-[1.65rem] sm:text-[1.9rem]",
            color
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>
    </div>
  );
}
