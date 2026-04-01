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

function forwardResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((value, key) => {
    const low = key.toLowerCase();
    if (low === "transfer-encoding") return;
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

  const upstream = await fetch(target, {
    method: req.method,
    headers: forwardRequestHeaders(req.headers),
    body: hasBody ? body : undefined,
    redirect: "manual",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardResponseHeaders(upstream.headers),
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
