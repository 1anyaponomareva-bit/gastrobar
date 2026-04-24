/** Ключ в localStorage: дата-версия «один релиз в сутки» (UTC YYYY-MM-DD). */
export const GASTROBAR_APP_VERSION_KEY = "gastrobar_app_version";

/** Сегодняшняя дата в UTC — как `new Date().toISOString().slice(0, 10)`. */
export function getCurrentAppVersion(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Добавляет `?v=YYYY-MM-DD` к путям из `public/`, чтобы обойти кеш картинок/статики.
 * Внешние URL, data:, // — без изменений.
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
  const v = getCurrentAppVersion();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(v)}`;
}
