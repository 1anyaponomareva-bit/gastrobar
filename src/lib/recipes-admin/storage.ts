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

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const supabase = getClient();
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage.from(BUCKET).download(file);
  if (error || !data) {
    const status = (error as { status?: number; statusCode?: string } | null)?.status;
    const notFound = status === 400 || status === 404 || /not.?found/i.test(error?.message ?? "");
    if (notFound || !error) return fallback;
    throw error;
  }
  return JSON.parse(await data.text()) as T;
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
