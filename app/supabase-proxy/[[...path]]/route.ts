import dns from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

/* Vercel/Node: undici к *.supabase.co иногда падает на IPv6 (fetch failed) — сначала A-запись. */
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
import {
  assertBodySizeAllowed,
  getClientIp,
  isSupabaseProxyPathAllowed,
  PROXY_MAX_BODY_BYTES,
  rateLimitOrPass,
} from "@/lib/supabase/proxy-guards";
import { getSupabaseServerAnonKey } from "@/lib/supabase/server-anon-key";

export const runtime = "nodejs";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

function forwardRequestHeaders(incoming: Headers): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    const low = key.toLowerCase();
    if (HOP_BY_HOP.has(low) || low === "host") return;
    out.set(key, value);
  });
  return out;
}

const STRIP_FROM_CLIENT_TO_UPSTREAM = new Set([
  "authorization",
  "apikey",
  "x-client-enc-api-key",
]);

/** К Supabase: не форвардить gzip/br от браузера — иначе Node распаковывает, а цепочка до клиента ломается (ERR_CONTENT_DECODING_FAILED). */
function buildUpstreamRequestHeaders(incoming: Headers, serverAnonKey: string): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    const low = key.toLowerCase();
    if (HOP_BY_HOP.has(low) || low === "host") return;
    if (STRIP_FROM_CLIENT_TO_UPSTREAM.has(low)) return;
    out.set(key, value);
  });
  out.delete("accept-encoding");
  out.set("Accept-Encoding", "identity");
  out.delete("content-length");
  out.delete("transfer-encoding");
  out.set("apikey", serverAnonKey);
  out.set("Authorization", `Bearer ${serverAnonKey}`);
  return out;
}

/** Убираем заголовки, которые ломают повторную выдачу через Vercel/браузер при буферизованном теле. */
const STRIP_FROM_PROXY_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

function forwardResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((value, key) => {
    const low = key.toLowerCase();
    if (STRIP_FROM_PROXY_RESPONSE.has(low)) return;
    out.set(key, value);
  });
  return out;
}

async function proxy(req: NextRequest, pathSegments: string[] | undefined) {
  const pubUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const backend = getSupabaseBackendUrl();
  if (!pubUrl?.trim()) {
    console.warn(
      "[supabase-proxy] NEXT_PUBLIC_SUPABASE_URL is undefined (браузерный клиент без неё не создаётся; для прокси на сервере можно задать только SUPABASE_URL)",
    );
  }
  if (!backend) {
    return NextResponse.json(
      { error: "Supabase URL not configured (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)" },
      { status: 503 },
    );
  }

  const serverKey = getSupabaseServerAnonKey();
  if (!serverKey) {
    return NextResponse.json(
      { error: "Supabase anon key missing (SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)" },
      { status: 503 },
    );
  }

  if (!isSupabaseProxyPathAllowed(pathSegments)) {
    console.warn("[supabase-proxy] blocked path", pathSegments?.join("/") ?? "");
    return NextResponse.json(
      { error: "Forbidden", code: "PROXY_PATH_NOT_ALLOWED" },
      { status: 403 },
    );
  }

  const ip = getClientIp(req);
  if (!rateLimitOrPass(req.method, ip)) {
    console.warn("[supabase-proxy] rate limit", ip, req.method);
    return NextResponse.json(
      { error: "Too Many Requests", code: "PROXY_RATE_LIMIT" },
      { status: 429 },
    );
  }

  const sizeCheck = assertBodySizeAllowed(req.headers.get("content-length"));
  if (!sizeCheck.ok) {
    console.warn("[supabase-proxy] body too large", ip);
    return NextResponse.json(
      {
        error: `Body too large (max ${sizeCheck.max} bytes)`,
        code: "PROXY_BODY_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  const tail = pathSegments?.length ? pathSegments.join("/").replace(/^\/+/, "") : "";
  const base = backend.replace(/\/+$/, "");
  const href = tail ? `${base}/${tail}` : `${base}/`;
  let target: URL;
  try {
    target = new URL(href);
  } catch {
    console.warn("[supabase-proxy] invalid target URL", { href: href.slice(0, 256), tail });
    return NextResponse.json(
      { error: "Invalid upstream URL", code: "PROXY_BAD_TARGET" },
      { status: 500 },
    );
  }
  target.search = req.nextUrl.search;

  const proxyDebug = process.env.SUPABASE_PROXY_DEBUG === "1";
  if (proxyDebug) {
    const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    console.warn("[supabase-proxy] debug", {
      method: req.method,
      pathSegments,
      pathnameTail: tail,
      targetHref: target.href,
      NEXT_PUBLIC_SUPABASE_URL_set: Boolean(pub),
      NEXT_PUBLIC_SUPABASE_URL_host: pub ? (() => { try { return new URL(pub).host; } catch { return "parse_err"; } })() : null,
      backendHost: target.host,
    });
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    const raw = await req.arrayBuffer();
    if (raw.byteLength > PROXY_MAX_BODY_BYTES) {
      console.warn("[supabase-proxy] body exceeds cap after read", ip);
      return NextResponse.json(
        { error: "Payload Too Large", code: "PROXY_BODY_TOO_LARGE" },
        { status: 413 },
      );
    }
    body = raw;
  }

  const init: RequestInit = {
    method: req.method,
    headers: buildUpstreamRequestHeaders(req.headers, serverKey),
    body: hasBody ? body : undefined,
    redirect: "manual",
  };

  let upstream!: Response;
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
    try {
      upstream = await fetch(target, init);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < attempts - 1) {
        console.warn("[supabase-proxy] fetch retry", {
          attempt: attempt + 1,
          nextInMs: 200 * (attempt + 1),
          pathTail: tail,
          err: msg,
        });
        continue;
      }
      const cause = e instanceof Error && "cause" in e ? (e as Error & { cause?: unknown }).cause : undefined;
      const causeStr =
        cause instanceof Error
          ? `${cause.name}: ${cause.message}`
          : cause != null
            ? String(cause)
            : undefined;
      const netHint =
        causeStr && /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(causeStr + msg);
      const isEnoNotFound = /ENOTFOUND|NXDOMAIN|Non-existent|getaddrinfo/i.test(causeStr + msg);
      const badHost = target.host;
      const notFoundHint = isEnoNotFound
        ? `**ENOTFOUND** для \`${badHost}\`: такого субдомена нет в DNS (в мире, не «пауза»). Скопируйте **Project URL** в Supabase → Settings → API и **полностью** замените \`NEXT_PUBLIC_SUPABASE_URL\` в Vercel (и \`SUPABASE_URL\` если задан) — ref в URL должен **буквально** совпадать с дашбордом. Redeploy. Опция: снимите \`NEXT_PUBLIC_SUPABASE_USE_PROXY\` (прямой \`fetch\` к тому же URL). `
        : "Часто: в Vercel в `SUPABASE_URL` не тот URL — удалите или выровняйте с `NEXT_PUBLIC_SUPABASE_URL` (оба = Project URL). ";
      const hint =
        (netHint ? `Сеть/хост. ${notFoundHint}` : "") +
        "Keys: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (или `SUPABASE_ANON_KEY`) с той же страницы API.";
      console.warn("[supabase-proxy] fetch threw after retries", {
        method: req.method,
        target: target.href,
        pathTail: tail,
        error: msg,
        cause: causeStr,
      });
      return NextResponse.json(
        {
          message: `Proxy fetch failed: ${msg}${causeStr ? ` (${causeStr})` : ""}`,
          hint,
          code: "PROXY_FETCH_ERROR",
        },
        { status: 502 },
      );
    }
  }

  const resHeaders = forwardResponseHeaders(upstream.headers);

  if (req.method === "HEAD") {
    return new NextResponse(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  }

  const status = upstream.status;

  /*
   * PostgREST для RPC с RETURNS void отдаёт 204 No Content.
   * В WHATWG/undici/Next нельзя создать Response с телом при 204 — иначе:
   * TypeError: Response constructor: Invalid response status code 204
   */
  if (status === 204 || status === 205 || status === 304) {
    await upstream.arrayBuffer(); /* сбросить тело upstream */
    resHeaders.delete("content-length");
    resHeaders.delete("content-type");
    return new NextResponse(null, {
      status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  }

  /* Буфер: без стрима нет рассинхрона «тело уже распаковано / заголовок gzip» между Node, Next и Chrome. */
  const rawBuf = await upstream.arrayBuffer();
  const decodedTrim = new TextDecoder().decode(rawBuf).trim();
  /* PostgREST иногда отдаёт 5xx с пустым или «пробельным» телом — подставляем JSON для UI. */
  let bodyOut: BodyInit = rawBuf;
  if (upstream.status >= 400 && decodedTrim.length === 0) {
    const hint = JSON.stringify({
      message: `Upstream HTTP ${upstream.status} (${upstream.statusText}) — пустое тело ответа.`,
      details:
        "Выполни в Supabase SQL Editor: GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; затем весь файл supabase/sql/durak_queue_functions_only.sql. Проверка RPC: supabase/sql/durak_debug_test_rpc.sql. Логи: Supabase → Logs → Postgres.",
      hint: "После правок SQL сделай Redeploy на Vercel (нужна актуальная версия прокси /supabase-proxy).",
      code: "EMPTY_UPSTREAM_BODY",
    });
    bodyOut = new TextEncoder().encode(hint);
    resHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new NextResponse(bodyOut, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function OPTIONS(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function HEAD(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
