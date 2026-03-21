/**
 * Удаляет .next (кэш сборки). Если чанки «ломаются» (Cannot find module './xxx.js') — запусти: npm run clean
 *
 * Пропуск: NEXT_DEV_SKIP_CLEAN=1 (быстрый перезапуск dev, если кэш точно целый)
 */
import fs from "node:fs";
import path from "node:path";

if (process.env.NEXT_DEV_SKIP_CLEAN === "1") {
  console.log("[clean-next] Пропуск: NEXT_DEV_SKIP_CLEAN=1");
  process.exit(0);
}

const dir = path.join(process.cwd(), ".next");
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("Removed .next");
} else {
  console.log("No .next folder");
}
