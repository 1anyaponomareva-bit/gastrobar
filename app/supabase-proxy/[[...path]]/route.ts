import { NextRequest, NextResponse } from "next/server";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

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

/** К Supabase: не форвардить gzip/br от браузера — иначе Node распаковывает, а цепочка до клиента ломается (ERR_CONTENT_DECODING_FAILED). */
function buildUpstreamRequestHeaders(incoming: Headers): Headers {
  const out = forwardRequestHeaders(incoming);
  out.delete("accept-encoding");
  out.set("Accept-Encoding", "identity");
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
  const backend = getSupabaseBackendUrl();
  if (!backend) {
    return NextResponse.json(
      { error: "Supabase URL not configured (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)" },
      { status: 503 },
    );
  }

  const tail = pathSegments?.length ? pathSegments.join("/") : "";
  const href = tail ? `${backend}/${tail}` : `${backend}/`;
  const target = new URL(href);
  target.search = req.nextUrl.search;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: buildUpstreamRequestHeaders(req.headers),
      body: hasBody ? body : undefined,
      redirect: "manual",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        message: `Proxy fetch failed: ${msg}`,
        hint: "Проверьте NEXT_PUBLIC_SUPABASE_URL и доступность проекта Supabase.",
        code: "PROXY_FETCH_ERROR",
      },
      { status: 502 },
    );
  }

  const resHeaders = forwardResponseHeaders(upstream.headers);

  if (req.method === "HEAD") {
    return new NextResponse(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  }

  /* Буфер: без стрима нет рассинхрона «тело уже распаковано / заголовок gzip» между Node, Next и Chrome. */
  const rawBuf = await upstream.arrayBuffer();
  /* Иногда PostgREST/шлюз отдаёт 4xx/5xx с нулевым телом — подставляем JSON, чтобы в UI был текст. */
  let bodyOut: BodyInit = rawBuf;
  if (rawBuf.byteLength === 0 && upstream.status >= 400) {
    const hint = JSON.stringify({
      message: `Upstream HTTP ${upstream.status} (${upstream.statusText}) with empty body.`,
      hint: "Проверьте Supabase → Logs → Postgres; выполните GRANT USAGE ON SCHEMA public для anon и скрипт supabase/sql/durak_queue_functions_only.sql. Локальный тест: supabase/sql/durak_debug_test_rpc.sql",
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
