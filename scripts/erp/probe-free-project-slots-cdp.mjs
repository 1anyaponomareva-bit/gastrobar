/** Read-only: org project count / New project availability. */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto("https://supabase.com/dashboard/org/plxisvrratzutzdhfurr", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(5000);
const text = await page.locator("body").innerText();
await page.screenshot({ path: `${outDir}/r12-org-projects-free.png`, fullPage: true });

await page.goto("https://supabase.com/dashboard/project/ulxmubivimwxevgxxxyu/settings/database", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(5000);
const dbText = await page.locator("body").innerText();
await page.screenshot({ path: `${outDir}/r12-db-settings.png`, fullPage: true });

writeFileSync(
  `${outDir}/r12-free-path-probe.json`,
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      org_snippet: text.slice(0, 2500),
      project_count_hint: (text.match(/projects?/gi) || []).length,
      mentions_spice: /spicespace/i.test(text),
      new_project_visible: /new project/i.test(text),
      db_settings_has_connection: /connection string|database password|host|pooler/i.test(dbText),
      db_snippet: dbText.slice(0, 2500),
    },
    null,
    2,
  ),
);
console.log("wrote r12-free-path-probe.json");
await page.close();
await browser.close().catch(() => {});
