/**
 * PNG для вкладки, «Добавить на экран», manifest.
 * Если есть public/menu/logo_gastrobar.png — берём его (квадрат, contain на тёмном фоне).
 * Иначе — public/icon.svg.
 */
import sharp from "sharp";
import { readFile, stat } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public", "icon.svg");
const logoPath = join(root, "public", "menu", "logo_gastrobar.png");
const BG = "#12121a";

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function rasterFromLogo(size) {
  return sharp(logoPath)
    .resize(size, size, { fit: "contain", background: BG })
    .flatten({ background: BG })
    .png();
}

async function rasterFromSvg(size) {
  const svg = await readFile(svgPath);
  return sharp(svg).resize(size, size).png();
}

async function main() {
  const useLogo = await exists(logoPath);
  if (useLogo) {
    console.log("Using", logoPath);
  } else {
    console.log("Logo not found, using", svgPath);
  }

  async function pipelineFor(size) {
    if (useLogo) return rasterFromLogo(size);
    return rasterFromSvg(size);
  }

  const out = [
    { path: join(root, "app", "icon.png"), size: 32 },
    { path: join(root, "app", "apple-icon.png"), size: 180 },
    { path: join(root, "public", "icon-192.png"), size: 192 },
    { path: join(root, "public", "icon-512.png"), size: 512 },
    { path: join(root, "public", "favicon-32x32.png"), size: 32 },
  ];

  for (const { path, size } of out) {
    const pipeline = await pipelineFor(size);
    await pipeline.toFile(path);
    console.log("Wrote", path);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
