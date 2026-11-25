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
await page.waitForTimeout(5000);

// Ensure plan panel visible
const upgrade = page.getByRole("button", { name: /Upgrade to Pro/i });
await upgrade.first().click({ timeout: 20000 });
await page.waitForTimeout(6000);

// If spend cap / confirm step appears, click through non-destructive confirms until payment
for (const name of [/continue/i, /confirm/i, /upgrade organization/i, /subscribe/i]) {
  try {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible({ timeout: 1500 })) {
      const label = await b.innerText();
      // Do not click final pay if it says Pay $ — leave for owner
      if (/pay \$|add card|complete payment/i.test(label)) break;
      await b.click();
      await page.waitForTimeout(3000);
    }
  } catch {
    /* */
  }
}

await page.screenshot({ path: `${outDir}/r12-pro-payment-step.png`, fullPage: true });
const text = await page.locator("body").innerText();
writeFileSync(
  `${outDir}/r12-pro-payment-step.json`,
  JSON.stringify({ url: page.url(), snippet: text.slice(0, 4000), at: new Date().toISOString() }, null, 2),
);
console.log(JSON.stringify({ url: page.url(), hasCardForm: /card number|payment method|stripe/i.test(text) }, null, 2));
await browser.close().catch(() => {});
