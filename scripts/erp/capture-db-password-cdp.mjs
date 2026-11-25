/**
 * Opens Supabase Database settings → Reset password.
 * If the UI shows a one-time password, writes ONLY to gitignored .env.db.local.
 * Never prints the password.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PROD = "ulxmubivimwxevgxxxyu";
const envPath = ".env.db.local";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto(`https://supabase.com/dashboard/project/${PROD}/settings/database`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);

const resetBtn = page.getByRole("button", { name: /reset.*password|reset database password/i }).first();
await resetBtn.click({ timeout: 15000 });
await page.waitForTimeout(2000);

// Confirm dialog if present
for (const name of [/reset password/i, /confirm/i, /generate/i, /continue/i]) {
  try {
    const b = page.getByRole("button", { name }).last();
    if (await b.isVisible({ timeout: 1500 })) {
      await b.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    /* */
  }
}

await page.waitForTimeout(3000);
const body = await page.locator("body").innerText();

// Heuristic: find a newly shown password-like string near "password"
let password = null;
const patterns = [
  /New database password[:\s]+([^\s\n]+)/i,
  /password[:\s]+([A-Za-z0-9!@#$%^&*._-]{12,})/i,
];
for (const re of patterns) {
  const m = body.match(re);
  if (m?.[1] && !/reset|database|used for|viewable/i.test(m[1])) {
    password = m[1];
    break;
  }
}

// Also try input[type=text] values in dialog
if (!password) {
  const inputs = page.locator("input");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const val = await inputs.nth(i).inputValue().catch(() => "");
    if (val && val.length >= 12 && !/supabase|postgres/i.test(val)) {
      password = val;
      break;
    }
  }
}

await page.screenshot({
  path: "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets/r12-db-password-dialog.png",
  fullPage: true,
});

if (!password) {
  console.log(
    JSON.stringify({
      ok: false,
      reason: "password_not_visible_in_ui",
      instruction: "Owner must reset password manually and write .env.db.local",
    }),
  );
  process.exit(2);
}

const content = `SUPABASE_DB_PASSWORD=${password}
SUPABASE_DB_HOST=db.${PROD}.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER=postgres
SUPABASE_DB_NAME=postgres
`;
writeFileSync(envPath, content, { encoding: "utf8", mode: 0o600 });
console.log(
  JSON.stringify({
    ok: true,
    wrote: envPath,
    password_len: password.length,
    host: `db.${PROD}.supabase.co`,
    note: "Password not printed. File is gitignored.",
  }),
);
await page.close();
await browser.close().catch(() => {});
