/**
 * Capture Phase 9B UI fixture screenshots (TEST DATA HTML — FE not published).
 * Uses local Chrome headless. Does not touch production.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "docs/assets/phase9b");
const fixture = join(outDir, "ui-fixture.html");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const html = readFileSync(fixture, "utf8");

const shots = [
  ["01-sales-list", "sales-list"],
  ["02-sale-card", "sale-card"],
  ["03-output-vat", "output-vat"],
  ["04-cogs-actual", "cogs-actual"],
  ["05-cogs-pending", "cogs-pending"],
  ["06-reconcile-poster-grab", "reconcile"],
];

mkdirSync(outDir, { recursive: true });

for (const [name, id] of shots) {
  const sectionMatch = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`));
  if (!sectionMatch) throw new Error("missing section " + id);
  const page = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${name}</title>
<style>
body{margin:0;background:#0f1419;color:#e8eef5;font:14px/1.45 system-ui,Segoe UI,sans-serif;padding:20px}
section{background:#1a222c;border:1px solid #2a3542;border-radius:12px;padding:16px}
h2{margin:0 0 12px;font-size:16px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #2a3542}
th{color:#9aa8b8;font-size:12px}.num{text-align:right}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.field{background:#121820;border:1px solid #2a3542;border-radius:8px;padding:10px}
.field label{display:block;color:#9aa8b8;font-size:12px;margin-bottom:4px}
.hint{color:#9aa8b8;font-size:12px;margin-top:6px}
.shot-label{color:#f5a524;font-size:12px;margin-bottom:8px}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px}
.pill.posted{background:#143528;color:#3ecf8e}.pill.pending{background:#3a2a00;color:#f5a524}
.badge{display:inline-block;margin-bottom:10px;background:#5b2b00;color:#ffd7a8;padding:2px 8px;border-radius:999px;font-size:12px}
</style></head><body>
<div class="badge">TEST DATA ONLY · FE not published</div>
${sectionMatch[0]}
</body></html>`;
  const htmlPath = join(outDir, `${name}.html`);
  const pngPath = join(outDir, `${name}.png`);
  writeFileSync(htmlPath, page);
  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
  const r = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=1280,900`,
      `--screenshot=${pngPath}`,
      fileUrl,
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  if (!existsSync(pngPath)) {
    throw new Error(`screenshot failed for ${name}: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
  }
  console.log(JSON.stringify({ ok: true, name, pngPath }));
}
