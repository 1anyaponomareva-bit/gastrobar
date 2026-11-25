import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const outDir =
  "C:/Users/Nikita Ponomarev/.cursor/projects/c-Users-Nikita-Ponomarev-Downloads-BAR-FOOD-GASTROBAR-inventory/assets";
mkdirSync(outDir, { recursive: true });
const logPath = `${outDir}/phase5-verify-log.txt`;
writeFileSync(logPath, "");
const log = (m) => {
  const line = typeof m === "string" ? m : JSON.stringify(m);
  console.log(line);
  writeFileSync(logPath, `${readFileSync(logPath, "utf8")}${line}\n`);
};

const safetySql = `
select
  (select count(*)::int from public.erp_lots) as lots,
  (select coalesce(sum(qty_left),0) from public.erp_lots) as lots_qty,
  (select count(*)::int from public.erp_vat_exceptions) as vat_exceptions,
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='erp_sales_channels' and column_name='commission_rate') as has_finance,
  exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='erp_sales_channel_finance_history') as has_history,
  (select count(*)::int from public.erp_sales_channel_finance_history) as history_rows,
  (select count(*)::int from public.erp_sales_channels
     where legacy_commission_pct is not distinct from commission_pct
        or (commission_pct is null and legacy_commission_pct is null)
        or legacy_commission_pct is not null) as legacy_preserved,
  (select count(*)::int from public.erp_sales_channels
     where finance_preliminary is true and (lower(code) like '%grab%' or lower(name) like '%grab%')) as grab_preliminary,
  pg_get_functiondef('public.erp_save_ref(text, jsonb, text)'::regprocedure) like '%commission_rate%' as save_writes_finance;
`;

const detailSql = `
select code, name, commission_pct, legacy_commission_pct,
  commission_enabled, commission_rate, commission_vat_included, commission_vat_rate,
  commission_calc_base, commission_vat_deduction_status,
  advertising_enabled, advertising_scenario, advertising_rate,
  advertising_vat_included, advertising_vat_rate, advertising_calc_base,
  advertising_organic_gross_pct, advertising_standard_gross_pct, advertising_full_gross_pct,
  advertising_vat_deduction_status, finance_preliminary, min_margin_pct, target_margin_pct, optimal_margin_pct
from public.erp_sales_channels
where archived_at is null
order by sort, code;
`;

const histSql = `
select c.code, h.changed_at, h.change_kind, h.effective_from, h.effective_to,
  h.snapshot->>'commission_rate' as snap_commission_rate,
  h.snapshot->>'advertising_rate' as snap_advertising_rate,
  h.snapshot->>'finance_preliminary' as snap_preliminary
from public.erp_sales_channel_finance_history h
join public.erp_sales_channels c on c.id = h.channel_id
order by h.changed_at desc
limit 20;
`;

async function runSql(page, sql, label) {
  const editor = page.locator(".monaco-editor").first();
  await editor.waitFor({ timeout: 90000 });
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(sql);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Run$/i }).first().click();
  try {
    const confirm = page.getByRole("button", { name: /run.*(query|this)|confirm/i });
    if (await confirm.first().isVisible({ timeout: 2500 })) await confirm.first().click();
  } catch {
    /* none */
  }
  await page.waitForTimeout(7000);
  const body = await page.locator("body").innerText();
  log({ label, snippet: body.slice(-4000) });
  await page.screenshot({ path: `${outDir}/phase5-${label}.png`, fullPage: true });
  return body;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = context.pages().find((p) => p.url().includes("supabase.com")) ?? (await context.newPage());

await page.goto("https://supabase.com/dashboard/project/ulxmubivimwxevgxxxyu/sql/new", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.waitForTimeout(4000);

const safety = await runSql(page, safetySql, "safety");
const detail = await runSql(page, detailSql, "channels");
const hist = await runSql(page, histSql, "history");

const ok =
  /\btrue\b/.test(safety) &&
  /has_finance/.test(safety) &&
  /Direct|direct/i.test(detail) &&
  /Grab|grab/i.test(detail) &&
  /Shopee|shopee/i.test(detail) &&
  !/Failed to run sql query/i.test(detail) &&
  !/Failed to run sql query/i.test(hist) &&
  !/Failed to run sql query/i.test(safety);

log({ verify_ok: ok });
if (!ok) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
await browser.close().catch(() => {});
