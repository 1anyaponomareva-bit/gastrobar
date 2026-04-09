/** Под фиксированный `Header` (высота 60px + safe-area). */
export const HEADER_OFFSET_TOP =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px)))]";

/**
 * Страница дурака: только под хедер + safe-area. Вертикаль стола задаётся в `DurakGame` от высоты сцены, без лишнего «воздуха».
 */
export const HEADER_OFFSET_TOP_DURAK =
  "pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+0.15rem)] sm:pt-[calc(60px+max(0px,env(safe-area-inset-top,0px))+0.25rem)]";
