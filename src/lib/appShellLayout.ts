/** Общая геометрия шапки и вкладок — как на /food (Gastrofood). */
export const APP_HEADER_BAR_PX = 96;
export const APP_TABS_HEIGHT_PX = 72;
export const APP_LIST_TOP_BUFFER_PX = 8;
export const APP_LIST_TOP_PX =
  APP_HEADER_BAR_PX + APP_TABS_HEIGHT_PX + APP_LIST_TOP_BUFFER_PX;

/** Gastrofood: слот логотипа в шапке. */
export const GASTROFOOD_LOGO_HEIGHT_PX = 98;
export const GASTROFOOD_LOGO_WIDTH_PX = 300;
export const GASTROFOOD_LOGO_MAX_WIDTH = "min(300px, calc(100vw - 7rem))";

/**
 * Gastrobar: в PNG буквы крупнее относительно холста — показываем ниже,
 * чтобы кегль совпадал с GASTROFOOD (не размер файла).
 */
export const GASTROBAR_LOGO_HEIGHT_PX = 60;
export const GASTROBAR_LOGO_WIDTH_PX = 188;
export const GASTROBAR_LOGO_MAX_WIDTH = "min(188px, calc(100vw - 7rem))";

export const CATEGORY_TABS_SHELL_CLASS =
  "mx-auto w-full max-w-md shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5 scrollbar-none";

export const CATEGORY_TABS_ROW_CLASS = "flex gap-2";

export const categoryTabButtonClass = (active: boolean) =>
  [
    "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
    active
      ? "bg-white text-black"
      : "bg-white/12 text-white/90 hover:bg-white/20",
  ].join(" ");
