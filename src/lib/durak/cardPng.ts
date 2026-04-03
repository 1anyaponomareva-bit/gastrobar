import type { Rank, Suit } from "@/games/durak/types";

const BASE = "/cards/PNG-cards-1.3";

/** PNG в `PNG-cards-1.3`: 242×340 px. */
export const CARD_PNG_ASPECT_CLASS = "aspect-[242/340]";

const SUIT_TO_FILE: Record<Suit, string> = {
  hearts: "hearts",
  diamonds: "diamonds",
  clubs: "clubs",
  spades: "spades",
};

/** Только J, Q, K → `*_of_*2.png`. Тузы: `ace_of_{suit}.png` без `2`; 6–10 — без суффикса. */
const RANK_USES_FILENAME_SUFFIX_2 = new Set<Rank>(["J", "Q", "K"]);

function rankToFileStem(rank: Rank): string {
  switch (rank) {
    case "J":
      return "jack";
    case "Q":
      return "queen";
    case "K":
      return "king";
    case "A":
      return "ace";
    default:
      return rank;
  }
}

/**
 * Путь к лицу карты в `/public/cards/PNG-cards-1.3/`.
 * 6–10: `{n}_of_{suit}.png`; туз: `ace_of_{suit}.png`; валет/дама/король: `{jack|queen|king}_of_{suit}2.png`.
 */
export function getCardImagePath(rank: Rank, suit: Suit): string {
  const s = SUIT_TO_FILE[suit];
  const stem = rankToFileStem(rank);
  const suffix2 = RANK_USES_FILENAME_SUFFIX_2.has(rank) ? "2" : "";
  return `${BASE}/${stem}_of_${s}${suffix2}.png`;
}

/** Задняя сторона колоды — `rubashka.png` в том же каталоге. */
export const CARD_BACK_PNG_PATH = `${BASE}/rubashka.png`;
