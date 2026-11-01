import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";
import type { RecipeOverrides } from "@/data/recipes";

const BUCKET = "recipes-admin";
const ADMINS_FILE = "admins.json";
const OVERRIDES_FILE = "overrides.json";

export type RecipesAdminAccount = {
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
};

let client: SupabaseClient | null | undefined;
let bucketReady = false;

function getClient(): SupabaseClient {
  if (client === undefined) {
    const url = getSupabaseBackendUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    client =
      url && key
        ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
        : null;
  }
  if (!client) throw new Error("Supabase service role is not configured");
  return client;
}

async function ensureBucket(supabase: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

/** Reads straight from the storage API with a cache-buster: the SDK download can return a stale CDN copy. */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  const supabase = getClient();
  await ensureBucket(supabase);
  const url = `${getSupabaseBackendUrl()}/storage/v1/object/authenticated/${BUCKET}/${file}?v=${Date.now()}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Cache-Control": "no-cache" },
  });
  if (response.status === 400 || response.status === 404) return fallback;
  if (!response.ok) throw new Error(`Storage read ${file}: ${response.status}`);
  return JSON.parse(await response.text()) as T;
}

async function writeJson(file: string, value: unknown) {
  const supabase = getClient();
  await ensureBucket(supabase);
  const body = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(file, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw error;
}

export function readAdmins() {
  return readJson<RecipesAdminAccount[]>(ADMINS_FILE, []);
}

export function writeAdmins(admins: RecipesAdminAccount[]) {
  return writeJson(ADMINS_FILE, admins);
}

export function readOverrides() {
  return readJson<RecipeOverrides>(OVERRIDES_FILE, {});
}

export function writeOverrides(overrides: RecipeOverrides) {
  return writeJson(OVERRIDES_FILE, overrides);
}
