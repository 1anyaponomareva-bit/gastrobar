import { NextResponse } from "next/server";
import { getPosterApiToken } from "@/lib/poster/client";
import { POSTER_API_BASE_URL } from "@/lib/poster/constants";
import {
  getPosterMenuForVenue,
  getPosterProductsWithModifiers,
  getUnmatchedPosterProducts,
  type PosterMenuVenue,
} from "@/lib/poster/menuService";

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

  if (searchParams.get("debug") === "unmatched") {
    const unmatched = await getUnmatchedPosterProducts(venue);
    return NextResponse.json({
      success: true,
      venue,
      unmatched,
      unmatchedCount: unmatched.length,
    });
  }

  if (searchParams.get("debug") === "modifiers") {
    const query = searchParams.get("q") ?? "pita";
    const products = await getPosterProductsWithModifiers(query);
    return NextResponse.json({
      success: true,
      venue,
      query,
      productCount: products.length,
      products,
    });
  }

  return NextResponse.json({
    ...payload,
    posterBaseUrl: POSTER_API_BASE_URL,
    endpoint: "menu.getProducts",
  });
}
