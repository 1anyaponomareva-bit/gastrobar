import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export const RANKS: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const RANK_ORDER: Record<Rank, number> = {
  "6": 0,
  "7": 1,
  "8": 2,
  "9": 3,
  "10": 4,
  J: 5,
  Q: 6,
  K: 7,
  A: 8,
};

export function rankValue(r: Rank): number {
  return RANK_ORDER[r];
}

export function compareRank(a: Rank, b: Rank): number {
  return RANK_ORDER[a] - RANK_ORDER[b];
}

export function createDeck36(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Бьётся ли a козырем или старшей в масти */
export function canBeat(attack: Card, defense: Card, trumpSuit: Suit): boolean {
  if (defense.suit === attack.suit && rankValue(defense.rank) > rankValue(attack.rank)) {
    return true;
  }
  if (defense.suit === trumpSuit && attack.suit !== trumpSuit) {
    return true;
  }
  if (defense.suit === trumpSuit && attack.suit === trumpSuit) {
    return rankValue(defense.rank) > rankValue(attack.rank);
  }
  return false;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    spades: 0,
    clubs: 1,
    diamonds: 2,
    hearts: 3,
  };
  return [...hand].sort((a, b) => {
    const sd = suitOrder[a.suit] - suitOrder[b.suit];
    if (sd !== 0) return sd;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

export function suitLabel(s: Suit): string {
  const m: Record<Suit, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };
  return m[s];
}

export function rankLabel(r: Rank): string {
  return r;
}

/** Кто ходит первым: минимальный козырь; при равенстве — меньший seatIndex. Без козырей — минимальная карта. */
export function findFirstAttackerIndex(
  players: { hand: Card[]; seatIndex: number }[],
  trumpSuit: Suit
): number {
  let bestIdx = 0;
  let bestRank = 999;
  let foundTrump = false;

  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    for (const c of p.hand) {
      if (c.suit === trumpSuit) {
        const rv = rankValue(c.rank);
        if (
          !foundTrump ||
          rv < bestRank ||
          (rv === bestRank && p.seatIndex < players[bestIdx]!.seatIndex)
        ) {
          foundTrump = true;
          bestRank = rv;
          bestIdx = i;
        }
      }
    }
  }

  if (foundTrump) return bestIdx;

  bestRank = 999;
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    for (const c of p.hand) {
      const rv = rankValue(c.rank);
      if (
        rv < bestRank ||
        (rv === bestRank && p.seatIndex < players[bestIdx]!.seatIndex)
      ) {
        bestRank = rv;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}
