/** Под фиксированный `Header` (высота 60px + safe-area). */
export const HEADER_OFFSET_TOP =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px)))]";

/**
 * Страница дурака: шапка + доп. зазор под руку/имя соперника и веер рубашек.
 * Одним calc, без второго `pt-*` (иначе классы борются в Tailwind).
 */
export const HEADER_OFFSET_TOP_DURAK =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+1.15rem)] sm:pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+1.35rem)]";
