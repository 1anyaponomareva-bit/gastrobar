import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "docs/assets/phase9f";
mkdirSync(base, { recursive: true });
const css = `body{margin:0;background:#0f1419;color:#e8eef5;font:14px system-ui;padding:20px}
section{background:#1a222c;border:1px solid #2a3542;border-radius:12px;padding:16px;margin-bottom:12px}
h2{margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.field{background:#121820;border:1px solid #2a3542;border-radius:8px;padding:10px}
.field label{display:block;color:#9aa8b8;font-size:12px}
.badge{display:inline-block;background:#5b2b00;color:#ffd7a8;padding:2px 8px;border-radius:999px;font-size:12px;margin-bottom:10px}
.shot{color:#f5a524;font-size:12px;margin-bottom:8px}
.tabs span{display:inline-block;padding:6px 10px;margin-right:4px;border-radius:8px;background:#121820;border:1px solid #2a3542;font-size:12px}
.tabs .on{background:#243044;border-color:#3d4f66}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #2a3542}.num{text-align:right}
.warn{color:#ffd7a8;font-size:12px}`;

const shots = [
  [
    "01-profitability-overview",
    "SHOT: Финансы → Прибыльность → Обзор",
    `<div class="tabs"><span class="on">Обзор</span><span>Каналы</span><span>Подразделения</span><span>Блюда</span><span>Pending COGS</span></div>
     <p class="warn">Completeness: Partial · Estimated ≠ Actual</p>
     <div class="grid">
       <div class="field"><label>Net Revenue</label><strong>100,000 ₫</strong></div>
       <div class="field"><label>Total Actual COGS</label><strong>28,000 ₫</strong></div>
       <div class="field"><label>Gross Profit</label><strong>72,000 ₫</strong></div>
       <div class="field"><label>Contribution Margin</label><strong>47,000 ₫ (47%)</strong></div>
     </div>`,
  ],
  [
    "02-profitability-channels",
    "SHOT: Прибыльность → Каналы",
    `<table><thead><tr><th>Канал</th><th class="num">Net</th><th class="num">COGS</th><th class="num">GP</th><th class="num">GM%</th></tr></thead>
     <tbody><tr><td>GrabFood</td><td class="num">100,000</td><td class="num">28,000</td><td class="num">72,000</td><td class="num">72%</td></tr>
     <tr><td>Direct</td><td class="num">0</td><td class="num">0</td><td class="num">0</td><td class="num">—</td></tr></tbody></table>
     <p class="warn">Actual commission 18,000 · Actual ads 7,000 · Net Earnings ≠ net profit</p>`,
  ],
  [
    "03-danish-cogs",
    "SHOT: Danish Hot Dog — Forecast vs Actual (TEST FIFO)",
    `<div class="grid">
       <div class="field"><label>Estimated COGS (menu)</label><strong>27,902.06 ₫</strong></div>
       <div class="field"><label>Food Actual</label><strong>1,097.50 ₫</strong></div>
       <div class="field"><label>Packaging Actual</label><strong>2,004.50 ₫</strong></div>
       <div class="field"><label>Total Actual (test lots)</label><strong>3,102 ₫</strong></div>
     </div>
     <p class="warn">TEST DATA lots @500 — not production recipe change. Estimated not used as Actual.</p>`,
  ],
  [
    "04-pending-cogs",
    "SHOT: Pending COGS",
    `<table><thead><tr><th>Sale</th><th>Product</th><th class="num">Missing</th><th>Reason</th></tr></thead>
     <tbody><tr><td>ghost-sale</td><td>9F GHOST</td><td class="num">1</td><td>insufficient_stock</td></tr></tbody></table>
     <p class="warn">Sale remains posted · COGS partial · missing ≠ 0 cost · auto-consume OFF</p>`,
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
    <section><h2>Прибыльность</h2>${body}</section></body></html>`,
  );
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900", `--screenshot=${pngPath}`, url], {
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(JSON.stringify({ name, ok: existsSync(pngPath) }));
}
