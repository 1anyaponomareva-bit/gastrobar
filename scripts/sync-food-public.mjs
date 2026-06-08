/**
 * Gastrofood: копируем food/ → public/food/ перед сборкой.
 * Источник правды — папка food/ в корне; Next.js отдаёт только public/.
 */
import { cp, rm, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "food");
const dest = join(root, "public", "food");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(src))) {
    console.warn("[sync-food-public] skip: food/ not found");
    return;
  }
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  console.log("[sync-food-public] food/ → public/food/");
}

main().catch((err) => {
  console.error("[sync-food-public]", err);
  process.exit(1);
});
