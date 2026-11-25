import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await browser.contexts()[0].newPage();
const checks = [];

async function waitLoaded() {
  for (let i = 0; i < 15; i++) {
    const t = await page.locator("body").innerText();
    if (!/^\s*Загрузка/i.test(t) && t.length > 100) return t;
    await page.waitForTimeout(2000);
  }
  return page.locator("body").innerText();
}

async function go(id, url, re) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);
  const text = await waitLoaded();
  const ok = re.test(text);
  await page.screenshot({ path: `${outDir}/r2-prod-${id}-v2.png`, fullPage: true });
  const row = {
    id,
    url,
    ok,
    len: text.length,
    hasCosting: /Политика расчёта себестоимости/.test(text),
    hasVatNav: /Корректировки НДС/.test(text),
    hasRecommended: /Рекомендуем|Recommended selling|рекомендуем|рекомендован/i.test(text),
    snippet: text.slice(0, 700).replace(/\s+/g, " "),
  };
  checks.push(row);
  console.log(JSON.stringify({ id, ok, hasCosting: row.hasCosting, hasVatNav: row.hasVatNav }));
}

await go("service", "https://gastrofood.vn/erp/service", /Политика расчёта себестоимости|Налог|VAT/i);
await go("processing", "https://gastrofood.vn/erp/menu/processing", /Перераб|Processing|Чистовик|документ/i);
await go("ingredients", "https://gastrofood.vn/erp/menu/ingredients", /Ингредиент|Ingredient|себестоим|цена/i);
await go("preps", "https://gastrofood.vn/erp/menu/preps", /Полуфабр|Prep|техкарт|recipe/i);
await go("dishes", "https://gastrofood.vn/erp/menu/dishes", /Блюд|Dish|Danish|Hot/i);

const dishText = await page.locator("body").innerText();
if (/Danish|Hot\s*Dog/i.test(dishText)) {
  await page.getByText(/Danish|Hot\s*Dog/i).first().click();
  await page.waitForTimeout(5000);
  const t = await waitLoaded();
  await page.screenshot({ path: `${outDir}/r2-prod-danish-v2.png`, fullPage: true });
  checks.push({
    id: "danish",
    url: page.url(),
    ok: /себестоим|марж|рекоменд|Contribution|margin|cost|VAT|канал/i.test(t),
    hasRecommended: /Рекомендуем|Recommended|рекоменд/i.test(t),
    snippet: t.slice(0, 900).replace(/\s+/g, " "),
  });
  console.log(JSON.stringify({ id: "danish", ok: checks.at(-1).ok, url: page.url() }));
} else {
  const hrefs = await page.locator("a[href*='/erp/']").evaluateAll((as) =>
    as.map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 50),
  );
  checks.push({ id: "danish", ok: false, note: "not_on_dishes_list", hrefs });
  console.log(JSON.stringify({ id: "danish", ok: false }));
}

writeFileSync(`${outDir}/r2-prod-ui-shots-v2.json`, JSON.stringify({ checked_at: new Date().toISOString(), checks }, null, 2));
await page.close();
