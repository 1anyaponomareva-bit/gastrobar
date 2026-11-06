import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  decideErpHostGate,
  ERP_HOST_GATE_NO_STORE,
  productionErpHostEnv,
  readErpHostGateConfig,
} from "@/lib/erp/hostGate";

export const runtime = "edge";

function getMenuPeriodFromHour(hour: number): string {
  if (hour >= 9 && hour < 12) return "breakfast";
  if (hour >= 12 && hour < 17) return "lunch";
  return "dinner";
}

function isKitchenHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === "kitchen" || hostname.startsWith("kitchen.");
}

function withMenuPeriod(response: NextResponse, period: string): NextResponse {
  response.headers.set("x-menu-period", period);
  return response;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", ERP_HOST_GATE_NO_STORE);
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function middleware(request: NextRequest) {
  const hour = new Date().getHours();
  const period = getMenuPeriodFromHour(hour);
  const host = request.headers.get("host") ?? "";
  // Static process.env.* so Vercel Edge binds these flags at deploy (A vs B vs C stay split).
  const gate = decideErpHostGate(
    {
      hostHeader: host,
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      method: request.method,
    },
    readErpHostGateConfig(
      productionErpHostEnv({
        ERP_HOSTS: process.env.ERP_HOSTS,
        ERP_REDIRECT_FROM_LEGACY: process.env.ERP_REDIRECT_FROM_LEGACY,
        ERP_CLOSE_LEGACY_API: process.env.ERP_CLOSE_LEGACY_API,
      }),
    ),
  );

  if (gate.action === "redirect") {
    return noStore(withMenuPeriod(NextResponse.redirect(gate.location, gate.status), period));
  }
  if (gate.action === "json") {
    return noStore(withMenuPeriod(NextResponse.json(gate.body, { status: gate.status }), period));
  }
  if (gate.action === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = gate.pathname;
    return noStore(withMenuPeriod(NextResponse.rewrite(url), period));
  }

  if (isKitchenHost(host) && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/kitchen";
    return withMenuPeriod(NextResponse.rewrite(url), period);
  }

  return withMenuPeriod(NextResponse.next(), period);
}

/** Не гоняем статику и оптимизацию картинок через middleware — стабильная выдача `public/*.png` и т.п. */
export const config = {
  matcher: [
    /* Главная: паттерн ниже иногда не матчит «/» в path-to-regexp — явно. */
    "/",
    "/bar",
    "/check",
    "/check/:path*",
    "/kitchen",
    "/kitchen/:path*",
    "/recipes",
    "/recipes/:path*",
    "/test",
    "/test/:path*",
    "/staff",
    "/staff/:path*",
    "/erp",
    "/erp/:path*",
    "/stock",
    "/stock/:path*",
    "/menu",
    "/menu/:path*",
    "/products",
    "/products/:path*",
    "/preps",
    "/preps/:path*",
    "/documents",
    "/documents/:path*",
    "/service",
    "/service/:path*",
    "/settings",
    "/catalog",
    "/production",
    "/review",
    "/api/:path*",
    /* supabase-proxy: без лишнего edge-hop перед Node Route Handler (меньше сбоев fetch). */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|sw.js|supabase-proxy|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
