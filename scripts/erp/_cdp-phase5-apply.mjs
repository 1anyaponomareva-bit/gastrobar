import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const root = "C:/Users/Nikita Ponomarev/Downloads/BAR FOOD/GASTROBAR-inventory";
const sqlPath = `${root}/supabase/migrations/20261125130000_erp_sales_channels_finance.sql`;
const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const logPath = `${outDir}/phase5-cdp-log.txt`;
writeFileSync(logPath, "");
const log = (m) => {
  const line = typeof m === "string" ? m : JSON.stringify(m);
  console.log(line);
  writeFileSync(logPath, `${readFileSync(logPath, "utf8")}${line}\n`);
};

const backupSql = `
select 'before' as stage,
  (select count(*)::int from public.erp_sales_channels) as channels,
  (select count(*)::int from public.erp_sales_channels where commission_pct is not null) as with_legacy,
  (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'commission_pct', commission_pct) order by sort)
     from public.erp_sales_channels where archived_at is null) as channel_snapshot,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='erp_sales_channels' and column_name='commission_rate') as has_finance,
  (select count(*)::int from public.erp_lots) as lots,
  (select coalesce(sum(qty_left),0) from public.erp_lots) as lots_qty,
  (select count(*)::int from public.erp_vat_exceptions) as vat_exceptions;
`;

const verifySql = `
select 'after' as stage,
  (select count(*)::int from public.erp_sales_channels) as channels,
  (select count(*)::int from public.erp_sales_channels where legacy_commission_pct is not null
     or commission_pct is null or legacy_commission_pct is not distinct from commission_pct) as legacy_ok_rows,
  (select count(*)::int from public.erp_sales_channel_finance_history) as history_rows,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='erp_sales_channels' and column_name='commission_rate') as has_finance,
  (select count(*)::int from public.erp_sales_channels
     where finance_preliminary is true and (lower(code) like '%grab%' or lower(name) like '%grab%')) as grab_preliminary,
  (select count(*)::int from public.erp_sales_channels
     where commission_rate = 18.18 and (lower(code) like '%grab%' or lower(name) like '%grab%')) as grab_rate,
  (select count(*)::int from public.erp_lots) as lots,
  (select coalesce(sum(qty_left),0) from public.erp_lots) as lots_qty,
  (select count(*)::int from public.erp_vat_exceptions) as vat_exceptions,
  pg_get_functiondef('public.erp_save_ref(text, jsonb, text)'::regprocedure) like '%commission_rate%' as save_writes_finance;
`;

async function runSql(page, sql, label) {
  const editor = page.locator(".monaco-editor").first();
  await editor.waitFor({ timeout: 90000 });
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(sql);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Run$/i }).first().click();
  try {
    const confirm = page.getByRole("button", { name: /run.*(query|this)|confirm/i });
    if (await confirm.first().isVisible({ timeout: 2500 })) await confirm.first().click();
  } catch {
    /* none */
  }
  await page.waitForTimeout(label === "migrate" ? 15000 : 7000);
  const body = await page.locator("body").innerText();
  log({ label, snippet: body.slice(-2200) });
  return body;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = context.pages().find((p) => p.url().includes("supabase.com")) ?? (await context.newPage());

const backups = await context.newPage();
await backups.goto("https://supabase.com/dashboard/project/ulxmubivimwxevgxxxyu/database/backups/pitr", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await backups.waitForTimeout(4000);
const backupsText = await backups.locator("body").innerText();
await backups.screenshot({ path: `${outDir}/phase5-pitr.png`, fullPage: true });
log({ pitr: true, snippet: backupsText.slice(0, 900) });
await backups.close();

await page.goto("https://supabase.com/dashboard/project/ulxmubivimwxevgxxxyu/sql/new", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);

await runSql(page, backupSql, "backup");
const migration = readFileSync(sqlPath, "utf8").trim();
await runSql(page, `${migration}\n\n${verifySql}`, "migrate");
await page.screenshot({ path: `${outDir}/phase5-cdp-result.png`, fullPage: true });

const after = await page.locator("body").innerText();
const ok = /has_finance[\s\S]{0,40}true/i.test(after) && /save_writes_finance[\s\S]{0,40}true/i.test(after);
log({ verify_ok: ok });
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
await browser.close().catch(() => {});
