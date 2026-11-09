/**
 * GASTROFOOD tab / home-screen icons: the official logo on a white square.
 */
import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "gastrofood", "gastrofood-online-kitchen.png");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function make(size, out, pad = 0.1) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * pad)));
  const logo = await sharp(src)
    .flatten({ background: WHITE })
    .trim({ threshold: 12 })
    .resize(inner, inner, { fit: "contain", background: WHITE, withoutEnlargement: false })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 3, background: WHITE },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log("Wrote", out);
}

const gastro = join(root, "public", "gastrofood");

await make(32, join(gastro, "favicon-32.png"), 0.08);
await make(180, join(gastro, "apple-touch-icon.png"), 0.1);
await make(192, join(gastro, "icon-192.png"), 0.1);
await make(512, join(gastro, "icon-512.png"), 0.1);
await make(32, join(root, "app", "coming-soon", "icon.png"), 0.08);
await make(180, join(root, "app", "coming-soon", "apple-icon.png"), 0.1);
await make(32, join(root, "app", "erp", "icon.png"), 0.08);
await make(180, join(root, "app", "erp", "apple-icon.png"), 0.1);
await make(32, join(root, "app", "orders", "icon.png"), 0.08);
await make(180, join(root, "app", "orders", "apple-icon.png"), 0.1);
await make(32, join(root, "app", "recipes", "icon.png"), 0.08);
await make(180, join(root, "app", "recipes", "apple-icon.png"), 0.1);
