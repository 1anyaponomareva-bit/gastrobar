/** Ключ в localStorage: дата-версия «один релиз в сутки» (UTC YYYY-MM-DD). */
export const GASTROBAR_APP_VERSION_KEY = "gastrobar_app_version";

/** Сегодняшняя дата в UTC — как `new Date().toISOString().slice(0, 10)`. */
export function getCurrentAppVersion(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Только публичные картинки/иконки — не HTML, не `/_next/*`, не внутренние чанки. */
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(\?|#|$)/i;

/**
 * Добавляет `?v=YYYY-MM-DD` к путям к **изображениям** из `public/`.
 * HTML-навигация, `/_next/`, внешние URL, data: — без изменений.
 */
export function getAssetUrl(path: string): string {
  if (!path) return path;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("//")
  ) {
    return path;
  }
  if (path.startsWith("/_next/") || path.startsWith("/_vercel/")) {
    return path;
  }
  const base = path.split("?")[0] ?? path;
  if (!IMAGE_FILE_RE.test(base)) {
    return path;
  }
  const v = getCurrentAppVersion();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(v)}`;
}
