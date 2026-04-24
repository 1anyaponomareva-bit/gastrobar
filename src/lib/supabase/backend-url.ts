/**
 * PostgREST base URL (edge/server). Только `NEXT_PUBLIC_SUPABASE_URL` — без fallback на
 * `SUPABASE_URL`, чтобы в рантайме не подставлялся другой хост из Vercel.
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
  return normalizeSupabaseBackendUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
