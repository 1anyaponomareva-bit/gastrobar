import { writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "docs/assets/phase9d";
const css = `body{margin:0;background:#0f1419;color:#e8eef5;font:14px system-ui;padding:20px}
section{background:#1a222c;border:1px solid #2a3542;border-radius:12px;padding:16px}
h2{margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.field{background:#121820;border:1px solid #2a3542;border-radius:8px;padding:10px}
.field label{display:block;color:#9aa8b8;font-size:12px}
.badge{display:inline-block;background:#5b2b00;color:#ffd7a8;padding:2px 8px;border-radius:999px;font-size:12px;margin-bottom:10px}
.shot{color:#f5a524;font-size:12px;margin-bottom:8px}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #2a3542}.num{text-align:right}`;

const shots = [
  [
    "01-platforms-overview",
    "SHOT: Финансы → Агрегаторы → Обзор",
    `<div class="grid">
      <div class="field"><label>Gross Sales</label><strong>100,000 ₫</strong></div>
      <div class="field"><label>Actual Commission</label><strong>20,000 ₫</strong></div>
      <div class="field"><label>Actual Advertising</label><strong>5,000 ₫</strong></div>
      <div class="field"><label>Net Earnings</label><strong>75,000 ₫</strong></div>
      <div class="field"><label>Actual Payouts</label><strong>60,000 ₫</strong></div>
      <div class="field"><label>Outstanding</label><strong>40,000 ₫</strong></div>
      <div class="field"><label>Reconciliation diff</label><strong>15,000 ₫</strong></div>
      <div class="field"><label>Chargebacks</label><strong>0 ₫</strong></div>
    </div>
    <p style="color:#9aa8b8;font-size:12px">TEST DATA · Forecast channel % not included · Net Earnings ≠ bank receipt</p>`,
  ],
  [
    "02-platforms-import",
    "SHOT: Агрегаторы → Импорт",
    `<p style="color:#f5a524">Raw GrabMerchant CSV/XLSX blocked until owner sample.</p>
     <table><thead><tr><th>File</th><th>Format</th><th>Status</th><th class="num">Rows</th></tr></thead>
     <tbody><tr><td>ok-test.json</td><td>normalized_json_v1</td><td>applied</td><td class="num">1</td></tr>
     <tr><td>grab-oct2026-normalized.json</td><td>normalized_json_v1</td><td>preview</td><td class="num">1</td></tr></tbody></table>`,
  ],
];

for (const [name, label, body] of shots) {
  const htmlPath = resolve(base, `${name}.html`);
  const pngPath = resolve(base, `${name}.png`);
  writeFileSync(
    htmlPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
    <div class="badge">TEST DATA ONLY · FE not published</div>
    <div class="shot">${label}</div>
    <section><h2>Агрегаторы</h2>${body}</section></body></html>`,
  );
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,800", `--screenshot=${pngPath}`, url], {
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(JSON.stringify({ name, ok: existsSync(pngPath) }));
}
