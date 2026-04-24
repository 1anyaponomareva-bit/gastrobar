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

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Второй хост для PostgREST: same-origin `/supabase-proxy` ↔ прямой `*.supabase.co`
 * (если один путь стабильно падает в WebKit — пробуем другой).
 */
function alternatePostgrestUrl(
  requestUrl: string,
  directBase: string,
  proxyPrefix: string
): string | null {
  try {
    const u = new URL(requestUrl, window.location.origin);
    const directOrigin = new URL(directBase).origin;
    if (u.origin === directOrigin) {
      return `${proxyPrefix.replace(/\/$/, "")}${u.pathname}${u.search}`;
    }
    if (u.origin === window.location.origin && u.pathname.startsWith("/supabase-proxy")) {
      const tail = u.pathname.slice("/supabase-proxy".length) + u.search;
      return `${directOrigin}${tail.startsWith("/") ? tail : `/${tail}`}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Один экземпляр Supabase JS на вкладку (через globalThis — на случай дублирования модуля в разных чанках).
 * По умолчанию: `/supabase-proxy` (тот же сайт, без cross-origin к Supabase — меньше сбоев в Safari/PWA).
 * Прямой PostgREST: `NEXT_PUBLIC_SUPABASE_USE_DIRECT=1` (отладка / если прокси режет на хостинге).
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
  const directBase = rawUrl.replace(/\/+$/, "");
  const proxyPrefix = `${window.location.origin}/supabase-proxy`;
  const useDirect = process.env.NEXT_PUBLIC_SUPABASE_USE_DIRECT === "1";
  const url = useDirect ? directBase : proxyPrefix;
  if (process.env.NODE_ENV === "development") {
    console.log("[gastrobar] Supabase:", useDirect ? `direct ${new URL(directBase).host}` : "same-site proxy");
  }

  /**
   * supabase-js при POST часто передаёт `Request` с телом. Повтор `fetch(тот же Request)` без clone()
   * даёт TypeError: Failed to fetch / Load failed (тело прочитано один раз).
   */
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
    try {
      return await run(second);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
    const href = requestUrlString(input);
    const alt = alternatePostgrestUrl(href, directBase, proxyPrefix);
    if (!alt) throw new TypeError("Failed to fetch");
    await new Promise((r) => setTimeout(r, 150));
    if (input instanceof Request) {
      const cloned = input.clone();
      return await fetch(alt, {
        method: cloned.method,
        headers: cloned.headers,
        body: cloned.body,
        cache: "no-store",
        redirect: cloned.redirect,
        integrity: cloned.integrity,
        keepalive: cloned.keepalive,
        mode: cloned.mode,
        referrer: cloned.referrer,
        signal: nextInit.signal ?? cloned.signal,
      });
    }
    return await fetch(alt, nextInit);
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
