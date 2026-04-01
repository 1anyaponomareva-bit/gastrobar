import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicApiKey } from "@/lib/supabase/public-key";

/**
 * Клиент в браузере: запросы идут на тот же домен (`/supabase-proxy`), Next rewrites → Supabase.
 * Прямой `fetch` на `*.supabase.co` у части пользователей падает с «TypeError: Load failed».
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const key = getSupabasePublicApiKey();
  if (!key) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) return null;
  const url = `${window.location.origin}/supabase-proxy`;
  return createClient(url, key);
}
