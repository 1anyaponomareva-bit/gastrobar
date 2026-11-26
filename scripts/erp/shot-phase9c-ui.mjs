import { writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "docs/assets/phase9c";
const css = `body{margin:0;background:#0f1419;color:#e8eef5;font:14px system-ui;padding:20px}
section{background:#1a222c;border:1px solid #2a3542;border-radius:12px;padding:16px}
h2{margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.field{background:#121820;border:1px solid #2a3542;border-radius:8px;padding:10px}
.field label{display:block;color:#9aa8b8;font-size:12px}table{width:100%;border-collapse:collapse}
th,td{padding:8px;border-bottom:1px solid #2a3542;text-align:left}.num{text-align:right}
.badge{display:inline-block;background:#5b2b00;color:#ffd7a8;padding:2px 8px;border-radius:999px;font-size:12px;margin-bottom:10px}
.shot{color:#f5a524;font-size:12px;margin-bottom:8px}`;

const shots = [
  [
    "01-input-vat-register",
    "SHOT: Финансы → Входящий НДС",
    `<div class="grid">
      <div class="field"><label>Входящий НДС</label><strong>210,000 ₫</strong></div>
      <div class="field"><label>К вычету</label><strong>130,000 ₫</strong></div>
      <div class="field"><label>Pending VAT</label><strong>40,000 ₫</strong></div>
      <div class="field"><label>Без вычета</label><strong>0 ₫</strong></div>
      <div class="field"><label>Корректировки</label><strong>0 ₫</strong></div>
    </div>
    <table><thead><tr><th>Дата</th><th>Поставщик</th><th>Накладная</th><th>Категория</th><th class="num">Без НДС</th><th class="num">%</th><th class="num">VAT</th><th class="num">К вычету</th><th>Статус</th></tr></thead>
    <tbody>
      <tr><td>2026-11-25</td><td>Test Supplier</td><td>—</td><td>Ingredients</td><td class="num">1,625,000</td><td class="num">8</td><td class="num">130,000</td><td class="num">130,000</td><td>deductible</td></tr>
      <tr><td>2026-11-15</td><td>Landlord</td><td>INV-RENT</td><td>Rent</td><td class="num">500,000</td><td class="num">8</td><td class="num">40,000</td><td class="num">0</td><td>pending</td></tr>
    </tbody></table>`,
  ],
  [
    "02-pending-list",
    "SHOT: Pending deduction confirmation",
    `<ul><li>Landlord · 40,000 ₫ · tax_invoice</li></ul>
     <p style="color:#9aa8b8">Pending VAT не входит в сумму к вычету. Наличие накладной ≠ автоматический вычет.</p>`,
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
    <section><h2>Входящий НДС</h2>${body}</section></body></html>`,
  );
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,800", `--screenshot=${pngPath}`, url], {
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(JSON.stringify({ name, ok: existsSync(pngPath) }));
}
