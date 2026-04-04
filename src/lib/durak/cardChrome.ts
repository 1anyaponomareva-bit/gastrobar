/**
 * Скругление и классы оболочки карты. Обводка выбора / «можно сыграть» — в app/globals.css (.game-card::after).
 */
export const CARD_RADIUS_CLASS = "rounded-[14px]";

/** Внешняя оболочка: overflow visible, подсветка псевдоэлементом. */
export const GAME_CARD_CLASS = "game-card";

/** Клип контента карты (лицо / рубашка), без обрезки ::after. */
export const GAME_CARD_INNER_CLASS = "game-card-inner";

export const GAME_CARD_IS_PLAYABLE_CLASS = "is-playable";
export const GAME_CARD_IS_SELECTED_CLASS = "is-selected";
/** Подсветка неотбитой атаки на столе. */
export const GAME_CARD_IS_ATTACK_HINT_CLASS = "is-attack-hint";

/** Лицо PNG / fallback: скругление как у макета + селектор в globals. */
export const GAME_CARD_FACE_CLASS = "game-card__face";
