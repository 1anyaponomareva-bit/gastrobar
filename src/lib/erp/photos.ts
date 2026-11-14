import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { erpLocalMode } from "./localDb";
import { erpDb } from "./server";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

export const ERP_PHOTOS_BUCKET = "erp-photos";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1600;

export function erpPhotoPublicUrl(path: string): string | null {
  const base = getSupabaseBackendUrl();
  return base ? `${base}/storage/v1/object/public/${ERP_PHOTOS_BUCKET}/${path}` : null;
}

export function isErpPhotoUrl(value: string): boolean {
  if (!value) return false;
  if (erpLocalMode() && value.startsWith("data:image/")) return true;
  const base = getSupabaseBackendUrl();
  return Boolean(base && value.startsWith(`${base}/storage/v1/object/public/${ERP_PHOTOS_BUCKET}/`));
}

export async function jpegFromUpload(file: Blob): Promise<Buffer> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("ERP_PHOTO_FILE");
  return sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** JPEG in the public ERP photos bucket (not recipes.json / staff catalog). */
export async function uploadErpPhoto(jpeg: Buffer, folder = "preps"): Promise<string> {
  const path = `${folder.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "preps"}/${randomUUID()}.jpg`;
  if (erpLocalMode()) return `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  const supabase = erpDb();
  const { data: bucket } = await supabase.storage.getBucket(ERP_PHOTOS_BUCKET);
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(ERP_PHOTOS_BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  const { error } = await supabase.storage
    .from(ERP_PHOTOS_BUCKET)
    .upload(path, jpeg, { upsert: false, contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  const url = erpPhotoPublicUrl(path);
  if (!url) throw new Error("ERP_NOT_CONFIGURED");
  return url;
}
