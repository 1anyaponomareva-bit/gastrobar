/**
 * Реальный URL Supabase для серверного прокси (rewrites на Vercel edge иногда дают DNS_HOSTNAME_NOT_FOUND).
 * Сначала SUPABASE_URL (только сервер), иначе NEXT_PUBLIC_SUPABASE_URL.
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
    normalizeSupabaseBackendUrl(process.env.SUPABASE_URL) ??
    normalizeSupabaseBackendUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}
