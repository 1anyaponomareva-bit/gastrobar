import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { readAdmins, type RecipesAdminAccount } from "./storage";

export const RECIPES_ADMIN_COOKIE = "gf_recipes_admin";
const SESSION_DAYS = 30;

function sessionSecret(): string {
  const secret = process.env.RECIPES_ADMIN_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("RECIPES_ADMIN_SECRET is not configured");
  return secret;
}

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidInvite(invite: unknown): boolean {
  const expected = process.env.RECIPES_ADMIN_INVITE?.trim();
  if (!expected || typeof invite !== "string") return false;
  const a = Buffer.from(invite);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifyPassword(account: RecipesAdminAccount, password: string): boolean {
  const expected = Buffer.from(account.hash, "hex");
  const actual = scryptSync(password, account.salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86_400_000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

/** Email of the signed-in admin, or null. Also rejects sessions of deleted accounts. */
export async function getSessionEmail(): Promise<string | null> {
  const token = (await cookies()).get(RECIPES_ADMIN_COOKIE)?.value;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; x: number };
    if (typeof e !== "string" || typeof x !== "number" || x < Date.now()) return null;
    const admins = await readAdmins();
    return admins.some((admin) => admin.email === e) ? e : null;
  } catch {
    return null;
  }
}
