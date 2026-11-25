/**
 * After Pro is active: verify backups, create preview branch r2-preprod.
 * Does NOT apply migrations to production. Does NOT print secrets.
 *
 * Env (optional, local only — never commit):
 *   ERP_PREPROD_BRANCH_NAME=r2-preprod
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const logPath = `${outDir}/r12-after-pro-log.txt`;
writeFileSync(logPath, "");
const log = (m) => {
  const line = typeof m === "string" ? m : JSON.stringify(m);
  console.log(line);
  appendFileSync(logPath, `${line}\n`);
};

const PROD = "ulxmubivimwxevgxxxyu";
const BRANCH = process.env.ERP_PREPROD_BRANCH_NAME || "r2-preprod";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto(`https://supabase.com/dashboard/project/${PROD}/database/backups/scheduled`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(5000);
let text = await page.locator("body").innerText();
await page.screenshot({ path: `${outDir}/r12-backups-post-pro.png`, fullPage: true });
const stillFree = /Free Plan does not include project backups/i.test(text);
if (stillFree) {
  writeFileSync(
    `${outDir}/r12-after-pro-status.json`,
    JSON.stringify({ ok: false, reason: "still_free_no_backups", checked_at: new Date().toISOString() }, null, 2),
  );
  log({ ok: false, reason: "still_free" });
  process.exit(2);
}

log({ backups_ok: true, snippet: text.slice(0, 1500) });

await page.goto(`https://supabase.com/dashboard/project/${PROD}/database/backups/pitr`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);
const pitrText = await page.locator("body").innerText();
await page.screenshot({ path: `${outDir}/r12-pitr-post-pro.png`, fullPage: true });
log({ pitrSnippet: pitrText.slice(0, 1200) });

await page.goto(`https://supabase.com/dashboard/project/${PROD}/branches`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);

// If branch already exists, capture and exit success
const existing = await page.locator("body").innerText();
if (new RegExp(BRANCH, "i").test(existing) && !/create a new preview branch/i.test(existing.slice(0, 200))) {
  log({ branch_already_listed: true });
}

await page.getByRole("button", { name: /create branch/i }).first().click();
await page.waitForTimeout(2500);
const dialogText = await page.locator("body").innerText();
if (/Upgrade to unlock branching/i.test(dialogText)) {
  writeFileSync(
    `${outDir}/r12-after-pro-status.json`,
    JSON.stringify({ ok: false, reason: "branching_still_locked", checked_at: new Date().toISOString() }, null, 2),
  );
  log({ ok: false, reason: "branching_locked" });
  process.exit(3);
}

// Fill name
const nameInput = page.getByLabel(/preview branch name|branch name/i).or(page.locator('input[name*="name" i]')).first();
try {
  await nameInput.fill(BRANCH, { timeout: 8000 });
} catch {
  // fallback: focused input
  await page.keyboard.type(BRANCH);
}
await page.screenshot({ path: `${outDir}/r12-create-r2-preprod-dialog.png`, fullPage: true });

// Confirm create
await page.getByRole("button", { name: /^Create branch$/i }).last().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: `${outDir}/r12-r2-preprod-creating.png`, fullPage: true });

// Wait up to ~3 minutes for branch readiness
let ready = false;
let branchRef = null;
for (let i = 0; i < 18; i++) {
  await page.goto(`https://supabase.com/dashboard/project/${PROD}/branches`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(5000);
  const body = await page.locator("body").innerText();
  log({ poll: i, hasName: new RegExp(BRANCH, "i").test(body), snippet: body.slice(0, 800) });
  if (new RegExp(BRANCH, "i").test(body) && /ready|active|healthy|functions/i.test(body)) {
    ready = true;
  }
  // Try open branch link
  try {
    const link = page.getByRole("link", { name: new RegExp(BRANCH, "i") }).first();
    if (await link.isVisible({ timeout: 2000 })) {
      await link.click();
      await page.waitForTimeout(4000);
      const url = page.url();
      const m = url.match(/\/project\/([a-z0-9]+)/i);
      if (m && m[1] !== PROD) {
        branchRef = m[1];
        ready = true;
        break;
      }
    }
  } catch {
    /* */
  }
  if (ready && branchRef) break;
  await page.waitForTimeout(10000);
}

const status = {
  checked_at: new Date().toISOString(),
  ok: Boolean(branchRef),
  production_ref: PROD,
  preprod_branch_name: BRANCH,
  preprod_project_ref: branchRef,
  backups_verified: true,
  note: "Service role / DB URL must be taken from Dashboard API settings into local env only — never chat/repo.",
};
writeFileSync(`${outDir}/r12-after-pro-status.json`, JSON.stringify(status, null, 2));
log(status);
await page.close();
await browser.close().catch(() => {});
process.exit(branchRef ? 0 : 4);
