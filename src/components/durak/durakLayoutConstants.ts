/** Под фиксированный `Header` (высота 60px + safe-area). */
export const HEADER_OFFSET_TOP =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px)))]";

/**
 * Страница дурака: шапка + доп. зазор под руку/имя соперника и веер рубашек.
 * Одним calc, без второго `pt-*` (иначе классы борются в Tailwind).
 */
export const HEADER_OFFSET_TOP_DURAK =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+1.15rem)] sm:pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+1.35rem)]";

/**
 * Z-index слоёв круглого стола (от низа к верху).
 * Колода и бой не поднимаются выше строки фазы / кнопок вне этого списка.
 */
export const DURAK_TABLE_Z = {
  feltBase: 0,
  feltRim: 1,
  feltLogo: 2,
  /** Колода + козырь на ободке */
  deck: 12,
  /** Пары «атака / отбой» в центре */
  battle: 22,
  /** Руки соперников на окружности */
  hands: 32,
  oppFan: 33,
  oppLabel: 34,
} as const;
