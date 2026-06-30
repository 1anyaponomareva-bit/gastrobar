/** Как `IMG()` в food/app.js — корректное кодирование имён файлов. */
export function foodMenuImage(file: string | null | undefined): string {
  if (!file) return "";
  const [path, ...queryParts] = file.split("?");
  const query = queryParts.length ? `?${queryParts.join("?")}` : "";
  return `/food/menu/${encodeURIComponent(path)}${query}`;
}

/** Барные картинки снеков на gastrofood (public/menu/…). */
export function barMenuImage(path: string): string {
  return path;
}
