/**
 * GASTROFOOD tab / home-screen icons: a large G and red F on transparency.
 * Outlines are Montserrat Black (the site typeface). Red is sampled from the
 * D in FOOD on public/gastrofood/gastrofood-online-kitchen.png (#FA181A).
 * PNG G is black (Safari / apple-touch fallback). SVG G follows Chrome
 * prefers-color-scheme: black on light, white on dark. Apple-touch stays
 * transparent PNG (iOS may fill the home-screen plate with black).
 */
import { writeFileSync } from "fs";
import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLACK = "#000000";
const WHITE = "#ffffff";
const RED = "#FA181A";

/** Montserrat Black, font-space Y-up. G bbox 29,-16..745,716; F bbox 57,0..626,700. */
const G_PATH =
  "M420 -16Q335 -16 263.5 10.5Q192 37 139.5 86Q87 135 58 202Q29 269 29 350Q29 431 58 498Q87 565 140 614Q193 663 265.5 689.5Q338 716 425 716Q529 716 610.5 681Q692 646 745 581L594 448Q528 525 437 525Q359 525 313 478Q267 431 267 350Q267 271 312.5 223Q358 175 434 175Q456 175 477 179Q498 183 520 192L520 369L725 369L725 73Q661 30 579 7Q497 -16 420 -16Z";
const F_PATH =
  "M57 0L57 700L626 700L626 522L293 522L293 402L585 402L585 224L293 224L293 0Z";
/** Place F tight after G (default advance 769 leaves an 81-unit gap). */
const F_X = 724;
const UNION = { minX: 29, minY: -16, maxX: F_X + 626, maxY: 716 };

function letterTransform(size, pad) {
  const inner = size * (1 - 2 * pad);
  const w = UNION.maxX - UNION.minX;
  const h = UNION.maxY - UNION.minY;
  const s = inner / Math.max(w, h);
  const tx = (size - w * s) / 2 - UNION.minX * s;
  const ty = (size - h * s) / 2 + UNION.maxY * s;
  return `translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${s.toFixed(6)} ${(-s).toFixed(6)})`;
}

function letterGroup(size, pad, gAttrs) {
  return `  <g transform="${letterTransform(size, pad)}">
    <path ${gAttrs} d="${G_PATH}"/>
    <path fill="${RED}" transform="translate(${F_X} 0)" d="${F_PATH}"/>
  </g>`;
}

function gfRasterSvg(size, pad, gFill = BLACK) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${letterGroup(size, pad, `fill="${gFill}"`)}
</svg>`;
}

function gfThemeSvg(size, pad) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <style>
    .g { fill: ${BLACK}; }
    @media (prefers-color-scheme: dark) { .g { fill: ${WHITE}; } }
  </style>
${letterGroup(size, pad, `class="g"`)}
</svg>`;
}

async function make(size, out, pad, gFill = BLACK) {
  const oversample = size <= 32 ? 8 : size <= 192 ? 2 : 1;
  const render = size * oversample;
  await sharp(Buffer.from(gfRasterSvg(render, pad, gFill)))
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .png()
    .toFile(out);
  console.log("Wrote", out);
}

function writeThemeSvg(out, size, pad) {
  writeFileSync(out, gfThemeSvg(size, pad));
  console.log("Wrote", out);
}

const gastro = join(root, "public", "gastrofood");
const pad32 = 0.05;
const padLarge = 0.06;
const themeSvg = gfThemeSvg(32, pad32);

await make(32, join(gastro, "favicon-32.png"), pad32);
await make(180, join(gastro, "apple-touch-icon.png"), padLarge);
await make(192, join(gastro, "icon-192.png"), padLarge);
await make(512, join(gastro, "icon-512.png"), padLarge);
writeFileSync(join(gastro, "favicon.svg"), themeSvg);
console.log("Wrote", join(gastro, "favicon.svg"));

for (const segment of ["coming-soon", "erp", "orders", "recipes"]) {
  await make(32, join(root, "app", segment, "icon.png"), pad32);
  await make(180, join(root, "app", segment, "apple-icon.png"), padLarge);
  writeThemeSvg(join(root, "app", segment, "icon.svg"), 32, pad32);
}
