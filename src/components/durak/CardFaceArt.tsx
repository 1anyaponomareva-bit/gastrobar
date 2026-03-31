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
      <div className={cn("absolute left-[6px] top-[5px] z-10 flex flex-col items-center leading-none", color)}>
        <span className="text-[0.72rem] font-extrabold tracking-tight tabular-nums sm:text-[0.85rem]">
          {rank}
        </span>
        <span className="mt-px text-[0.95rem] font-bold leading-none sm:text-[1.05rem]" aria-hidden>
          {suit}
        </span>
      </div>
      <div
        className={cn(
          "absolute bottom-[5px] right-[6px] z-10 flex flex-col items-center leading-none [transform:rotate(180deg)]",
          color
        )}
      >
        <span className="text-[0.72rem] font-extrabold tracking-tight tabular-nums sm:text-[0.85rem]">
          {rank}
        </span>
        <span className="mt-px text-[0.95rem] font-bold leading-none sm:text-[1.05rem]" aria-hidden>
          {suit}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-2 pb-5 pt-6">
        <span
          className={cn(
            "select-none text-[1.35rem] font-black tabular-nums leading-none tracking-tight sm:text-[1.55rem]",
            color
          )}
        >
          {rank}
        </span>
        <span
          className={cn(
            "mt-0.5 select-none text-[2.15rem] font-bold leading-none sm:text-[2.45rem]",
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
