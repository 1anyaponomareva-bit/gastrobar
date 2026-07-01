import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { PosterTestSessionPayload } from "@/lib/poster-test-auth/types";

export const POSTER_TEST_SESSION_COOKIE = "poster_test_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getAuthSecret(): string | null {
  const secret = process.env.POSTER_TEST_AUTH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createPosterTestSessionToken(userId: string): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;

  const payload: PosterTestSessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${body}.${signBody(body, secret)}`;
}

export function verifyPosterTestSessionToken(token: string): PosterTestSessionPayload | null {
  const secret = getAuthSecret();
  if (!secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = signBody(body, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(body)) as PosterTestSessionPayload;
    if (!payload?.sub || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getPosterTestSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(POSTER_TEST_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyPosterTestSessionToken(token)?.sub ?? null;
}

export function createOAuthState(returnTo: string): string {
  const payload = {
    returnTo,
    nonce: randomBytes(16).toString("hex"),
  };
  return encodeBase64Url(JSON.stringify(payload));
}

export function parseOAuthState(state: string | null): { returnTo: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(state)) as { returnTo?: string };
    const returnTo = typeof parsed.returnTo === "string" ? parsed.returnTo : "/poster-test/account";
    if (!returnTo.startsWith("/poster-test")) return { returnTo: "/poster-test/account" };
    return { returnTo };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: POSTER_TEST_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: POSTER_TEST_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
