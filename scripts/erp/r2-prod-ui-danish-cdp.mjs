import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const dishId = "34a2654c-9dd0-4e22-b9ff-a061c2bd5ce0";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await browser.contexts()[0].newPage();
const out = { checked_at: new Date().toISOString(), pages: [] };

async function shot(id, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 10; i++) {
    const t = await page.locator("body").innerText();
    if (!/^\s*Загрузка/i.test(t) && t.length > 120) break;
    await page.waitForTimeout(1500);
  }
  const text = await page.locator("body").innerText();
  const file = `${outDir}/r2-prod-${id}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const row = {
    id,
    url: page.url(),
    file,
    len: text.length,
    flags: {
      costingPolicy: /Политика расчёта себестоимости/.test(text),
      recommended: /Рекомендуем|Recommended|рекомендованн/i.test(text),
      margin: /марж|Contribution|маржиналь/i.test(text),
      cost: /себестоим|Cost|giá vốn/i.test(text),
      danish: /Danish|Hot Dog|Đan Mạch/i.test(text),
    },
    snippet: text.slice(0, 900).replace(/\s+/g, " "),
  };
  out.pages.push(row);
  console.log(JSON.stringify({ id, flags: row.flags, url: row.url }));
}

await shot("recipes-list", "https://gastrofood.vn/erp/menu/recipes");
await shot("danish-card", `https://gastrofood.vn/erp/menu/${dishId}`);
await shot("ingredients-card-sample", "https://gastrofood.vn/erp/menu/ingredients");
// open first ingredient edit if link exists
try {
  const href = await page.locator("a[href*='/erp/products/']").first().getAttribute("href", { timeout: 5000 });
  if (href) await shot("ingredient-product", `https://gastrofood.vn${href}`);
} catch {
  out.pages.push({ id: "ingredient-product", ok: false, note: "no_product_link" });
}
try {
  await page.goto("https://gastrofood.vn/erp/menu/preps", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  const prep = await page.locator("a[href*='/erp/preps/recipe/']").first().getAttribute("href", { timeout: 5000 }).catch(() => null);
  if (prep) await shot("prep-recipe", `https://gastrofood.vn${prep}`);
  else {
    const alt = await page.locator("a[href*='/erp/preps/']").first().getAttribute("href", { timeout: 3000 }).catch(() => null);
    if (alt) await shot("prep-recipe", `https://gastrofood.vn${alt}`);
    else out.pages.push({ id: "prep-recipe", ok: false, note: "no_prep_link" });
  }
} catch (e) {
  out.pages.push({ id: "prep-recipe", ok: false, error: String(e).slice(0, 200) });
}

writeFileSync(`${outDir}/r2-prod-danish.json`, JSON.stringify(out, null, 2));
await page.close().catch(() => {});
process.exit(0);
