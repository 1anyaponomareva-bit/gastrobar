/** Open Pro checkout for owner payment; do not submit card details. */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto(
  "https://supabase.com/dashboard/org/plxisvrratzutzdhfurr/billing?panel=subscriptionPlan&source=backups",
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await page.waitForTimeout(4000);

// Click Upgrade to Pro in the plan panel
const upgradeBtn = page.getByRole("button", { name: /^Upgrade to Pro$/i }).first();
await upgradeBtn.waitFor({ timeout: 20000 });
await upgradeBtn.click();
await page.waitForTimeout(5000);

await page.screenshot({ path: `${outDir}/r12-pro-checkout.png`, fullPage: true });
const text = await page.locator("body").innerText();
writeFileSync(
  `${outDir}/r12-pro-checkout.json`,
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      url: page.url(),
      snippet: text.slice(0, 3500),
      instruction: "Owner must complete payment in this Chrome window. Agent will not enter card details.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ url: page.url(), needsPayment: /card|payment|stripe|subscribe|confirm/i.test(text) }, null, 2));
// leave page open for owner — do not close browser
await browser.close().catch(() => {});
