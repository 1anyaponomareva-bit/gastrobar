/**
 * Read-only: verify production backups/PITR and branching UI via existing Chrome CDP session.
 * Does NOT apply migrations or mutate data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const reportPath = `${outDir}/r12-backup-branch-verify.json`;
const project = "ulxmubivimwxevgxxxyu";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
if (!context) throw new Error("No CDP browser context");

async function capture(pathSuffix, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(6000);
  const title = await page.title();
  const text = await page.locator("body").innerText();
  const shot = `${outDir}/${pathSuffix}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return { url, title, shot, textSnippet: text.slice(0, 4000), textLen: text.length };
}

const pitr = await capture(
  "r12-pitr",
  `https://supabase.com/dashboard/project/${project}/database/backups/pitr`,
);
const scheduled = await capture(
  "r12-scheduled-backups",
  `https://supabase.com/dashboard/project/${project}/database/backups/scheduled`,
);
const backupsRoot = await capture(
  "r12-backups-root",
  `https://supabase.com/dashboard/project/${project}/database/backups`,
);
const branches = await capture(
  "r12-branches",
  `https://supabase.com/dashboard/project/${project}/branches`,
);
const settings = await capture(
  "r12-project-settings",
  `https://supabase.com/dashboard/project/${project}/settings/general`,
);

function inferPitr(text) {
  const lower = text.toLowerCase();
  return {
    mentions_pitr: /point[- ]in[- ]time|pitr/i.test(text),
    mentions_enabled: /enabled|включ/i.test(text) && /pitr|point[- ]in[- ]time|recovery/i.test(text),
    mentions_disabled: /not enabled|disabled|upgrade|pro plan|team plan|unavailable/i.test(lower),
    has_restore_ui: /restore|восстанов/i.test(text),
    earliest_match: text.match(/earliest[^\n]{0,80}/i)?.[0] ?? null,
    latest_match: text.match(/latest[^\n]{0,80}/i)?.[0] ?? null,
    retention_match: text.match(/retention[^\n]{0,80}/i)?.[0] ?? null,
  };
}

function inferBranches(text) {
  return {
    mentions_branches: /branch/i.test(text),
    create_branch: /create branch|new branch/i.test(text),
    upgrade_required: /upgrade|pro|team|not available|enable branching/i.test(text.toLowerCase()),
    empty_or_list: text.slice(0, 500),
  };
}

const out = {
  checked_at: new Date().toISOString(),
  project_ref: project,
  mode: "read_only_cdp",
  pages: {
    pitr: { ...pitr, infer: inferPitr(pitr.textSnippet) },
    scheduled: { url: scheduled.url, title: scheduled.title, shot: scheduled.shot, infer: inferPitr(scheduled.textSnippet), textSnippet: scheduled.textSnippet },
    backupsRoot: { url: backupsRoot.url, title: backupsRoot.title, shot: backupsRoot.shot, textSnippet: backupsRoot.textSnippet },
    branches: { ...branches, infer: inferBranches(branches.textSnippet) },
    settings: { url: settings.url, title: settings.title, shot: settings.shot, textSnippet: settings.textSnippet.slice(0, 2500) },
  },
};

writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close().catch(() => {});
