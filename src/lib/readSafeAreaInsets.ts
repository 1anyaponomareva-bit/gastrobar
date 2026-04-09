/**
 * Чтение safe-area для расчёта лейаута в JS (Android Chrome часто оставляет env() в CSS,
 * но для абсолютных координат сцены дурака нужны числовые отступы).
 */
export function readSafeAreaInsetsFromEnv(): { top: number; bottom: number } {
  if (typeof document === "undefined") return { top: 0, bottom: 0 };
  try {
    const el = document.createElement("div");
    el.setAttribute(
      "style",
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;z-index:-1;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);",
    );
    document.documentElement.appendChild(el);
    const cs = getComputedStyle(el);
    const top = parseFloat(cs.paddingTop) || 0;
    const bottom = parseFloat(cs.paddingBottom) || 0;
    document.documentElement.removeChild(el);
    return { top, bottom };
  } catch {
    return { top: 0, bottom: 0 };
  }
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Отступы для сцены дурака: env() + минимальный запас на телефонах, если ОС отдаёт 0
 * (наложение на статус-бар и панель жестов).
 */
export function readDurakSafeChromeInsets(): { top: number; bottom: number } {
  const { top, bottom } = readSafeAreaInsetsFromEnv();
  const coarse = isCoarsePointer();
  const topOut = coarse ? Math.max(top, top < 20 ? 24 : 0) : top;
  const bottomOut = coarse ? Math.max(bottom, bottom < 20 ? 32 : 0) : bottom;
  return { top: topOut, bottom: bottomOut };
}
