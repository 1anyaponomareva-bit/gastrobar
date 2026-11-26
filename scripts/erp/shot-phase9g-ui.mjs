import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "docs/assets/phase9g";
mkdirSync(base, { recursive: true });
const css = `body{margin:0;background:#0f1419;color:#e8eef5;font:14px system-ui;padding:20px}
section{background:#1a222c;border:1px solid #2a3542;border-radius:12px;padding:16px}
h2{margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.field{background:#121820;border:1px solid #2a3542;border-radius:8px;padding:10px}
.field label{display:block;color:#9aa8b8;font-size:12px}
.badge{display:inline-block;background:#5b2b00;color:#ffd7a8;padding:2px 8px;border-radius:999px;font-size:12px;margin-bottom:10px}
.shot{color:#f5a524;font-size:12px;margin-bottom:8px}
table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #2a3542}.num{text-align:right}
.warn{color:#ffd7a8;font-size:12px}`;

const shots = [
  [
    "01-finance-overview",
    "SHOT: Финансы → Обзор",
    `<div class="grid">
      <div class="field"><label>Net Revenue</label><strong>500,000,000 ₫</strong></div>
      <div class="field"><label>Gross Profit</label><strong>360,000,000 ₫ (72%)</strong></div>
      <div class="field"><label>Contribution Margin</label><strong>245,000,000 ₫ (49%)</strong></div>
      <div class="field"><label>EBITDA</label><strong>80,000,000 ₫ (16%)</strong></div>
      <div class="field"><label>EBIT / PBT</label><strong>75,000,000 ₫ (15%)</strong></div>
      <div class="field"><label>Net Profit</label><strong>Pending Tax Calculation</strong></div>
      <div class="field"><label>Cash Balance</label><strong>—</strong></div>
      <div class="field"><label>VAT Payable</label><strong>—</strong></div>
    </div>
    <p class="warn">TEST FIXTURE · CIT accountant_tbd · Accrual ≠ Cash Basis Legacy</p>`,
  ],
  [
    "02-expenses",
    "SHOT: Финансы → Расходы",
    `<table><thead><tr><th>Дата</th><th>Категория</th><th class="num">Gross</th><th>Статус</th><th>Оплата</th></tr></thead>
     <tbody><tr><td>2096-03-01</td><td>rent</td><td class="num">11,000,000</td><td>posted</td><td>paid</td></tr></tbody></table>
     <p class="warn">Payment ≠ second P&L expense · Auto-allocate OFF</p>`,
  ],
  [
    "03-accrual-pnl",
    "SHOT: Финансы → P&L (Accrual)",
    `<div class="grid">
      <div class="field"><label>Total COGS</label><strong>140,000,000 ₫</strong></div>
      <div class="field"><label>Gross Profit</label><strong>360,000,000 ₫</strong></div>
      <div class="field"><label>CM</label><strong>245,000,000 ₫</strong></div>
      <div class="field"><label>EBITDA</label><strong>80,000,000 ₫</strong></div>
    </div>
    <p class="warn">Control fixture §18 · Net Profit not auto-calculated</p>`,
  ],
  [
    "04-assets-depr",
    "SHOT: Основные средства + амортизация",
    `<table><thead><tr><th>Asset</th><th class="num">Cost</th><th class="num">Accum.</th><th class="num">NBV</th><th>Status</th></tr></thead>
     <tbody><tr><td>Test Oven</td><td class="num">12,000,000</td><td class="num">1,000,000</td><td class="num">11,000,000</td><td>active</td></tr></tbody></table>
     <p class="warn">Straight-line · Depreciation non-cash · No auto real asset cards</p>`,
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
    <section><h2>Finance 9G</h2>${body}</section></body></html>`,
  );
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900", `--screenshot=${pngPath}`, url], {
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(JSON.stringify({ name, ok: existsSync(pngPath) }));
}
