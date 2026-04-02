"use client";

import type { Card } from "@/games/durak/types";
import { rankLabel, suitLabel } from "@/games/durak/cards";
import { cn } from "@/lib/utils";

/** Классическая колода: белый непрозрачный фон, угловые индексы, крупный центр. */
export function CardFaceArt({
  card,
  className,
}: {
  card: Card;
  className?: string;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const rank = rankLabel(card.rank);
  const suit = suitLabel(card.suit);
  const color = red ? "text-red-600" : "text-slate-900";

  return (
    <div
      className={cn(
        "pointer-events-none relative flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-slate-300/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.14)]",
        className
      )}
    >
      {/* Углы: ранг и масть в строку — не наезжают друг на друга (Q и ♣). */}
      <div
        className={cn(
          "absolute left-[4px] top-[5px] z-10 flex flex-row items-start gap-0.5 leading-none",
          color
        )}
      >
        <span className="text-[0.68rem] font-extrabold tabular-nums leading-none sm:text-[0.78rem]">
          {rank}
        </span>
        <span className="text-[0.72rem] font-bold leading-[0.95] sm:text-[0.82rem]" aria-hidden>
          {suit}
        </span>
      </div>
      <div
        className={cn(
          "absolute bottom-[5px] right-[4px] z-10 flex flex-row items-end gap-0.5 leading-none [transform:rotate(180deg)]",
          color
        )}
      >
        <span className="text-[0.68rem] font-extrabold tabular-nums leading-none sm:text-[0.78rem]">
          {rank}
        </span>
        <span className="text-[0.72rem] font-bold leading-[0.95] sm:text-[0.82rem]" aria-hidden>
          {suit}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-2 pb-5 pt-5">
        <span
          className={cn(
            "select-none text-[1.28rem] font-black tabular-nums leading-none tracking-tight sm:text-[1.48rem]",
            color
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "mt-0.5 select-none text-[1.95rem] font-bold leading-none sm:text-[2.2rem]",
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
