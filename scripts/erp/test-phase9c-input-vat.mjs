/**
 * Phase 9C local Free-path tests — Input VAT register.
 * NOT production. Does not import real finance ops.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const useLocal = process.env.ERP_TEST_LOCAL === "1" || process.argv.includes("--local");
const host = "127.0.0.1";
const port = "5432";
const user = "postgres";
const db = "gastrofood_r2_copy";
const password = "postgres";
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
void loadEnv;

function sqlRaw(q) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 3000));
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
    return { ok: false, out: String(e.message || e).slice(0, 400) };
  }
}
function sqlFile(path) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 180000,
  });
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 4000)}`);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

if (sql("select to_regclass('public.erp_tax_invoices')") === "") {
  sqlFile("supabase/migrations/20261127100000_erp_r3_input_vat_register.sql");
}
sqlFile("supabase/migrations/20261127101000_erp_r3_input_vat_rpcs.sql");

const actor = "phase9c-test";
const runId = Date.now().toString(36);

// Yellow Mustard control via erp_input_vat_split (R2-compatible)
const mustardVat = 130000;
const pending = JSON.parse(sql(`select public.erp_input_vat_split(${mustardVat}, 'pending', null)::text`));
check("mustard_pending", pending.pending === 130000 && pending.deductible === 0, JSON.stringify(pending));
const full = JSON.parse(sql(`select public.erp_input_vat_split(${mustardVat}, 'deductible', null)::text`));
check("mustard_full", full.deductible === 130000 && full.pending === 0, JSON.stringify(full));
const part = JSON.parse(sql(`select public.erp_input_vat_split(${mustardVat}, 'partial', 50)::text`));
check("mustard_partial_50", part.deductible === 65000 && part.non_deductible === 65000, JSON.stringify(part));
const nonded = JSON.parse(sql(`select public.erp_input_vat_split(${mustardVat}, 'non_deductible', null)::text`));
check("mustard_non_deductible", nonded.non_deductible === 130000 && nonded.deductible === 0, JSON.stringify(nonded));

// Expense path: Yellow Mustard as service/expense contract (no stock mutation)
const mustardPayload = JSON.stringify({
  expense_category: "ingredients",
  description: `Yellow Mustard 20kg ${runId}`,
  transaction_date: "2026-11-20",
  invoice_date: "2026-11-22",
  tax_recognition_date: "2026-11-25",
  net_amount: 1625000,
  tax_rate: 8,
  vat_amount: 130000,
  gross_amount: 1755000,
  vat_deduction_status: "pending",
}).replace(/'/g, "''");
const expId = sql(`select public.erp_save_expense_document('${mustardPayload}'::jsonb, '${actor}')`);
sql(`select public.erp_post_expense_document('${expId}'::uuid, '${actor}')`);
let reg = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date,null,null,null,null,null,'pending','expense')::text`));
const mustardRow = (reg.rows || []).find((r) => r.source_document_id === expId);
check("purchase_like_expense_pending", mustardRow && Number(mustardRow.pending_vat) === 130000 && Number(mustardRow.deductible_vat) === 0, JSON.stringify(mustardRow));

sql(`select public.erp_set_expense_vat_status('${expId}'::uuid,'deductible',null,'full_ok','${actor}','2026-11-25')`);
reg = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date,null,null,null,null,null,'deductible','expense')::text`));
check(
  "full_deduction_register",
  (reg.rows || []).some((r) => r.source_document_id === expId && Number(r.deductible_vat) === 130000 && Number(r.pending_vat) === 0),
  JSON.stringify(reg.totals),
);

sql(`select public.erp_set_expense_vat_status('${expId}'::uuid,'partial',50,'partial_50','${actor}',null)`);
reg = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date,null,null,null,null,null,'partial','expense')::text`));
check(
  "partial_deduction_register",
  (reg.rows || []).some((r) => r.source_document_id === expId && Number(r.deductible_vat) === 65000 && Number(r.non_deductible_vat) === 65000),
);

sql(`select public.erp_set_expense_vat_status('${expId}'::uuid,'non_deductible',null,'blocked','${actor}',null)`);
reg = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date,null,null,null,null,null,'non_deductible','expense')::text`));
check(
  "non_deductible_register",
  (reg.rows || []).some((r) => r.source_document_id === expId && Number(r.non_deductible_vat) === 130000),
);

const hist = Number(sql(`select count(*) from erp_input_vat_status_history where source_document_id='${expId}'`));
check("status_history_recorded", hist >= 4, String(hist));

// Distinct dates preserved
const dates = sql(
  `select transaction_date||'|'||coalesce(invoice_date::text,'')||'|'||coalesce(tax_recognition_date::text,'') from erp_expense_documents where id='${expId}'`,
);
check("distinct_dates", dates === "2026-11-20|2026-11-22|2026-11-25", dates);

// Receipt without VAT still allowed conceptually: zero VAT split
const zero = JSON.parse(sql(`select public.erp_input_vat_split(0,'pending',null)::text`));
check("no_vat_split", zero.pending === 0 && zero.deductible === 0, JSON.stringify(zero));

// Tax invoice dedupe
const inv = JSON.stringify({
  supplier_tax_id: `TAX-${runId}`,
  invoice_number: `INV-${runId}`,
  invoice_series: "C26T",
  invoice_type: "service",
  invoice_date: "2026-11-15",
  net_amount: 1000000,
  vat_amount: 80000,
  gross_amount: 1080000,
  status: "registered",
  lines: [
    { expense_category: "rent", tax_rate: 8, net_amount: 500000, vat_amount: 40000, gross_amount: 540000 },
    { expense_category: "electricity", tax_rate: 10, net_amount: 500000, vat_amount: 40000, gross_amount: 540000 },
  ],
}).replace(/'/g, "''");
const invId = sql(`select public.erp_save_tax_invoice('${inv}'::jsonb, '${actor}')`);
check("tax_invoice_multi_rate", Boolean(invId), invId);
let dup = false;
try {
  sql(`select public.erp_save_tax_invoice('${inv}'::jsonb, '${actor}')`);
} catch {
  dup = true;
}
check("tax_invoice_dedupe", dup, "second register should fail");

reg = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date,null,null,null,null,null,null,'tax_invoice')::text`));
check(
  "service_invoice_in_register",
  (reg.rows || []).filter((r) => r.source_document_id === invId).length === 2,
  String((reg.rows || []).filter((r) => r.source_document_id === invId).length),
);

// One invoice → two receipts allocation (amounts must not exceed)
const inv2 = JSON.stringify({
  supplier_tax_id: `TAX2-${runId}`,
  invoice_number: `INV2-${runId}`,
  invoice_series: "C26T",
  invoice_type: "standard",
  invoice_date: "2026-11-18",
  vat_amount: 100000,
  net_amount: 1250000,
  gross_amount: 1350000,
  status: "registered",
  lines: [{ tax_rate: 8, net_amount: 1250000, vat_amount: 100000, gross_amount: 1350000, expense_category: "ingredients" }],
  allocations: [
    { source_document_type: "receipt", source_document_id: "00000000-0000-4000-8000-000000000001", allocated_vat: 60000, allocated_net: 750000, allocated_gross: 810000 },
    { source_document_type: "receipt", source_document_id: "00000000-0000-4000-8000-000000000002", allocated_vat: 40000, allocated_net: 500000, allocated_gross: 540000 },
  ],
}).replace(/'/g, "''");
const inv2Id = sql(`select public.erp_save_tax_invoice('${inv2}'::jsonb, '${actor}')`);
check("invoice_multi_receipt_alloc", Boolean(inv2Id), inv2Id);
const over = sqlOk(
  `select public.erp_save_tax_invoice('${JSON.stringify({
    supplier_tax_id: `TAX3-${runId}`,
    invoice_number: `INV3-${runId}`,
    invoice_date: "2026-11-18",
    vat_amount: 10000,
    status: "registered",
    allocations: [
      { source_document_type: "receipt", source_document_id: "00000000-0000-4000-8000-000000000003", allocated_vat: 20000, allocated_net: 1, allocated_gross: 1 },
    ],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("allocation_cap", !over.ok && /allocation_vat_exceeds_invoice|ERP_INVALID/i.test(over.out), over.out.slice(0, 160));

// Forecast Grab blocked
const forecastBlock = sqlOk(
  `select public.erp_save_expense_document('{"expense_category":"platform_commission","transaction_date":"2026-11-01","net_amount":1,"vat_amount":0,"gross_amount":1,"from_forecast":true}'::jsonb, '${actor}')`,
);
check("forecast_grab_blocked", !forecastBlock.ok, forecastBlock.out.slice(0, 120));

// Ensure channel forecast numbers are not in register totals from a synthetic check
const channelComm = sqlOk(`select coalesce(sum(commission_rate),0)::text from erp_sales_channels`);
const regAll = JSON.parse(sql(`select public.erp_input_vat_register('2026-11-01'::date,'2026-11-30'::date)::text`));
const hasForecastNote = JSON.stringify(regAll.notes || []).includes("R1 Grab forecast never included");
check("no_forecast_in_register_contract", hasForecastNote && channelComm.ok, `notesok=${hasForecastNote}`);

// Period / location filter smoke
const regPeriod = JSON.parse(sql(`select public.erp_input_vat_register('2027-01-01'::date,'2027-01-31'::date)::text`));
check("period_filter_emptyish", Array.isArray(regPeriod.rows), String(regPeriod.rows?.length));

// RLS
const rls = sql(`
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('erp_tax_invoices','erp_expense_documents','erp_input_vat_status_history')
    and c.relrowsecurity
`);
check("rls_enabled", Number(rls) >= 3, rls);

// R1/R2/9B smoke
const objs = sql(`
  select string_agg(x, ',' order by x) from (
    select 'erp_consume' as x where exists (select 1 from pg_proc where proname='erp_consume')
    union all select 'erp_sales_documents' where to_regclass('public.erp_sales_documents') is not null
    union all select 'erp_vat_cost_adjustments' where to_regclass('public.erp_vat_cost_adjustments') is not null
    union all select 'erp_input_vat_register' where exists (select 1 from pg_proc where proname='erp_input_vat_register')
  ) s
`);
check("r1_r2_9b_objects", /erp_consume/.test(objs) && /erp_sales_documents/.test(objs) && /erp_vat_cost_adjustments/.test(objs), objs);

const auto = sql(`select sales_auto_consume_stock::text from erp_settings where id=1`);
check("auto_consume_still_off", auto === "false" || auto === "f", auto);

const outDir = join(homedir(), "GASTROBAR-backups");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "r3-phase9c-test-results.json");
writeFileSync(outPath, JSON.stringify({ checked_at: new Date().toISOString(), host, db, useLocal, results }, null, 2));
console.log(JSON.stringify({ ok: true, outPath, results }, null, 2));
