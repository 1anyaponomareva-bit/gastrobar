import { NextResponse } from "next/server";
import { getPosterApiToken } from "@/lib/poster/client";
import { POSTER_API_BASE_URL } from "@/lib/poster/constants";
import { getPosterMenuForVenue, type PosterMenuVenue } from "@/lib/poster/menuService";

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
  const venue = parseVenue(searchParams.get("venue"));

  if (!venue) {
    return NextResponse.json({
      success: false,
      error: "INVALID_VENUE",
      message: "Use ?venue=bar or ?venue=food",
    });
  }

  const payload = await getPosterMenuForVenue(venue);

  return NextResponse.json({
    ...payload,
    posterBaseUrl: POSTER_API_BASE_URL,
    endpoint: "menu.getProducts",
  });
}
