import { NextResponse } from "next/server";

export const runtime = "nodejs";

const POSTER_API_BASE_URL = "https://joinposter.com/api";
const POSTER_TEST_METHOD = "settings.getAllSettings";

function maskTokenInUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]+/i, "$1***");
}

export async function GET() {
  const token = process.env.POSTER_API_TOKEN?.trim();

  if (!token) {
    return NextResponse.json({
      success: false,
      error: "TOKEN_NOT_FOUND",
    });
  }

  const requestUrl = new URL(`${POSTER_API_BASE_URL}/${POSTER_TEST_METHOD}`);
  requestUrl.searchParams.set("format", "json");
  requestUrl.searchParams.set("token", token);

  try {
    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Gastrobar-Poster-Test/1.0",
      },
      cache: "no-store",
    });

    const httpStatus = response.status;
    const rawText = await response.text();

    let posterResponse: unknown = null;
    try {
      posterResponse = rawText ? JSON.parse(rawText) : null;
    } catch {
      posterResponse = { raw: rawText };
    }

    const posterError =
      posterResponse &&
      typeof posterResponse === "object" &&
      "error" in posterResponse
        ? (posterResponse as { error: unknown }).error
        : null;

    const errorText =
      posterError &&
      typeof posterError === "object" &&
      posterError !== null &&
      "message" in posterError
        ? String((posterError as { message: unknown }).message)
        : !response.ok
          ? rawText || `HTTP ${httpStatus}`
          : null;

    if (!response.ok || posterError) {
      return NextResponse.json({
        success: false,
        tokenFound: true,
        posterBaseUrl: POSTER_API_BASE_URL,
        endpoint: POSTER_TEST_METHOD,
        requestUrl: maskTokenInUrl(requestUrl.toString()),
        httpStatus,
        error: posterError ?? `HTTP_${httpStatus}`,
        errorText,
        posterResponse,
      });
    }

    return NextResponse.json({
      success: true,
      tokenFound: true,
      posterBaseUrl: POSTER_API_BASE_URL,
      endpoint: POSTER_TEST_METHOD,
      requestUrl: maskTokenInUrl(requestUrl.toString()),
      httpStatus,
      posterResponse,
    });
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);

    return NextResponse.json({
      success: false,
      tokenFound: true,
      posterBaseUrl: POSTER_API_BASE_URL,
      endpoint: POSTER_TEST_METHOD,
      requestUrl: maskTokenInUrl(requestUrl.toString()),
      error: "FETCH_FAILED",
      errorText,
    });
  }
}
