"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/games/durak/types";
import { rankLabel, suitLabel } from "@/games/durak/cards";
import { CARD_RADIUS_CLASS, GAME_CARD_FACE_CLASS } from "@/lib/durak/cardChrome";
import { getCardImagePath } from "@/lib/durak/cardPng";
import { getAssetUrl } from "@/lib/appVersion";
import { SmartImage } from "@/components/SmartImage";
import { cn } from "@/lib/utils";

/** Fallback: прежняя текстовая карта, если PNG не загрузился. */
function CardFaceArtFallback({
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
        GAME_CARD_FACE_CLASS,
        "pointer-events-none relative flex h-full w-full flex-col overflow-hidden",
        CARD_RADIUS_CLASS,
        "border border-neutral-400/85 bg-neutral-50",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
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
            compact ? "text-[1.02rem] sm:text-[1.12rem]" : "text-[1.65rem] sm:text-[1.9rem]"
          )}
          aria-hidden
        >
          {suit}
        </span>
      </div>
    </div>
  );
}

export function CardFaceArt({
  card,
  className,
  compact,
}: {
  card: Card;
  className?: string;
  compact?: boolean;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const src = getAssetUrl(getCardImagePath(card.rank, card.suit));

  useEffect(() => {
    setUseFallback(false);
  }, [card.id, card.rank, card.suit, src]);

  if (useFallback) {
    return <CardFaceArtFallback card={card} className={className} compact={compact} />;
  }

  return (
    <SmartImage
      src={src}
      alt=""
      draggable={false}
      className={cn(
        "durak-card-face-img pointer-events-none block h-full w-full max-h-full max-w-full bg-transparent",
        "object-cover object-center",
        className
      )}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      onError={() => setUseFallback(true)}
    />
  );
}
