import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "edge";

function getMenuPeriodFromHour(hour: number): string {
  if (hour >= 9 && hour < 12) return "breakfast";
  if (hour >= 12 && hour < 17) return "lunch";
  return "dinner";
}

export function middleware(request: NextRequest) {
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
    /* supabase-proxy: без лишнего edge-hop перед Node Route Handler (меньше сбоев fetch). */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json|supabase-proxy|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
