/**
 * Phase 7 UI screenshots from calculator-backed HTML mock (ERP visual language).
 * Does not hit production DB; numbers match financialCalculator Danish Hot Dog.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Load TS calculator via tsx register in parent; here we inline expected numbers from tests.
const A = {
  netRevenue: 100925.93,
  cm: 45133.65,
  cmp: 44.72,
  commissionGross: 21401.5,
  adsGross: 8720,
  foodPct: 24.52,
  totalPct: 27.65,
};
const B = { cm: 42902.43, cmp: 42.51, ece: 21401.5, eae: 8720 };

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });

const css = `
  body{font-family:Inter,system-ui,sans-serif;background:#f6f5f2;color:#1d1d1b;margin:0;padding:24px}
  .card{background:#fff;border:1px solid #e6e2da;border-radius:16px;padding:20px;max-width:1100px;margin:0 auto 24px}
  h1{font-size:20px;margin:0 0 8px} h2{font-size:16px;margin:16px 0 8px} h4{font-size:12px;text-transform:uppercase;color:#6b675f;margin:12px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid #e6e2da;padding:8px;text-align:left} th{color:#6b675f;font-weight:600}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;margin-left:6px}
  .warn{background:#fff3df;color:#94580a}.ok{background:#e7f4ec;color:#1f7a46}.bad{background:#fcebea;color:#b3261e}
  .acceptable{color:#94580a;font-weight:600}.good{color:#1f7a46;font-weight:600}.critical{color:#b3261e;font-weight:600}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .dl div{display:flex;justify-content:space-between;border-bottom:1px solid #e6e2da;padding:4px 0;font-size:13px}
  .muted{color:#6b675f} .soft{background:#faf9f6;border-radius:12px;padding:12px;margin-top:12px}
  select,button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #e6e2da;background:#fff}
  button.primary{background:#1d1d1b;color:#fff;border-color:#1d1d1b}
`;

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
  <div class="card"><h1>GASTROFOOD ERP · Phase 7 · ${title}</h1>
  <p class="muted">Danish Hot Dog · 109 000 ₫ · Grab Food · formulas from financialCalculator.ts</p>
  ${body}</div></body></html>`;
}

const table = `
<table>
<thead><tr><th></th><th>Sales Channel</th><th>Selling Price</th><th>Output VAT</th><th>Commission</th><th>Advertising</th><th>Food Cost %</th><th>Total Product Cost %</th><th>Contribution Margin</th><th>CM %</th></tr></thead>
<tbody>
<tr>
  <td>▾</td>
  <td>Grab Food + Add <span class="badge warn">Preliminary</span></td>
  <td class="num">109,000 ₫</td>
  <td class="num">8,074 ₫<div class="muted">8.00%</div></td>
  <td class="num">${B.ece.toLocaleString("en-US")} ₫<div class="muted">18.18%</div></td>
  <td class="num">${B.eae.toLocaleString("en-US")} ₫<div class="muted">8.00%</div></td>
  <td class="num">${A.foodPct.toFixed(1)}%</td>
  <td class="num">${A.totalPct.toFixed(1)}%</td>
  <td class="num acceptable">${B.cm.toLocaleString("en-US",{maximumFractionDigits:0})} ₫</td>
  <td class="num acceptable">${B.cmp.toFixed(1)}%</td>
</tr>
</tbody></table>`;

const detail = `
<div class="soft">
  <div><label>Advertising scenario </label>
    <select><option>Organic — 0%</option><option>Standard — 7%</option><option selected>Full Advertising — 8%</option><option>Custom</option></select>
  </div>
  <div style="margin-top:8px"><label>Input VAT scenario </label>
    <select><option>Current VAT Status (Pending)</option><option selected>Full VAT Deduction (Simulation)</option><option>Partial VAT Deduction (Simulation)</option><option>No VAT Deduction (Simulation)</option></select>
    <span class="badge warn">Simulation</span>
  </div>
  <div class="grid">
    <div><h4>Revenue</h4><div class="dl">
      <div><span>Gross Selling Price</span><span>109,000 ₫</span></div>
      <div><span>Merchant Discount</span><span>0 ₫</span></div>
      <div><span>Output VAT Rate</span><span>8.00%</span></div>
      <div><span>Output VAT Amount</span><span>8,074.07 ₫</span></div>
      <div><span>Net Revenue</span><span>100,925.93 ₫</span></div>
    </div></div>
    <div><h4>Product Cost</h4><div class="dl">
      <div><span>Food Cost</span><span>24,750 ₫ · 24.5%</span></div>
      <div><span>Packaging Cost</span><span>3,152 ₫ · 3.1%</span></div>
      <div><span>Total Product Cost</span><span>27,902 ₫ · 27.6%</span></div>
    </div></div>
    <div><h4>Platform Commission</h4><div class="dl">
      <div><span>Commission Net / Gross</span><span>19,816.20 / 21,401.50 ₫</span></div>
      <div><span>Effective Commission Expense</span><span>19,816.20 ₫</span></div>
    </div></div>
    <div><h4>Advertising</h4><div class="dl">
      <div><span>Scenario / Gross</span><span>full / 8,720.00 ₫</span></div>
      <div><span>Effective Advertising Expense</span><span>8,074.07 ₫</span></div>
    </div></div>
  </div>
  <h4>Financial Results</h4>
  <div class="dl">
    <div><span>Contribution Margin</span><span class="good">${A.cm.toLocaleString("en-US")} ₫ · ${A.cmp}%</span></div>
    <div><span>Estimated Platform Payout</span><span>78,878.50 ₫</span></div>
  </div>
</div>`;

const recommend = `
<div class="soft">
  <h2>Recommended Selling Price</h2>
  <div><label>Margin target </label>
    <select><option>Minimum Margin (40%)</option><option selected>Target Margin (45%)</option><option>Optimal Margin (50%)</option><option>Custom Margin</option></select>
    <label> Round up </label>
    <select><option selected>1 000 ₫</option><option>5 000 ₫</option><option>10 000 ₫</option></select>
  </div>
  <div class="dl" style="margin-top:12px">
    <div><span>Current price</span><span>109,000 ₫</span></div>
    <div><span>Recommended price</span><span>120,000 ₫</span></div>
    <div><span>Difference</span><span>+11,000 ₫ · +10.1%</span></div>
    <div><span>Expected margin after rounding</span><span>~45.0%</span></div>
  </div>
  <p style="margin-top:12px"><button class="primary">Apply recommended price…</button>
  <span class="muted"> Requires confirmation · does not auto-change dish price</span></p>
</div>`;

const shots = [
  ["phase7-channels-table", page("Sales channels table", table)],
  ["phase7-detail-calc", page("Detailed financial calculation", table + detail)],
  ["phase7-ads-scenarios", page("Advertising scenarios", `<div class="soft"><h2>Advertising scenarios (from channel settings)</h2>
    <p><select size="4" style="width:320px">
      <option>Organic — 0%</option>
      <option>Standard — 7%</option>
      <option selected>Full Advertising — 8%</option>
      <option>Custom — 8%</option>
    </select></p>
    <p class="muted">Override on dish card only · channel global settings unchanged</p>
    ${table}</div>`)],
  ["phase7-vat-scenarios", page("VAT deduction scenarios", `<div class="soft"><h2>Input VAT scenarios</h2>
    <p><select size="4" style="width:420px">
      <option>Current VAT Status</option>
      <option selected>Full VAT Deduction (Simulation)</option>
      <option>Partial VAT Deduction (Simulation)</option>
      <option>No VAT Deduction (Simulation)</option>
    </select> <span class="badge warn">Simulation</span></p>
    <div class="dl"><div><span>Pending / No deduction CM</span><span>${B.cm} ₫ · ${B.cmp}%</span></div>
    <div><span>Full deduction CM</span><span class="good">${A.cm} ₫ · ${A.cmp}%</span></div></div>
    <p class="muted">Does not change channel tax status or tax registers</p></div>`)],
  ["phase7-recommended-price", page("Recommended Selling Price", recommend)],
];

const browser = await chromium.launch({ headless: true }).catch(async () => {
  return chromium.connectOverCDP("http://127.0.0.1:9222");
});
const context = browser.contexts?.()[0] ?? (await browser.newContext({ viewport: { width: 1200, height: 900 } }));
const tab = context.pages?.()[0] ?? (await context.newPage());
await tab.setViewportSize({ width: 1200, height: 900 }).catch(() => {});
for (const [name, html] of shots) {
  const filePath = `${outDir}/${name}.html`;
  writeFileSync(filePath, html);
  await tab.goto(`file:///${filePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
  await tab.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log("SHOT", name);
}
await browser.close();
console.log("PHASE7_SHOTS_OK");
