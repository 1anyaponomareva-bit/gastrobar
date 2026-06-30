import { POSTER_API_BASE_URL } from "./constants";
import type { PosterApiError, PosterApiSuccess } from "./types";

type PosterFetchResult<T> =
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; httpStatus: number; error: unknown; errorText: string };

export function getPosterApiToken(): string | null {
  const token = process.env.POSTER_API_TOKEN?.trim();
  return token || null;
}

export async function posterApiGet<T>(
  method: string,
  params: Record<string, string> = {},
): Promise<PosterFetchResult<T>> {
  const token = getPosterApiToken();
  if (!token) {
    return {
      ok: false,
      httpStatus: 500,
      error: "TOKEN_NOT_FOUND",
      errorText: "POSTER_API_TOKEN is not configured",
    };
  }

  const requestUrl = new URL(`${POSTER_API_BASE_URL}/${method}`);
  requestUrl.searchParams.set("format", "json");
  requestUrl.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    requestUrl.searchParams.set(key, value);
  }

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
    let parsed: PosterApiSuccess<T> | PosterApiError | null = null;

    try {
      parsed = rawText ? (JSON.parse(rawText) as PosterApiSuccess<T> | PosterApiError) : null;
    } catch {
      return {
        ok: false,
        httpStatus,
        error: "INVALID_JSON",
        errorText: rawText || `HTTP ${httpStatus}`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        httpStatus,
        error: parsed,
        errorText: rawText || `HTTP ${httpStatus}`,
      };
    }

    if (parsed && "error" in parsed) {
      return {
        ok: false,
        httpStatus,
        error: parsed.error,
        errorText:
          typeof parsed.error === "object" && parsed.error && "message" in parsed.error
            ? String(parsed.error.message)
            : rawText,
      };
    }

    return {
      ok: true,
      httpStatus,
      data: (parsed as PosterApiSuccess<T>).response,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      error: "FETCH_FAILED",
      errorText: err instanceof Error ? err.message : String(err),
    };
  }
}
