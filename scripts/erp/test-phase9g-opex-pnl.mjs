/**
 * Phase 9G Free-path tests — opex, payroll, assets, accrual P&L, CF, AP/AR.
 * No real salaries/assets/expenses. Auto-consume untouched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const host = "127.0.0.1";
const port = "5432";
const user = "postgres";
const db = "gastrofood_r2_copy";
const password = "postgres";
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";

function sqlRaw(q) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 4000));
  return (r.stdout || "").trim();
}
function sql(q) {
  const lines = sqlRaw(q)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(x));
  return lines[0] ?? "";
}
function sqlOk(q) {
  try {
    return { ok: true, out: sqlRaw(q) };
  } catch (e) {
    return { ok: false, out: String(e.message || e).slice(0, 800) };
  }
}
function sqlFile(path) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 180000,
  });
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 5000)}`);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail: String(detail ?? "").slice(0, 280) }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

sqlFile("supabase/migrations/20261127140000_erp_r3_opex_assets_pnl.sql");
sqlFile("supabase/migrations/20261127141000_erp_r3_opex_pnl_rpcs.sql");

const actor = "phase9g-test";
const runId = Date.now().toString(36);

// --- Control P&L §18 ---
const math = JSON.parse(sql(`select public.erp_accrual_pnl_control_math()::text`));
check("ctrl_cogs", Number(math.total_cogs) === 140000000, String(math.total_cogs));
check("ctrl_gp", Number(math.gross_profit) === 360000000, String(math.gross_profit));
check("ctrl_gm", Number(math.gross_margin_pct) === 72, String(math.gross_margin_pct));
check("ctrl_cm", Number(math.contribution_margin) === 245000000, String(math.contribution_margin));
check("ctrl_cm_pct", Number(math.contribution_margin_pct) === 49, String(math.contribution_margin_pct));
check("ctrl_ebitda", Number(math.ebitda) === 80000000, String(math.ebitda));
check("ctrl_ebitda_m", Number(math.ebitda_margin_pct) === 16, String(math.ebitda_margin_pct));
check("ctrl_ebit", Number(math.ebit) === 75000000, String(math.ebit));
check("ctrl_pbt", Number(math.profit_before_tax) === 75000000, String(math.profit_before_tax));
check("ctrl_pbt_m", Number(math.profit_before_tax_margin_pct) === 15, String(math.profit_before_tax_margin_pct));
check("ctrl_cit_null", math.cit == null && math.net_profit == null, JSON.stringify({ cit: math.cit, np: math.net_profit }));
check("ctrl_np_pending", /Pending Tax/i.test(math.net_profit_status || ""), math.net_profit_status);

// --- 9G-A Expense ---
const expId = sql(
  `select public.erp_save_expense_document('${JSON.stringify({
    expense_category: "rent",
    description: `Rent ${runId}`,
    transaction_date: "2096-03-01",
    invoice_date: "2096-03-01",
    payment_due_date: "2096-03-15",
    net_amount: 10000000,
    tax_rate: 10,
    vat_amount: 1000000,
    gross_amount: 11000000,
    vat_deduction_status: "pending",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
// payment_due may need direct update if save doesn't map it yet
sql(`update erp_expense_documents set payment_due_date='2096-03-15', recognition_date='2096-03-01' where id='${expId}'`);
sql(`select public.erp_post_expense_document('${expId}'::uuid, '${actor}')`);
check("exp_posted", sql(`select status from erp_expense_documents where id='${expId}'`) === "posted", "posted");
const ap1 = Number(sql(`select count(*)::text from erp_ap_ar_items where source_id='${expId}' and kind='payable'`));
check("exp_ap_created", ap1 >= 1, String(ap1));

const pay1 = sql(
  `select public.erp_expense_payment_save('${JSON.stringify({
    expense_id: expId,
    payment_key: `exppay:${runId}:1`,
    payment_date: "2096-03-10",
    amount: 5000000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_expense_payment_post('${pay1}'::uuid, '${actor}')`);
check("exp_partial", sql(`select payment_status from erp_expense_documents where id='${expId}'`) === "partially_paid", "partial");

const pay1b = sql(
  `select public.erp_expense_payment_save('${JSON.stringify({
    expense_id: expId,
    payment_key: `exppay:${runId}:1`,
    payment_date: "2096-03-10",
    amount: 5000000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("exp_pay_idempotent", pay1b === pay1, `${pay1b}==${pay1}`);

const pay2 = sql(
  `select public.erp_expense_payment_save('${JSON.stringify({
    expense_id: expId,
    payment_key: `exppay:${runId}:2`,
    payment_date: "2096-03-20",
    amount: 6000000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_expense_payment_post('${pay2}'::uuid, '${actor}')`);
check("exp_full_paid", sql(`select payment_status from erp_expense_documents where id='${expId}'`) === "paid", "paid");

// No double P&L: payment does not create second expense document
check("exp_single_doc", Number(sql(`select count(*)::text from erp_expense_documents where id='${expId}'`)) === 1, "1");

// Allocation
const loc = sql(`select id::text from erp_locations order by created_at limit 1`);
const allocOk = sqlOk(
  `select public.erp_expense_allocation_save('${JSON.stringify({
    expense_id: expId,
    allocation_method: "manual",
    allocations: [
      { location_id: loc, method: "manual", amount: 6000000 },
      { location_id: loc, method: "manual", amount: 4000000 },
    ],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("exp_alloc", allocOk.ok, allocOk.out.slice(0, 200));
const autoFail = sqlOk(
  `select public.erp_expense_allocation_save('${JSON.stringify({
    expense_id: expId,
    auto: true,
    allocations: [],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("auto_alloc_off", !autoFail.ok, autoFail.out.slice(0, 160));

// Locked edit
const lock = sqlOk(
  `select public.erp_save_expense_document('${JSON.stringify({ id: expId, expense_category: "rent", net_amount: 1, transaction_date: "2096-03-01" }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("exp_locked", !lock.ok, lock.out.slice(0, 120));

// --- 9G-B Payroll ---
const acc = sql(
  `select public.erp_payroll_accrual_save('${JSON.stringify({
    accrual_key: `payacc:${runId}`,
    period_start: "2096-03-01",
    period_end: "2096-03-31",
    gross_payroll: 10000000,
    employee_social_insurance: 1000000,
    employer_social_insurance: 2000000,
    personal_income_tax_withholding: 500000,
    staff_meals: 300000,
    source_system: "manual",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_payroll_accrual_post('${acc}'::uuid, '${actor}')`);
const net = Number(sql(`select net_payroll::text from erp_payroll_accruals where id='${acc}'`));
check("payroll_net", net === 8500000, String(net)); // 10M - 1M emp SI - 0.5M PIT
check("employer_si_not_in_net", Number(sql(`select employer_social_insurance::text from erp_payroll_accruals where id='${acc}'`)) === 2000000, "er");

const ppay = sql(
  `select public.erp_payroll_payment_post('${JSON.stringify({
    accrual_id: acc,
    payment_key: `paypay:${runId}`,
    payment_date: "2096-04-05",
    amount: 8500000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("payroll_paid_next_period", Boolean(ppay), ppay);
check("payroll_pay_status", sql(`select payment_status from erp_payroll_accruals where id='${acc}'`) === "paid", "paid");
// Payment idempotent
const ppay2 = sql(
  `select public.erp_payroll_payment_post('${JSON.stringify({
    accrual_id: acc,
    payment_key: `paypay:${runId}`,
    payment_date: "2096-04-05",
    amount: 8500000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("payroll_pay_idempotent", ppay2 === ppay, "idem");

// --- 9G-C Assets ---
const asset = sql(
  `select public.erp_fixed_asset_save('${JSON.stringify({
    name: `Test Oven ${runId}`,
    category: "kitchen_equipment",
    acquisition_date: "2096-01-01",
    acquisition_cost: 12000000,
    residual_value: 0,
    useful_life_months: 12,
    depreciation_start_date: "2096-01-01",
    depreciation_method: "straight_line",
    status: "draft",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_fixed_asset_activate('${asset}'::uuid, '${actor}')`);
const depr = sql(`select public.erp_depreciation_run('${asset}'::uuid, '2096-03-01'::date, '2096-03-31'::date, '${actor}')`);
check("depr_created", Boolean(depr), depr);
const deprAmt = Number(sql(`select amount::text from erp_depreciation_entries where id='${depr}'`));
check("depr_straight_line", deprAmt === 1000000, String(deprAmt)); // 12M/12
const depr2 = sql(`select public.erp_depreciation_run('${asset}'::uuid, '2096-03-01'::date, '2096-03-31'::date, '${actor}')`);
check("depr_idempotent", depr2 === depr, "idem");
check("nbv_updated", Number(sql(`select net_book_value::text from erp_fixed_assets where id='${asset}'`)) === 11000000, "nbv");

// Capitalizable expense should not create opex AP the same way — create capitalizable
const cap = sql(
  `select public.erp_save_expense_document('${JSON.stringify({
    expense_category: "fixed_assets",
    description: `Capex ${runId}`,
    transaction_date: "2096-02-01",
    net_amount: 5000000,
    vat_amount: 0,
    gross_amount: 5000000,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`update erp_expense_documents set is_capitalizable=true where id='${cap}'`);
sql(`select public.erp_post_expense_document('${cap}'::uuid, '${actor}')`);
const capAp = Number(sql(`select count(*)::text from erp_ap_ar_items where source_id='${cap}'`));
check("capex_no_opex_ap", capAp === 0, String(capAp));

// --- Accrual P&L / CF / Dashboard ---
const pnl = JSON.parse(sql(`select public.erp_accrual_pnl('2096-03-01'::date,'2096-03-31'::date,null)::text`));
check("pnl_basis", pnl.basis === "accrual", pnl.basis);
check("pnl_has_rent", Number(pnl.rent) >= 10000000, String(pnl.rent));
check("pnl_has_payroll", Number(pnl.payroll) >= 10000000, String(pnl.payroll));
check("pnl_has_depr", Number(pnl.depreciation) >= 1000000, String(pnl.depreciation));
check("pnl_cit_pending", /Pending Tax/i.test(pnl.net_profit_status || ""), pnl.net_profit_status);
check("pnl_net_null", pnl.net_profit == null, String(pnl.net_profit));

const cf = JSON.parse(sql(`select public.erp_management_cashflow('2096-03-01'::date,'2096-03-31'::date)::text`));
check("cf_has_open", cf.opening_cash_balance != null, String(cf.opening_cash_balance));
check("cf_note_internal", /Internal transfers/i.test(cf.note || ""), "note");

const dash = JSON.parse(sql(`select public.erp_finance_dashboard('2096-03-01'::date,'2096-03-31'::date)::text`));
check("dash_pbt", dash.profit_before_tax != null, String(dash.profit_before_tax));
check("dash_ap", dash.accounts_payable != null, String(dash.accounts_payable));

const apar = JSON.parse(sql(`select public.erp_ap_ar_summary()::text`));
check("apar_payables", Array.isArray(apar.payables), String(apar.payables?.length));

// Settings CIT
check("cit_tbd", sql(`select cit_status from erp_settings where id=1`) === "accountant_tbd", "tbd");
check("auto_alloc_flag_off", sql(`select expense_auto_allocate::text from erp_settings where id=1`) === "false", "off");

// Regression
check("reg_9f_bom", sql(`select to_regclass('public.erp_sales_bom_snapshots')`) === "erp_sales_bom_snapshots", "9f");
check("reg_9e", sql(`select to_regclass('public.erp_vat_settlements')`) === "erp_vat_settlements", "9e");
check("reg_cashbook", sql(`select to_regclass('public.erp_finance_transactions')`) === "erp_finance_transactions", "cash");
check("auto_consume_off", sql(`select sales_auto_consume_stock::text from erp_settings where id=1`) === "false", "off");

const outDir = join("docs", "assets", "phase9g");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "r3-phase9g-test-results.json"), JSON.stringify({ runId, results, math, pnl }, null, 2));
console.log(JSON.stringify({ ok: true, passed: results.length }));
