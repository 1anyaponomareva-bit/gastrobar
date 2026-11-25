/**
 * Owner-approved: attempt Pro upgrade path + create r2-preprod branch.
 * Never prints secrets. Does not touch production schema/SQL.
 * Payment confirmation may require owner interaction in the open Chrome.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const logPath = `${outDir}/r12-pro-preprod-log.txt`;
writeFileSync(logPath, "");
const log = (m) => {
  const line = typeof m === "string" ? m : JSON.stringify(m);
  console.log(line);
  writeFileSync(logPath, `${readFileSync(logPath, "utf8")}${line}\n`);
};

const PROD = "ulxmubivimwxevgxxxyu";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
if (!context) throw new Error("No CDP context");

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function shot(page, name) {
  const path = `${outDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

// 1) Detect org slug from production project nav
const page = await context.newPage();
await page.goto(`https://supabase.com/dashboard/project/${PROD}/settings/general`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);
const settingsText = await bodyText(page);
await shot(page, "r12-pro-step-settings");
log({ step: "settings", planHint: /FREE|PRO|TEAM|Enterprise/i.exec(settingsText)?.[0] ?? null });

// Find org billing link
const orgHome = page.locator('a[href*="/dashboard/org/"]').first();
let orgHref = null;
try {
  orgHref = await orgHome.getAttribute("href", { timeout: 5000 });
} catch {
  /* */
}
log({ orgHref });

// Prefer explicit billing from org projects list
await page.goto("https://supabase.com/dashboard/organizations", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(3000);
const orgsText = await bodyText(page);
await shot(page, "r12-pro-step-orgs");
log({ orgsSnippet: orgsText.slice(0, 1500) });

// Click the org card if visible
try {
  await page.getByText(/1anyaponomareva-bit/i).first().click({ timeout: 8000 });
  await page.waitForTimeout(3000);
} catch (e) {
  log({ orgClick: String(e.message) });
}

const afterOrgUrl = page.url();
log({ afterOrgUrl });
await shot(page, "r12-pro-step-org-home");

// Navigate billing
const billingCandidates = [
  afterOrgUrl.includes("/org/") ? `${afterOrgUrl.replace(/\/$/, "")}/billing` : null,
  orgHref ? `${new URL(orgHref, "https://supabase.com").pathname.replace(/\/$/, "")}/billing` : null,
].filter(Boolean);

let billingText = "";
for (const href of billingCandidates) {
  const url = href.startsWith("http") ? href : `https://supabase.com${href}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    billingText = await bodyText(page);
    await shot(page, "r12-pro-step-billing");
    log({ billingUrl: page.url(), plan: /FREE|Pro|Team|Enterprise/i.exec(billingText)?.[0] ?? null });
    break;
  } catch (e) {
    log({ billingNavFail: url, err: e.message });
  }
}

const isPro =
  /\bPRO\b/i.test(billingText) && !/upgrade to pro/i.test(billingText.slice(0, 800))
    ? /current plan[^\n]*pro|plan\s*:\s*pro|you're on pro|pro plan/i.test(billingText) ||
      (/pro/i.test(billingText) && !/free plan/i.test(billingText.slice(0, 1200)))
    : false;

// More reliable: check backups page after any upgrade attempt
await page.goto(`https://supabase.com/dashboard/project/${PROD}/database/backups/scheduled`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);
let backupsText = await bodyText(page);
await shot(page, "r12-pro-step-backups-before");
const freeNoBackup = /Free Plan does not include project backups/i.test(backupsText);
log({ freeNoBackup, backupsSnippet: backupsText.slice(0, 900) });

if (freeNoBackup) {
  // Start upgrade from backups CTA
  try {
    const upgrade = page.getByRole("link", { name: /upgrade/i }).first();
    if (await upgrade.isVisible({ timeout: 3000 })) {
      await upgrade.click();
      await page.waitForTimeout(5000);
    } else {
      await page.getByRole("button", { name: /upgrade/i }).first().click({ timeout: 5000 });
      await page.waitForTimeout(5000);
    }
  } catch (e) {
    log({ upgradeClick: e.message });
    // try billing upgrade button
    try {
      await page.goto(billingCandidates[0] ? `https://supabase.com${billingCandidates[0].replace("https://supabase.com", "")}` : "https://supabase.com/dashboard/organizations", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch {
      /* */
    }
  }
  await shot(page, "r12-pro-step-upgrade-flow");
  const upgradeText = await bodyText(page);
  log({
    step: "upgrade_flow",
    url: page.url(),
    needsOwnerPayment: /card|stripe|checkout|payment|subscribe|confirm/i.test(upgradeText),
    snippet: upgradeText.slice(0, 2000),
  });
}

// Re-check plan via backups (truth for our purpose)
await page.goto(`https://supabase.com/dashboard/project/${PROD}/database/backups/scheduled`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(5000);
backupsText = await bodyText(page);
await shot(page, "r12-pro-step-backups-after");
const stillFree = /Free Plan does not include project backups/i.test(backupsText);
log({ stillFree, backupsAfter: backupsText.slice(0, 1200) });

const result = {
  checked_at: new Date().toISOString(),
  production_ref: PROD,
  stillFree,
  proReady: !stillFree,
  next: stillFree
    ? "OWNER_MUST_COMPLETE_PRO_PAYMENT_IN_OPEN_BROWSER"
    : "PROCEED_CREATE_R2_PREPROD_BRANCH",
};
writeFileSync(`${outDir}/r12-pro-status.json`, JSON.stringify(result, null, 2));
log(result);

await page.close();
// keep browser connected for owner if payment needed
await browser.close().catch(() => {});
