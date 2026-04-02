import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicApiKey } from "@/lib/supabase/public-key";

/**
 * Один экземпляр на вкладку: иначе два createClient (матчмейкинг + стол) дают
 * «Multiple GoTrueClient instances» и непредсказуемое поведение auth/storage.
 */
let browserClientSingleton: SupabaseClient | null = null;
let browserClientInitDone = false;

/**
 * Клиент в браузере: запросы на тот же origin → `/supabase-proxy` → Route Handler → Supabase.
 * Auth по умолчанию ходит в `/auth/v1` (через прокси); для игры/колеса сессия не нужна — отключаем,
 * чтобы меньше сетевых вызовов и меньше шансов «TypeError: Load failed» в Safari / встроенных браузерах.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (browserClientInitDone) return browserClientSingleton;

  browserClientInitDone = true;
  const key = getSupabasePublicApiKey();
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    browserClientSingleton = null;
    return null;
  }
  const url = `${window.location.origin}/supabase-proxy`;

  const fetchNoStore: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: "no-store" });

  browserClientSingleton = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      /* Свой ключ хранилища — не делим с другим возможным клиентом в том же бандле */
      storageKey: "gastrobar-supabase",
    },
    db: { timeout: 30_000 },
    global: { fetch: fetchNoStore },
  });
  return browserClientSingleton;
}
