import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "docs/assets/phase9e";
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
    "01-vat-settlement-overview",
    "SHOT: Финансы → НДС к уплате → Обзор",
    `<div class="tabs"><span class="on">Обзор</span><span>Периоды</span><span>Перенос</span><span>Оплата</span><span>Корректировки</span></div>
    <p class="warn">Внутренний налоговый расчёт · Не официальная декларация VN · Pending VAT исключён</p>
    <div class="grid">
      <div class="field"><label>Output VAT</label><strong>32,000,000 ₫</strong></div>
      <div class="field"><label>Total Input VAT</label><strong>24,000,000 ₫</strong></div>
      <div class="field"><label>Deductible Input VAT</label><strong>18,000,000 ₫</strong></div>
      <div class="field"><label>Pending Input VAT</label><strong>6,000,000 ₫</strong></div>
      <div class="field"><label>Non-Deductible Input VAT</label><strong>0 ₫</strong></div>
      <div class="field"><label>VAT Adjustments</label><strong>0 ₫</strong></div>
      <div class="field"><label>Opening Carryforward</label><strong>2,000,000 ₫</strong></div>
      <div class="field"><label>Applied Carryforward</label><strong>2,000,000 ₫</strong></div>
      <div class="field"><label>VAT Payable</label><strong>12,000,000 ₫</strong></div>
      <div class="field"><label>Potential Carryforward</label><strong>0 ₫</strong></div>
      <div class="field"><label>VAT Paid</label><strong>8,000,000 ₫</strong></div>
      <div class="field"><label>Outstanding Liability</label><strong>4,000,000 ₫</strong></div>
    </div>`,
  ],
  [
    "02-vat-settlement-periods",
    "SHOT: НДС к уплате → Расчёты по периодам",
    `<div class="tabs"><span>Обзор</span><span class="on">Периоды</span><span>Перенос</span><span>Оплата</span><span>Корректировки</span></div>
    <table><thead><tr><th>Период</th><th>Статус</th><th class="num">Output</th><th class="num">Deductible</th><th class="num">Payable</th><th class="num">Paid</th></tr></thead>
    <tbody>
      <tr><td>2099-01-01 → 2099-01-31</td><td>approved / partially_paid</td><td class="num">32,000,000</td><td class="num">18,000,000</td><td class="num">12,000,000</td><td class="num">8,000,000</td></tr>
      <tr><td>2099-02-01 → 2099-02-28</td><td>approved / unpaid</td><td class="num">10,000,000</td><td class="num">15,000,000</td><td class="num">0</td><td class="num">0</td></tr>
      <tr><td>2099-07-01 → 2099-09-30 (Q)</td><td>calculated / unpaid</td><td class="num">1,000,000</td><td class="num">65,000</td><td class="num">935,000</td><td class="num">0</td></tr>
    </tbody></table>
    <p class="warn">TEST DATA · Case A/B/C · Snapshot frozen on approve</p>`,
  ],
  [
    "03-vat-carryforward",
    "SHOT: НДС к уплате → Перенос НДС",
    `<table><thead><tr><th>Источник</th><th class="num">Opening</th><th class="num">Applied</th><th class="num">Remaining</th><th>Статус</th></tr></thead>
    <tbody>
      <tr><td>opening 2025-01-01 → 2025-12-31</td><td class="num">2,000,000</td><td class="num">2,000,000</td><td class="num">0</td><td>exhausted</td></tr>
      <tr><td>2099-02-01 → 2099-02-28</td><td class="num">5,000,000</td><td class="num">5,000,000</td><td class="num">0</td><td>exhausted</td></tr>
    </tbody></table>
    <p class="warn">Отрицательный settlement ≠ автоматический возврат · Opening только confirmed документом</p>`,
  ],
  [
    "04-vat-payments",
    "SHOT: НДС к уплате → Оплата НДС",
    `<table><thead><tr><th>Дата</th><th>Reference</th><th class="num">Сумма</th><th>Статус</th></tr></thead>
    <tbody>
      <tr><td>2099-02-15</td><td>REF-partial</td><td class="num">8,000,000</td><td>posted</td></tr>
      <tr><td>2099-02-20</td><td>REF-full</td><td class="num">4,000,000</td><td>posted</td></tr>
    </tbody></table>
    <p class="warn">Уплата НДС ≠ операционный расход P&L · payment_key idempotent</p>`,
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
    <section><h2>НДС к уплате</h2>${body}</section></body></html>`,
  );
  const url = "file:///" + htmlPath.replace(/\\/g, "/");
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900", `--screenshot=${pngPath}`, url], {
    encoding: "utf8",
    timeout: 60000,
  });
  console.log(JSON.stringify({ name, ok: existsSync(pngPath) }));
}
