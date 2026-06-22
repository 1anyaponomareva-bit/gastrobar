import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "edge";

function getMenuPeriodFromHour(hour: number): string {
  if (hour >= 9 && hour < 12) return "breakfast";
  if (hour >= 12 && hour < 17) return "lunch";
  return "dinner";
}

function isCheckHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    hostname === "check.gastrotruck.org" ||
    hostname === "check.localhost" ||
    hostname.startsWith("check.")
  );
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/food/") ||
    pathname.startsWith("/menu/") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (isCheckHost(host)) {
    if (isStaticAssetPath(pathname)) {
      return NextResponse.next();
    }

    if (pathname !== "/check" && !pathname.startsWith("/check/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/check";
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  const hour = new Date().getHours();
  const period = getMenuPeriodFromHour(hour);
  const response = NextResponse.next();
  response.headers.set("x-menu-period", period);
  return response;
}

/** Не гоняем статику и оптимизацию картинок через middleware — стабильная выдача `public/*.png` и т.п. */
export const config = {
  matcher: [
    /* Главная: паттерн ниже иногда не матчит «/» в path-to-regexp — явно. */
    "/",
    "/bar",
    "/check",
    "/check/:path*",
    /* supabase-proxy: без лишнего edge-hop перед Node Route Handler (меньше сбоев fetch). */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|sw.js|supabase-proxy|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
