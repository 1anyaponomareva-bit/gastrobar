import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicApiKey } from "@/lib/supabase/public-key";

/**
 * Клиент в браузере: запросы на тот же origin → `/supabase-proxy` → Route Handler → Supabase.
 * Auth по умолчанию ходит в `/auth/v1` (через прокси); для игры/колеса сессия не нужна — отключаем,
 * чтобы меньше сетевых вызовов и меньше шансов «TypeError: Load failed» в Safari / встроенных браузерах.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const key = getSupabasePublicApiKey();
  if (!key) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) return null;
  const url = `${window.location.origin}/supabase-proxy`;

  const fetchNoStore: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: "no-store" });

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { timeout: 30_000 },
    global: { fetch: fetchNoStore },
  });
}
