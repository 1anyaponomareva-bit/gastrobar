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
 * По умолчанию: прямой `NEXT_PUBLIC_SUPABASE_URL` (PostgREST) — CORS на стороне Supabase; без лишнего hop через Vercel.
 * Прокси на сайт: `NEXT_PUBLIC_SUPABASE_USE_PROXY=1` → `${origin}/supabase-proxy` (только при необходимости).
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const b = getBucket();
  if (b.done) return b.client;

  b.done = true;
  const key = getSupabasePublicApiKey();
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !rawUrl) {
    b.client = null;
    return null;
  }
  const direct = rawUrl.replace(/\/+$/, "");
  const useProxy = process.env.NEXT_PUBLIC_SUPABASE_USE_PROXY === "1";
  const url = useProxy ? `${window.location.origin}/supabase-proxy` : direct;
  if (process.env.NODE_ENV === "development" && !useProxy) {
    try {
      console.log("[gastrobar] Supabase: direct", new URL(direct).host);
    } catch {
      /* ignore */
    }
  }

  /** Один повтор при TypeError: Failed to fetch (обрыв / холодный прокси / моб. сети). */
  const fetchResilient: typeof fetch = async (input, init) => {
    const nextInit = { ...init, cache: "no-store" as const };
    try {
      return await fetch(input, nextInit);
    } catch (e) {
      if (e instanceof TypeError) {
        await new Promise((r) => setTimeout(r, 200));
        return await fetch(input, nextInit);
      }
      throw e;
    }
  };

  b.client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryAuthStorage,
      storageKey: "gastrobar-durak-memory",
    },
    db: { timeout: 30_000 },
    global: { fetch: fetchResilient },
  });
  return b.client;
}
