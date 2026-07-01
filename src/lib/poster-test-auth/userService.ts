import { createHash, createHmac } from "crypto";
import type { PosterTestAuthProvider, PosterTestUser } from "@/lib/poster-test-auth/types";
import { getPosterTestAdminClient } from "@/lib/poster-test-auth/db";

type UserRow = {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  telegram_id: number | null;
  provider: PosterTestAuthProvider;
  role: "guest" | "staff" | "admin";
  bonus_points: number;
  qr_slug: string;
  created_at: string;
  updated_at: string;
};

function mapUser(row: UserRow): PosterTestUser {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    email: row.email,
    telegramId: row.telegram_id,
    provider: row.provider,
    role: row.role,
    bonusPoints: row.bonus_points,
    qrSlug: row.qr_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPosterTestUserById(userId: string): Promise<PosterTestUser | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("poster_test_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapUser(data as UserRow);
}

export async function getPosterTestUserByQrSlug(slug: string): Promise<PosterTestUser | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("poster_test_users")
    .select("*")
    .eq("qr_slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapUser(data as UserRow);
}

export async function upsertGoogleUser(input: {
  email: string;
  name: string;
  avatar?: string | null;
}): Promise<PosterTestUser | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0] || "Guest";

  const { data: existing, error: existingError } = await client
    .from("poster_test_users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existingError) return null;

  if (existing) {
    const { data, error } = await client
      .from("poster_test_users")
      .update({
        name,
        avatar: input.avatar ?? (existing as UserRow).avatar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as UserRow).id)
      .select("*")
      .single();
    if (error || !data) return null;
    return mapUser(data as UserRow);
  }

  const { data, error } = await client
    .from("poster_test_users")
    .insert({
      name,
      avatar: input.avatar ?? null,
      email,
      provider: "google",
      role: "guest",
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapUser(data as UserRow);
}

export async function upsertTelegramUser(input: {
  telegramId: number;
  name: string;
  avatar?: string | null;
}): Promise<PosterTestUser | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const name = input.name.trim() || "Telegram user";

  const { data: existing, error: existingError } = await client
    .from("poster_test_users")
    .select("*")
    .eq("telegram_id", input.telegramId)
    .maybeSingle();

  if (existingError) return null;

  if (existing) {
    const { data, error } = await client
      .from("poster_test_users")
      .update({
        name,
        avatar: input.avatar ?? (existing as UserRow).avatar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as UserRow).id)
      .select("*")
      .single();
    if (error || !data) return null;
    return mapUser(data as UserRow);
  }

  const { data, error } = await client
    .from("poster_test_users")
    .insert({
      name,
      avatar: input.avatar ?? null,
      telegram_id: input.telegramId,
      provider: "telegram",
      role: "guest",
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapUser(data as UserRow);
}

export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export function verifyTelegramAuth(payload: TelegramAuthPayload, botToken: string): boolean {
  const { hash, ...rest } = payload;
  if (!hash) return false;

  const dataCheckString = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return false;

  const maxAgeSeconds = 60 * 60 * 24;
  const now = Math.floor(Date.now() / 1000);
  return now - payload.auth_date <= maxAgeSeconds;
}

export function telegramDisplayName(payload: TelegramAuthPayload): string {
  const full = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (payload.username) return `@${payload.username}`;
  return `Telegram ${payload.id}`;
}
