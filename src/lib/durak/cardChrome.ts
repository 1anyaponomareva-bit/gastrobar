/**
 * Единые визуальные параметры карты: рука, стол, соперник, колода.
 * Один радиус для контейнера и арта — без «белых углов» и прямоугольных ring.
 */
export const CARD_RADIUS_CLASS = "rounded-[14px]";

/** Выбранная карта: только box-shadow (повторяет скругление), без outline/ring. */
export const CARD_CHROME_SELECTED_CLASS =
  "shadow-[0_0_0_2px_rgba(248,214,109,0.95),0_0_14px_rgba(248,214,109,0.5)]";

/** Подсветка «можно сыграть». */
export const CARD_CHROME_PLAYABLE_CLASS =
  "shadow-[0_0_0_2px_rgba(52,211,153,0.9),0_0_18px_rgba(52,211,153,0.45)]";

/** Атака на столе, которую нужно отбить — мягкая изумрудная обводка. */
export const CARD_CHROME_TABLE_ATTACK_HINT_CLASS =
  "shadow-[0_0_0_2px_rgba(167,243,208,0.92),0_0_12px_rgba(167,243,208,0.38)]";
