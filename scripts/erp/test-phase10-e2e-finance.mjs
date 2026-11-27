/**
 * Phase 10C — End-to-end financial lifecycle on local Free-path DB (gastrofood_r2_copy).
 * Far-future fixtures only. No production / no real stock mutation of current ops.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const host = "127.0.0.1";
const user = "postgres";
const db = "gastrofood_r2_copy";
const password = "postgres";
const actor = "phase10-e2e";
const runId = Date.now().toString(36);

function sqlRaw(q) {
  const r = spawnSync(psql, ["-h", host, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 180000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "").slice(0, 4000));
  return (r.stdout || "").trim();
}
function sql(q) {
  return sqlRaw(q)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(x))[0] ?? "";
}
function sqlOk(q) {
  try {
    return { ok: true, out: sqlRaw(q) };
  } catch (e) {
    return { ok: false, out: String(e.message || e).slice(0, 600) };
  }
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail: String(detail ?? "").slice(0, 280) });
  console.log(JSON.stringify(results[results.length - 1]));
  if (!cond) throw new Error("FAIL " + name);
}

const y = 2110;
const pStart = `${y}-03-01`;
const pEnd = `${y}-03-31`;
const p2Start = `${y}-04-01`;
const p2End = `${y}-04-30`;

// Ensure product + dish exist for BOM path (reuse catalog if present)
const productId = sql(`select id::text from erp_products order by created_at nulls last limit 1`);
const dishId = sql(`select id::text from erp_dishes order by created_at nulls last limit 1`);
const whId = sql(`select id::text from erp_warehouses order by created_at nulls last limit 1`);
check("catalog_product", Boolean(productId), productId);
check("catalog_dish", Boolean(dishId), dishId);
check("catalog_wh", Boolean(whId), whId);

// 1-2 Input VAT / expense purchase (opex path also registers input VAT)
const expId = sql(
  `select public.erp_save_expense_document('${JSON.stringify({
    expense_category: "operations",
    description: `E2E purchase ${runId}`,
    transaction_date: `${y}-03-05`,
    invoice_date: `${y}-03-05`,
    net_amount: 1000000,
    tax_rate: 10,
    vat_amount: 100000,
    gross_amount: 1100000,
    vat_deduction_status: "pending",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`update erp_expense_documents set recognition_date='${y}-03-05' where id='${expId}'`);
sql(`select public.erp_post_expense_document('${expId}'::uuid, '${actor}')`);
check("step_expense_posted", sql(`select status from erp_expense_documents where id='${expId}'`) === "posted", "posted");

const ivat = JSON.parse(
  sql(`select public.erp_input_vat_register('${y}-03-01'::date,'${y}-03-31'::date)::text`),
);
check("step_input_vat_register", Array.isArray(ivat.rows) || ivat.totals != null, "register");

// 6-10 Sales + output VAT (+ BOM/COGS attempt without auto-consume)
const saleId = sql(
  `select public.erp_save_sales_document('${JSON.stringify({
    source_system: "manual",
    business_date: `${y}-03-12`,
    warehouse_id: whId,
    payment_status: "paid",
    lines: [{ dish_id: dishId, description: "E2E dish", quantity: 1, gross_sales: 99000 }],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`update erp_sales_documents set business_date='${y}-03-12' where id='${saleId}'`);
sql(`select public.erp_post_sales_document('${saleId}'::uuid, '${actor}')`);
check("step_sale_posted", ["posted", "partially_refunded"].includes(sql(`select order_status from erp_sales_documents where id='${saleId}'`)), "posted");

const bom = sqlOk(
  `select public.erp_sales_bom_explode('${dishId}'::uuid, 1, '[]'::jsonb, '{}'::uuid[], now())::text`,
);
check("step_bom_explode", bom.ok, bom.out.slice(0, 120));

const cogs = sqlOk(`select public.erp_sales_post_cogs('${saleId}'::uuid, '${actor}', false)::text`);
check("step_cogs_no_autoconsume", cogs.ok, cogs.out.slice(0, 120));
check("auto_consume_off", sql(`select coalesce(sales_auto_consume_stock::text,'false') from erp_settings where id=1`) === "false", "false");

// 11-14 Platform fixture import (normalized path)
const platAcct =
  sql(`select id::text from erp_platform_accounts limit 1`) ||
  sql(
    `insert into erp_platform_accounts (platform_code, account_code, name) values ('grab','e2e-${runId}','E2E Grab') returning id::text`,
  );
const platBatch = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: platAcct,
    source_format: "normalized_json_v1",
    file_name: `e2e-${runId}.json`,
    file_sha256: `e2e${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const plat = sqlOk(
  `select public.erp_platform_import_preview('${platBatch}'::uuid, '${JSON.stringify([
    {
      external_order_id: `e2e-${runId}`,
      settlement_date: `${y}-03-15`,
      gross_sales: 99000,
      commission: 2000,
      advertising: 1000,
      net_payout: 96000,
    },
  ]).replace(/'/g, "''")}'::jsonb, '${actor}')::text`,
);
check("step_platform_preview", plat.ok, plat.out.slice(0, 120));

// 15-17 Payroll + asset depreciation
const payId = sql(
  `select public.erp_payroll_accrual_save('${JSON.stringify({
    period_start: pStart,
    period_end: pEnd,
    employee_name: `E2E ${runId}`,
    gross_salary: 5000000,
    employee_social_insurance: 500000,
    employer_social_insurance: 850000,
    pit: 200000,
    net_salary: 4300000,
    staff_meals: 0,
    source: "manual",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_payroll_accrual_post('${payId}'::uuid, '${actor}')`);
check("step_payroll_posted", sql(`select status from erp_payroll_accruals where id='${payId}'`) === "posted", "posted");

const assetId = sql(
  `select public.erp_fixed_asset_save('${JSON.stringify({
    name: `E2E asset ${runId}`,
    acquisition_date: `${y}-03-01`,
    acquisition_cost: 12000000,
    useful_life_months: 24,
    depreciation_start_date: `${y}-03-01`,
    status: "draft",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_fixed_asset_activate('${assetId}'::uuid, '${actor}')`);
const depr = sqlOk(
  `select public.erp_depreciation_run('${assetId}'::uuid, '${pStart}'::date, '${pEnd}'::date, '${actor}')::text`,
);
check("step_depreciation", depr.ok, depr.out.slice(0, 120));

// 18 VAT settlement math (independent of financial close)
const vat = JSON.parse(sql(`select public.erp_vat_settlement_compute(1000000, 100000, 0, 0, 0, 0)::text`));
check("step_vat_settlement", vat != null && vat.vat_payable != null, JSON.stringify(vat).slice(0, 120));

// 19-21 P&L / CF / AP-AR
const pnl = JSON.parse(sql(`select public.erp_accrual_pnl('${pStart}'::date,'${pEnd}'::date,null)::text`));
check("step_accrual_pnl", pnl != null && (pnl.net_revenue != null || pnl.completeness != null), JSON.stringify(pnl.completeness || {}).slice(0, 80));
const cf = JSON.parse(sql(`select public.erp_management_cashflow('${pStart}'::date,'${pEnd}'::date)::text`));
check("step_cashflow", cf != null && cf.closing_cash_balance != null, String(cf.closing_cash_balance));
const apar = JSON.parse(sql(`select public.erp_ap_ar_summary()::text`));
check("step_apar", apar != null, "summary");

// 22 Close financial period
const periodId = sql(
  `select public.erp_financial_period_save('${JSON.stringify({ period_start: pStart, period_end: pEnd, period_name: `${y}-03-${runId}` }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const close = JSON.parse(sql(`select public.erp_period_close('${periodId}'::uuid, '${actor}', true, 'e2e close ack')::text`));
check("step_period_close", close.ok === true, JSON.stringify(close).slice(0, 80));

// Double-count guards: expense net unchanged after close; sale totals frozen
check("no_double_expense", Number(sql(`select net_amount::text from erp_expense_documents where id='${expId}'`)) === 1000000, "1m");
const saleGross = Number(sql(`select coalesce(gross_sales, 0)::text from erp_sales_documents where id='${saleId}'`));
check("sale_gross_stable", saleGross > 0, String(saleGross));

// 23 Correction in next period
const nextPeriod = sql(
  `select public.erp_financial_period_save('${JSON.stringify({ period_start: p2Start, period_end: p2End, period_name: `${y}-04-${runId}` }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const corr = sql(
  `select public.erp_financial_correction_save('${JSON.stringify({
    correction_kind: "expense",
    original_document_id: expId,
    original_period_id: periodId,
    recognition_period_id: nextPeriod,
    adjustment_amount: -50000,
    adjustment_reason: `e2e corr ${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_financial_correction_post('${corr}'::uuid, '${actor}')`);
check("step_correction_next_period", sql(`select status from erp_financial_corrections where id='${corr}'`) === "posted", "posted");
check("original_untouched_after_corr", Number(sql(`select net_amount::text from erp_expense_documents where id='${expId}'`)) === 1000000, "1m");

const outDir = join("docs", "screenshots", "phase10");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "e2e-finance-results.json"), JSON.stringify({ ok: true, runId, periodId, results }, null, 2));
console.log(JSON.stringify({ ok: true, passed: results.length, runId }));
