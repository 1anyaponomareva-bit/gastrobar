/** Под фиксированный `Header`: см. `--app-main-padding-top` в `globals.css` (60px + safe-area, без дубля). */
export const HEADER_OFFSET_TOP = "pt-[var(--app-main-padding-top)]";

/** Контент дурака под той же шапкой; отдельный класс только при необходимости (страница задаёт padding через тот же токен). */
export const HEADER_OFFSET_TOP_DURAK = "pt-[var(--app-main-padding-top)]";
