import { NextResponse } from "next/server";
import { getPosterApiToken } from "@/lib/poster/client";
import { POSTER_API_BASE_URL } from "@/lib/poster/constants";
import { getPosterMenuForVenue, getUnmatchedPosterProducts, type PosterMenuVenue } from "@/lib/poster/menuService";

export const runtime = "nodejs";

function parseVenue(value: string | null): PosterMenuVenue | null {
  if (value === "bar" || value === "food") return value;
  return null;
}

export async function GET(request: Request) {
  if (!getPosterApiToken()) {
    return NextResponse.json({
      success: false,
      error: "TOKEN_NOT_FOUND",
    });
  }

  const { searchParams } = new URL(request.url);

  if (searchParams.get("debug") === "hotdogs") {
    const { posterApiGet } = await import("@/lib/poster/client");
    const result = await posterApiGet<Record<string, unknown>[]>("menu.getProducts");
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.errorText });
    }
    const hotdogs = (result.data ?? []).filter(
      (p) => String(p.category_name ?? "").toUpperCase() === "HOT DOGS",
    );
    return NextResponse.json({ success: true, count: hotdogs.length, hotdogs });
  }

  const venue = parseVenue(searchParams.get("venue"));

  if (!venue) {
    return NextResponse.json({
      success: false,
      error: "INVALID_VENUE",
      message: "Use ?venue=bar or ?venue=food",
    });
  }

  const payload = await getPosterMenuForVenue(venue);

  if (searchParams.get("debug") === "unmatched") {
    const unmatched = await getUnmatchedPosterProducts(venue);
    return NextResponse.json({
      success: true,
      venue,
      unmatched,
      unmatchedCount: unmatched.length,
    });
  }

  return NextResponse.json({
    ...payload,
    posterBaseUrl: POSTER_API_BASE_URL,
    endpoint: "menu.getProducts",
  });
}
