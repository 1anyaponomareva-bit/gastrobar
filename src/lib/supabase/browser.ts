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

const memoryAuthStorage = {
  getItem: (_key: string) => null as string | null,
  setItem: (_key: string, _value: string) => undefined,
  removeItem: (_key: string) => undefined,
};

/**
 * Клиент только на `process.env.NEXT_PUBLIC_SUPABASE_URL` + anon/publishable key.
 * Прокси `/supabase-proxy` не используем — единый источник URL из Vercel.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const b = getBucket();
  if (b.done) return b.client;

  b.done = true;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const supabaseKey = getSupabasePublicApiKey();
  if (!supabaseKey || !supabaseUrl) {
    b.client = null;
    return null;
  }

  if (process.env.NODE_ENV === "development") {
    try {
      console.log("[gastrobar] Supabase client:", new URL(supabaseUrl).host);
    } catch {
      /* ignore */
    }
  }

  const fetchResilient: typeof fetch = async (input, init) => {
    const nextInit: RequestInit = { ...init, cache: "no-store" };
    const run = (inp: RequestInfo | URL) => fetch(inp, nextInit);
    try {
      return await run(input);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
    await new Promise((r) => setTimeout(r, 200));
    const second = input instanceof Request ? input.clone() : input;
    return run(second);
  };

  b.client = createClient(supabaseUrl, supabaseKey, {
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
