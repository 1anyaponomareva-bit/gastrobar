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

/** J, Q, K, A → `*_of_*2.png`; числовые ранги (в игре 6–10) → без суффикса `2`. */
const RANK_USES_FILENAME_SUFFIX_2 = new Set<Rank>(["J", "Q", "K", "A"]);

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
 * Путь к лицу карты в `/public/cards/PNG-cards-1.3/` (набор PNG-cards-1.3).
 * Правило: `{rank}_of_{suit}.png` для 6–10; `{jack|queen|king|ace}_of_{suit}2.png` для J/Q/K/A.
 */
export function getCardImagePath(rank: Rank, suit: Suit): string {
  const s = SUIT_TO_FILE[suit];
  const stem = rankToFileStem(rank);
  const suffix2 = RANK_USES_FILENAME_SUFFIX_2.has(rank) ? "2" : "";
  return `${BASE}/${stem}_of_${s}${suffix2}.png`;
}

/**
 * Рубашка: в этой версии набора нет отдельного файла back — берём тёмный `black_joker.png`.
 * При добавлении настоящей рубашки замените константу.
 */
export const CARD_BACK_PNG_PATH = `${BASE}/black_joker.png`;
