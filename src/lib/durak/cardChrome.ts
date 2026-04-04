/**
 * Скругление только `var(--card-radius)` из app/globals.css (одинаково для руки, стола, колоды, козыря, соперника).
 * Подсветка: .game-card / .table-card ::after в globals.
 */
export const CARD_RADIUS_CLASS = "rounded-[var(--card-radius)]";

export type DurakCardSurface = "hand" | "table" | "deck" | "trump" | "opponent";

export const DURAK_CARD_SURFACE_CLASS: Record<DurakCardSurface, string> = {
  hand: "game-card",
  table: "table-card",
  deck: "deck-card",
  trump: "trump-card",
  opponent: "enemy-card",
};

/** Клип растра внутри CardSprite = «card-inner» в DOM: .game-card/.table-card → .durak-card-media → img */
export const DURAK_CARD_MEDIA_CLASS = "durak-card-media durak-card-inner";

/** Карты на сукне (рядом с .table-card с тем же surface) — отдельные хуки для радиуса в globals */
export const DURAK_ATTACK_CARD_CLASS = "attack-card";
export const DURAK_DEFEND_CARD_CLASS = "defend-card";

export const GAME_CARD_IS_PLAYABLE_CLASS = "is-playable";
export const GAME_CARD_IS_SELECTED_CLASS = "is-selected";
/** Неотбитая атака: фаза защиты — выбор цели отбоя */
export const GAME_CARD_IS_TARGETABLE_CLASS = "is-targetable";
/** Неотбитая атака: подкидывание / добивание */
export const GAME_CARD_IS_THROWABLE_CLASS = "is-throwable";

export const GAME_CARD_FACE_CLASS = "game-card__face card-face";
