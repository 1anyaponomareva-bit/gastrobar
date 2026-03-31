import type { Card } from "@/games/durak/types";
import { CONFIG } from "@/lib/config";

/**
 * Рубашка: тот же логотип, что в шапке (`CONFIG.logoSrc`).
 * Лица карт — deckofcardsapi; в именах файлов десятка — «0», не «10».
 */
const IMG_BASE = "https://deckofcardsapi.com/static/img";

export const CARD_BACK_URL = CONFIG.logoSrc;

/** Код ранга в имени PNG (6–9, 0 = десятка, J, Q, K, A). */
export function cardFileRank(card: Card): string {
  if (card.rank === "10") return "0";
  return card.rank;
}

export function cardFaceUrl(card: Card): string {
  const suitLetter = { spades: "S", hearts: "H", diamonds: "D", clubs: "C" }[card.suit];
  return `${IMG_BASE}/cards/${cardFileRank(card)}${suitLetter}.png`;
}
