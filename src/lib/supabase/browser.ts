import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicApiKey } from "@/lib/supabase/public-key";

type SupabaseBucket = { client: SupabaseClient | null; done: boolean };

function getBucket(): SupabaseBucket {
  const g = globalThis as typeof globalThis & { __GASTROBAR_SB_CLIENT__?: SupabaseBucket };
  if (!g.__GASTROBAR_SB_CLIENT__) {
    g.__GASTROBAR_SB_CLIENT__ = { client: null, done: false };
  }
  return g.__GASTROBAR_SB_CLIENT__;
}

/** Без localStorage: иначе GoTrue кладёт `sb-…-auth-token` и при двух бандлах/инстансах — предупреждения и гонки. */
const memoryAuthStorage = {
  getItem: (_key: string) => null as string | null,
  setItem: (_key: string, _value: string) => undefined,
  removeItem: (_key: string) => undefined,
};

/**
 * Один экземпляр Supabase JS на вкладку (через globalThis — на случай дублирования модуля в разных чанках).
 * Клиент в браузере: запросы на тот же origin → `/supabase-proxy` → Route Handler → Supabase.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const b = getBucket();
  if (b.done) return b.client;

  b.done = true;
  const key = getSupabasePublicApiKey();
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    b.client = null;
    return null;
  }
  const url = `${window.location.origin}/supabase-proxy`;

  const fetchNoStore: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: "no-store" });

  b.client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryAuthStorage,
      storageKey: "gastrobar-durak-memory",
    },
    db: { timeout: 30_000 },
    global: { fetch: fetchNoStore },
  });
  return b.client;
}
