/**
 * GASTROFOOD tab / home-screen icons from the official lockup.
 * Source is a JPEG saved as .png (opaque near-white, no alpha). Near-white is
 * punched to transparency so the browser-tab favicon is not a white square.
 * Apple-touch keeps a white plate because iOS fills transparent icons with black.
 */
import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "gastrofood", "gastrofood-online-kitchen.png");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
/** Drop JPEG dust so trim can crop to the lockup. Brand yellow/red/green stay: their min channel is far below 245. */
const ALPHA_CUTOFF = 10;

async function punchedLockup() {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const white = Math.min(r, g, b);
    const a = 255 - white;
    if (a < ALPHA_CUTOFF) continue;
    out[i] = Math.min(255, Math.round(((r - white) * 255) / a));
    out[i + 1] = Math.min(255, Math.round(((g - white) * 255) / a));
    out[i + 2] = Math.min(255, Math.round(((b - white) * 255) / a));
    out[i + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
}

const lockup = await punchedLockup();

async function make(size, out, pad = 0.1, plate = TRANSPARENT) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * pad)));
  const logo = await sharp(lockup)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();
  let pipeline = sharp({
    create: { width: size, height: size, channels: 4, background: plate },
  }).composite([{ input: logo, gravity: "centre" }]);
  if (plate === WHITE) pipeline = pipeline.flatten({ background: WHITE });
  await pipeline.ensureAlpha().png().toFile(out);
  console.log("Wrote", out);
}

const gastro = join(root, "public", "gastrofood");

await make(32, join(gastro, "favicon-32.png"), 0.08);
await make(180, join(gastro, "apple-touch-icon.png"), 0.1, WHITE);
await make(192, join(gastro, "icon-192.png"), 0.1);
await make(512, join(gastro, "icon-512.png"), 0.1);
await make(32, join(root, "app", "coming-soon", "icon.png"), 0.08);
await make(180, join(root, "app", "coming-soon", "apple-icon.png"), 0.1, WHITE);
await make(32, join(root, "app", "erp", "icon.png"), 0.08);
await make(180, join(root, "app", "erp", "apple-icon.png"), 0.1, WHITE);
await make(32, join(root, "app", "orders", "icon.png"), 0.08);
await make(180, join(root, "app", "orders", "apple-icon.png"), 0.1, WHITE);
await make(32, join(root, "app", "recipes", "icon.png"), 0.08);
await make(180, join(root, "app", "recipes", "apple-icon.png"), 0.1, WHITE);
