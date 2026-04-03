"use client";

import type { Card } from "@/games/durak/types";
import { rankLabel, suitLabel } from "@/games/durak/cards";
import { cn } from "@/lib/utils";
import { CardCourtPremium, isCourtRank } from "@/components/durak/CardCourtPremium";

/** Классическая колода: белый непрозрачный фон, угловые индексы, крупный центр. */
export function CardFaceArt({
  card,
  className,
  /** Меньшие центральные масть/ранг — для узких карт на столе, без вылезания за скругление. */
  compact,
}: {
  card: Card;
  className?: string;
  compact?: boolean;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const rank = rankLabel(card.rank);
  const suit = suitLabel(card.suit);
  const color = red ? "text-red-600" : "text-slate-900";

  const court = isCourtRank(card.rank);

  return (
    <div
      className={cn(
        "pointer-events-none relative flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-slate-300/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.14)]",
        compact && "rounded-[8px] border-slate-300",
        court &&
          "border-[#c9b896]/80 bg-gradient-to-b from-white via-[#faf8f5] to-[#f0ebe3] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_3px_12px_rgba(0,0,0,0.12)]",
        className
      )}
    >
      {/* Углы: ранг и масть в строку — не наезжают друг на друга (Q и ♣). */}
      <div
        className={cn(
          "absolute z-10 flex flex-row items-start gap-0.5 leading-none",
          compact ? "left-[3px] top-[3px]" : "left-[4px] top-[5px]",
          color
        )}
      >
        <span
          className={cn(
            "font-extrabold tabular-nums leading-none",
            compact ? "text-[0.58rem] sm:text-[0.62rem]" : "text-[0.68rem] sm:text-[0.78rem]"
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "font-bold leading-[0.95]",
            compact ? "text-[0.6rem] sm:text-[0.68rem]" : "text-[0.72rem] sm:text-[0.82rem]"
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>
      <div
        className={cn(
          "absolute z-10 flex flex-row items-end gap-0.5 leading-none [transform:rotate(180deg)]",
          compact ? "bottom-[3px] right-[3px]" : "bottom-[5px] right-[4px]",
          color
        )}
      >
        <span
          className={cn(
            "font-extrabold tabular-nums leading-none",
            compact ? "text-[0.58rem] sm:text-[0.62rem]" : "text-[0.68rem] sm:text-[0.78rem]"
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "font-bold leading-[0.95]",
            compact ? "text-[0.6rem] sm:text-[0.68rem]" : "text-[0.72rem] sm:text-[0.82rem]"
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>

      {court ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden",
            compact ? "px-0.5 pb-2 pt-1 sm:px-1" : "px-1.5 pb-4 pt-3"
          )}
        >
          <CardCourtPremium
            rank={card.rank as "J" | "Q" | "K" | "A"}
            suit={card.suit}
            compact={Boolean(compact)}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center",
            compact ? "px-1 pb-3 pt-2 sm:px-1.5 sm:pb-3.5 sm:pt-2.5" : "px-2 pb-5 pt-5"
          )}
        >
          <span
            className={cn(
              "select-none font-black tabular-nums leading-none tracking-tight",
              compact
                ? "text-[0.82rem] sm:text-[0.95rem]"
                : "text-[1.28rem] sm:text-[1.48rem]",
              color
            )}
          >
            {rank}
          </span>
          <span
            className={cn(
              "mt-0.5 select-none font-bold leading-none",
              compact ? "text-[1.15rem] sm:text-[1.32rem]" : "text-[1.95rem] sm:text-[2.2rem]",
              color
            )}
            aria-hidden
          >
            {suit}
          </span>
        </div>
      )}
    </div>
  );
}
