/**
 * Ограничения для /app/supabase-proxy: allowlist путей, размер тела, простой rate limit.
 * Лимит хранится в памяти инстанса (serverless) — защита от лёгкого спама, не абсолютный потолок.
 */

const ALLOW_POST_BODY_BYTES = 512 * 1024;
const WINDOW_MS = 60_000;
/** Очередь Дурака + сохранение стола делают много POST к /rpc; 180/мин ломало матчмейкинг (2 RPC каждые ~700ms). */
const POST_MAX_PER_WINDOW = 600;
const GET_MAX_PER_WINDOW = 500;

const postBuckets = new Map<string, number[]>();
const getBuckets = new Map<string, number[]>();

function allowRequest(ip: string, kind: "get" | "post"): boolean {
  const now = Date.now();
  const map = kind === "post" ? postBuckets : getBuckets;
  const max = kind === "post" ? POST_MAX_PER_WINDOW : GET_MAX_PER_WINDOW;
  const cut = now - WINDOW_MS;
  let arr = map.get(ip) ?? [];
  arr = arr.filter((t) => t >= cut);
  if (arr.length >= max) {
    map.set(ip, arr);
    return false;
  }
  arr.push(now);
  map.set(ip, arr);
  if (map.size > 50_000) {
    for (const k of map.keys()) {
      if (Math.random() < 0.02) map.delete(k);
    }
  }
  return true;
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

/** PostgREST через прокси: только rest/v1. WebSocket realtime идёт на хост Supabase отдельно. */
export function isSupabaseProxyPathAllowed(pathSegments: string[] | undefined): boolean {
  if (!pathSegments?.length) return false;
  return pathSegments[0] === "rest" && pathSegments[1] === "v1";
}

export function assertBodySizeAllowed(
  contentLength: string | null
): { ok: true } | { ok: false; max: number } {
  if (!contentLength) return { ok: true };
  const n = Number(contentLength);
  if (!Number.isFinite(n) || n < 0) return { ok: true };
  if (n > ALLOW_POST_BODY_BYTES) return { ok: false, max: ALLOW_POST_BODY_BYTES };
  return { ok: true };
}

export function rateLimitOrPass(method: string, ip: string): boolean {
  if (method === "GET" || method === "HEAD") return allowRequest(ip, "get");
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return allowRequest(ip, "post");
  }
  return true;
}

export const PROXY_MAX_BODY_BYTES = ALLOW_POST_BODY_BYTES;
