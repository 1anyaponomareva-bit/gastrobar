/**
 * Release 2 production UI paths via Chrome CDP. Does not bypass login.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });

const routes = [
  { id: "service-costing", path: "/erp/service", expect: /Политика расчёта себестоимости|Costing policy|Chính sách tính giá vốn/i },
  { id: "stock-fifo", path: "/erp/stock", expect: /Остатки|FIFO|Balances|Tồn kho/i },
  { id: "stock-receipts", path: "/erp/stock/receipts", expect: /Поставк|Deliver|Nhập|VAT|НДС/i },
  { id: "vat-adjustments", path: "/erp/stock/vat-adjustments", expect: /Корректировк|VAT adjust|Điều chỉnh/i },
  { id: "processing", path: "/erp/menu/processing", expect: /Перераб|Processing|Chế biến/i },
  { id: "menu", path: "/erp/menu", expect: /Danish|Hot Dog|Меню|Menu|Thực đơn/i },
];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();

await page.goto("https://gastrofood.vn/erp", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const homeText = await page.locator("body").innerText();
const needAuth = /Вход для администратора|Administrator login|Đăng nhập/i.test(homeText);
await page.screenshot({ path: `${outDir}/r2-prod-erp-home.png`, fullPage: true });

const results = [];
if (needAuth) {
  writeFileSync(
    `${outDir}/r2-prod-ui-shots.json`,
    JSON.stringify({ checked_at: new Date().toISOString(), need_auth: true, home: homeText.slice(0, 500) }, null, 2),
  );
  console.log(JSON.stringify({ need_auth: true }));
  await page.close();
  process.exit(0);
}

for (const r of routes) {
  const url = `https://gastrofood.vn${r.path}`;
  let status = null;
  let text = "";
  let ok = false;
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    status = res?.status() ?? null;
    await page.waitForTimeout(2500);
    text = await page.locator("body").innerText();
    ok = r.expect.test(text) && !/Вход для администратора/i.test(text);
    await page.screenshot({ path: `${outDir}/r2-prod-${r.id}.png`, fullPage: true });
  } catch (e) {
    text = String(e).slice(0, 300);
  }
  results.push({ id: r.id, path: r.path, status, ok, snippet: text.slice(0, 400).replace(/\s+/g, " ") });
  console.log(JSON.stringify({ id: r.id, status, ok }));
}

// Danish Hot Dog + recommended price if searchable
try {
  await page.goto("https://gastrofood.vn/erp/menu", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const link = page.getByText(/Danish|Hot\s*Dog|хот-дог/i).first();
  if (await link.isVisible({ timeout: 4000 }).catch(() => false)) {
    await link.click();
    await page.waitForTimeout(3000);
    const t = await page.locator("body").innerText();
    await page.screenshot({ path: `${outDir}/r2-prod-danish-hotdog.png`, fullPage: true });
    results.push({
      id: "danish-hotdog",
      path: page.url(),
      ok: /себестоим|марж|рекоменд|Recommended|cost|margin/i.test(t),
      snippet: t.slice(0, 500).replace(/\s+/g, " "),
    });
  } else {
    results.push({ id: "danish-hotdog", ok: false, note: "dish_not_listed_or_not_visible" });
  }
} catch (e) {
  results.push({ id: "danish-hotdog", ok: false, error: String(e).slice(0, 200) });
}

writeFileSync(
  `${outDir}/r2-prod-ui-shots.json`,
  JSON.stringify({ checked_at: new Date().toISOString(), need_auth: false, results }, null, 2),
);
console.log(JSON.stringify({ need_auth: false, results }, null, 2));
await page.close();
