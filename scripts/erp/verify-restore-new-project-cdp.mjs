/**
 * Read-only: open Restore-to-new-project + Create branch dialogs; do not confirm paid actions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const project = "ulxmubivimwxevgxxxyu";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];

const restorePage = await context.newPage();
await restorePage.goto(
  `https://supabase.com/dashboard/project/${project}/database/backups/restore-to-new-project`,
  { waitUntil: "domcontentloaded", timeout: 120000 },
);
await restorePage.waitForTimeout(5000);
const restoreText = await restorePage.locator("body").innerText();
await restorePage.screenshot({ path: `${outDir}/r12-restore-to-new.png`, fullPage: true });

const branchPage = await context.newPage();
await branchPage.goto(`https://supabase.com/dashboard/project/${project}/branches`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await branchPage.waitForTimeout(4000);
// Click Create branch but do not submit
let branchDialog = null;
try {
  await branchPage.getByRole("button", { name: /create branch/i }).first().click({ timeout: 8000 });
  await branchPage.waitForTimeout(2500);
  branchDialog = await branchPage.locator("body").innerText();
  await branchPage.screenshot({ path: `${outDir}/r12-create-branch-dialog.png`, fullPage: true });
  // Close dialog if possible
  const cancel = branchPage.getByRole("button", { name: /cancel|close/i }).first();
  if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) await cancel.click();
} catch (e) {
  branchDialog = `click_failed: ${e.message}`;
  await branchPage.screenshot({ path: `${outDir}/r12-create-branch-dialog.png`, fullPage: true });
}

// Org billing page
const billing = await context.newPage();
await billing.goto("https://supabase.com/dashboard/org/_/billing", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await billing.waitForTimeout(4000);
// Try org-specific from project
await billing.goto(`https://supabase.com/dashboard/org/1anyaponomareva-bits-org/billing`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
}).catch(() => {});
await billing.waitForTimeout(3000);
let billingText = await billing.locator("body").innerText().catch(() => "");
await billing.screenshot({ path: `${outDir}/r12-org-billing.png`, fullPage: true }).catch(() => {});

const out = {
  checked_at: new Date().toISOString(),
  restore_to_new_project: {
    url: restorePage.url(),
    textSnippet: restoreText.slice(0, 4500),
    shot: `${outDir}/r12-restore-to-new.png`,
  },
  create_branch_dialog: {
    textSnippet: String(branchDialog).slice(0, 4500),
    shot: `${outDir}/r12-create-branch-dialog.png`,
  },
  billing_snippet: billingText.slice(0, 2500),
};

writeFileSync(`${outDir}/r12-restore-branch-dialogs.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await restorePage.close();
await branchPage.close();
await billing.close();
await browser.close().catch(() => {});
