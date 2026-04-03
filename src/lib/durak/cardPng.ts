import type { Rank, Suit } from "@/games/durak/types";

const BASE = "/cards/PNG-cards-1.3";

const SUIT_TO_FILE: Record<Suit, string> = {
  hearts: "hearts",
  diamonds: "diamonds",
  clubs: "clubs",
  spades: "spades",
};

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
 * Числовые ранги 6–10: `{n}_of_{suit}.png`; фигуры и туз: `{jack|queen|king|ace}_of_{suit}2.png`.
 */
export function getCardImagePath(rank: Rank, suit: Suit): string {
  const s = SUIT_TO_FILE[suit];
  const stem = rankToFileStem(rank);
  const suffix2 =
    rank === "J" || rank === "Q" || rank === "K" || rank === "A" ? "2" : "";
  return `${BASE}/${stem}_of_${s}${suffix2}.png`;
}

/**
 * Рубашка: в этой версии набора нет отдельного файла back — берём тёмный `black_joker.png`.
 * При добавлении настоящей рубашки замените константу.
 */
export const CARD_BACK_PNG_PATH = `${BASE}/black_joker.png`;
