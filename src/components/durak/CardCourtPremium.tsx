"use client";

import { useId } from "react";
import type { Rank, Suit } from "@/games/durak/types";

const COURT_RANKS = new Set<Rank>(["J", "Q", "K", "A"]);

export function isCourtRank(rank: Rank): rank is "J" | "Q" | "K" | "A" {
  return COURT_RANKS.has(rank);
}

/** Крупная масть в центре (туз). */
function SuitGlyph({
  suit,
  x,
  y,
  scale,
  fill,
}: {
  suit: Suit;
  x: number;
  y: number;
  scale: number;
  fill: string;
}) {
  const g = `translate(${x} ${y}) scale(${scale})`;
  switch (suit) {
    case "hearts":
      return (
        <g transform={g}>
          <path
            d="M0 8.2 C-6.5 2.6 -14 -1.2 -14 -6.8 C-14 -12.2 -9 -15.6 -4.4 -15.6 C-1.8 -15.6 0 -14.4 0 -12.8 C0 -14.4 1.8 -15.6 4.4 -15.6 C9 -15.6 14 -12.2 14 -6.8 C14 -1.2 6.5 2.6 0 8.2 Z"
            fill={fill}
          />
        </g>
      );
    case "diamonds":
      return (
        <g transform={g}>
          <path d="M0 -14 L12 0 L0 14 L-12 0 Z" fill={fill} />
        </g>
      );
    case "clubs":
      return (
        <g transform={g}>
          <circle cx="0" cy="-6" r="5.2" fill={fill} />
          <circle cx="-6" cy="4" r="5.2" fill={fill} />
          <circle cx="6" cy="4" r="5.2" fill={fill} />
          <path d="M-2.2 8.5 L2.2 8.5 L3.6 16 L-3.6 16 Z" fill={fill} />
        </g>
      );
    case "spades":
    default:
      return (
        <g transform={g}>
          <path
            d="M0 -16 C-8 -6 -14 3 -14 8.5 C-14 12 -11 14.5 -7 14.5 C-3.8 14.5 -1.2 12.5 0 9.8 C1.2 12.5 3.8 14.5 7 14.5 C11 14.5 14 12 14 8.5 C14 3 8 -6 0 -16 Z M-3.2 14.2 L3.2 14.2 L4.8 20 L-4.8 20 Z"
            fill={fill}
          />
        </g>
      );
  }
}

function CrownKing({ gold, ink }: { gold: string; ink: string }) {
  return (
    <g stroke={gold} strokeWidth={0.55} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 16 L42 28 L45 38 L35 42 L44 50 L50 66 L56 50 L65 42 L55 38 L58 28 Z" />
      <circle cx="50" cy="22" r="2.2" fill={gold} stroke="none" />
      <path d="M36 28 L30 24 M64 28 L70 24" opacity="0.85" />
      <text
        x="50"
        y="88"
        textAnchor="middle"
        fill={ink}
        fontSize="19"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="-0.02em"
      >
        K
      </text>
    </g>
  );
}

function CrownQueen({ gold, ink }: { gold: string; ink: string }) {
  return (
    <g stroke={gold} strokeWidth={0.55} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M50 20 Q38 34 40 44 Q36 48 38 54 Q44 58 50 60 Q56 58 62 54 Q64 48 60 44 Q62 34 50 20"
        fill="rgba(154, 123, 60, 0.11)"
      />
      <path d="M50 20 Q38 34 40 44 Q36 48 38 54 Q44 58 50 60 Q56 58 62 54 Q64 48 60 44 Q62 34 50 20" />
      <circle cx="50" cy="30" r="2" fill={gold} stroke="none" />
      <text
        x="50"
        y="88"
        textAnchor="middle"
        fill={ink}
        fontSize="19"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        Q
      </text>
    </g>
  );
}

function JackMotif({ gold, ink }: { gold: string; ink: string }) {
  return (
    <g>
      <path
        d="M50 18 C34 26 30 44 34 58 C38 70 46 76 50 78 C54 76 62 70 66 58 C70 44 66 26 50 18"
        fill={`${gold}10`}
        stroke={gold}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path d="M38 46 Q50 52 62 46" fill="none" stroke={ink} strokeWidth={0.75} strokeLinecap="round" opacity="0.45" />
      <path d="M42 32 L58 32" fill="none" stroke={gold} strokeWidth={0.45} opacity="0.7" strokeLinecap="round" />
      <text
        x="50"
        y="88"
        textAnchor="middle"
        fill={ink}
        fontSize="19"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        J
      </text>
    </g>
  );
}

function AceCenter({ suit, ink, gold }: { suit: Suit; ink: string; gold: string }) {
  return (
    <g>
      <circle cx="50" cy="50" r="36" fill="none" stroke={gold} strokeWidth={0.65} opacity="0.55" />
      <circle cx="50" cy="50" r="30" fill="none" stroke={ink} strokeWidth={0.35} opacity="0.12" />
      <SuitGlyph suit={suit} x={50} y={48} scale={1.05} fill={ink} />
      <text
        x="50"
        y="88"
        textAnchor="middle"
        fill={gold}
        fontSize="13"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="0.12em"
        opacity="0.92"
      >
        A
      </text>
    </g>
  );
}

/**
 * Премиальная «центральная миниатюра» для валета, дамы, короля, туза —
 * единая барная эстетика: золотая линия + мастевой цвет, без клипарта.
 */
export function CardCourtPremium({
  rank,
  suit,
  compact,
}: {
  rank: "J" | "Q" | "K" | "A";
  suit: Suit;
  compact: boolean;
}) {
  const gradId = useId().replace(/:/g, "");
  const red = suit === "hearts" || suit === "diamonds";
  const ink = red ? "#9f1239" : "#0c1222";
  const gold = "#9a7b3c";

  const scale = compact ? 0.92 : 1;

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full max-h-[100%] w-full max-w-[100%] select-none"
      style={{ transform: `scale(${scale})` }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y="10" width="84" height="80" rx="10" fill={`url(#${gradId})`} opacity="0.35" />
      <g transform="translate(0 2)">
        {rank === "K" ? <CrownKing gold={gold} ink={ink} /> : null}
        {rank === "Q" ? <CrownQueen gold={gold} ink={ink} /> : null}
        {rank === "J" ? <JackMotif gold={gold} ink={ink} /> : null}
        {rank === "A" ? <AceCenter suit={suit} ink={ink} gold={gold} /> : null}
      </g>
    </svg>
  );
}
