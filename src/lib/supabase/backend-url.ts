/**
 * URL PostgREST для серверного прокси.
 * Сначала `NEXT_PUBLIC_SUPABASE_URL` — тот же хост, что в браузере. Иначе `SUPABASE_URL` (только сервер).
 * Важно: на Vercel нередко пишут оба; опечатка **только** в `SUPABASE_URL` раньше затирала публичный URL и
 * давала `getaddrinfo ENOTFOUND` у прокси при рабочем клиенте.
 */
export function normalizeSupabaseBackendUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/\/+$/, "");
  try {
    const u = new URL(s);
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function getSupabaseBackendUrl(): string | null {
  return (
    normalizeSupabaseBackendUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    normalizeSupabaseBackendUrl(process.env.SUPABASE_URL)
  );
}
