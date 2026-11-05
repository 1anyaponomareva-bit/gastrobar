import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";
import type { RecipeOverrides, StoredRecipes } from "@/data/recipes";
import type { StaffCatalog } from "@/data/staffCatalog";

const BUCKET = "recipes-admin";
const PHOTOS_BUCKET = "recipes-photos";
const ADMINS_FILE = "admins.json";
const OVERRIDES_FILE = "overrides.json";
const RECIPES_FILE = "recipes.json";
const STAFF_CATALOG_FILE = "staff-catalog.json";
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

/** How long a server instance trusts its copy of the admin list for session checks. */
export const ADMIN_LIST_TTL_MS = 60_000;
let adminEmails: { at: number; emails: Promise<Set<string>> } | null = null;

/**
 * Admin emails for session checks. Signed session cookies are verified on every request; the
 * list (only needed to reject deleted accounts) is re-read at most once a minute per instance.
 */
export function readAdminEmails(): Promise<Set<string>> {
  if (!adminEmails || Date.now() - adminEmails.at > ADMIN_LIST_TTL_MS) {
    const emails = readAdmins().then((admins) => new Set(admins.map((admin) => admin.email)));
    adminEmails = { at: Date.now(), emails };
    emails.catch(() => {
      adminEmails = null;
    });
  }
  return adminEmails.emails;
}

export async function writeAdmins(admins: RecipesAdminAccount[]) {
  adminEmails = null;
  await writeJson(ADMINS_FILE, admins);
  adminEmails = null;
}

export function readOverrides() {
  return readJson<RecipeOverrides>(OVERRIDES_FILE, {});
}

export function writeOverrides(overrides: RecipeOverrides) {
  return writeJson(OVERRIDES_FILE, overrides);
}

export async function readStoredRecipes(): Promise<StoredRecipes> {
  const stored = await readJson<Partial<StoredRecipes>>(RECIPES_FILE, {});
  return { recipes: stored.recipes ?? [], deleted: stored.deleted ?? [] };
}

export function writeStoredRecipes(stored: StoredRecipes) {
  return writeJson(RECIPES_FILE, stored);
}

export function readStaffCatalog() {
  return readJson<StaffCatalog | null>(STAFF_CATALOG_FILE, null);
}

export function writeStaffCatalog(catalog: StaffCatalog) {
  return writeJson(STAFF_CATALOG_FILE, catalog);
}

/** Copy of the Staff file taken once before the shared catalog first overwrites it. */
const STAFF_CATALOG_BACKUP_FILE = "staff-catalog.before-erp.json";

export function readStaffCatalogBackup() {
  return readJson<StaffCatalog | null>(STAFF_CATALOG_BACKUP_FILE, null);
}

export function writeStaffCatalogBackup(catalog: StaffCatalog) {
  return writeJson(STAFF_CATALOG_BACKUP_FILE, catalog);
}

let photosBucketReady = false;

/** Uploads a JPEG to the public photos bucket and returns its public URL. */
export async function uploadRecipePhoto(path: string, jpeg: Buffer): Promise<string> {
  const supabase = getClient();
  if (!photosBucketReady) {
    const { data } = await supabase.storage.getBucket(PHOTOS_BUCKET);
    if (!data) {
      const { error } = await supabase.storage.createBucket(PHOTOS_BUCKET, { public: true });
      if (error && !/already exists/i.test(error.message)) throw error;
    }
    photosBucketReady = true;
  }
  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, jpeg, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
