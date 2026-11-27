/**
 * Phase 9H Free-path tests — financial periods, close, protect, reopen, corrections, audit.
 * Local PG only (gastrofood_r2_copy). No production SQL. No real finance/stock mutation beyond future-dated fixtures.
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
    timeout: 180000,
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

sqlFile("supabase/migrations/20261127150000_erp_r3_financial_periods.sql");
sqlFile("supabase/migrations/20261127151000_erp_r3_financial_periods_rpcs.sql");

const actor = "phase9h-test";
const runId = Date.now().toString(36);
// Unique far-future month per run (avoid overlap with prior fixtures)
const monthNum = 1 + (Date.now() % 11); // 1..11 → leave room for +1 month
const y = 2098 + (Date.now() % 50);
const mm = String(monthNum).padStart(2, "0");
const mm2 = String(monthNum + 1).padStart(2, "0");
const pStart = `${y}-${mm}-01`;
const pEnd = sql(`select (date '${pStart}' + interval '1 month - 1 day')::date::text`);
const p2Start = `${y}-${mm2}-01`;
const p2End = sql(`select (date '${p2Start}' + interval '1 month - 1 day')::date::text`);
const midDay = `${y}-${mm}-10`;
const midDay2 = `${y}-${mm}-12`;
const payDay = `${y}-${mm2}-05`;
const pName = `${y}-${mm}-${runId}`;

// --- 9H-A create open period ---
const periodId = sql(
  `select public.erp_financial_period_save('${JSON.stringify({
    period_start: pStart,
    period_end: pEnd,
    period_name: pName,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("9h_a_period_created", Boolean(periodId), periodId);
check("9h_a_status_open", sql(`select status from erp_financial_periods where id='${periodId}'`) === "open", "open");

const overlap = sqlOk(
  `select public.erp_financial_period_save('${JSON.stringify({
    period_start: midDay,
    period_end: p2End,
    period_name: "overlap",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("9h_a_overlap_blocked", !overlap.ok && /overlapping|ERP_INVALID/i.test(overlap.out), overlap.out);

// Fixture expense inside period (posted) — used for protect / payment exception
const expId = sql(
  `select public.erp_save_expense_document('${JSON.stringify({
    expense_category: "rent",
    description: `9H rent ${runId}`,
    transaction_date: midDay,
    invoice_date: midDay,
    net_amount: 5000000,
    tax_rate: 10,
    vat_amount: 500000,
    gross_amount: 5500000,
    vat_deduction_status: "pending",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`update erp_expense_documents set recognition_date='${midDay}', payment_due_date='${payDay}' where id='${expId}'`);
sql(`select public.erp_post_expense_document('${expId}'::uuid, '${actor}')`);
check("fixture_exp_posted", sql(`select status from erp_expense_documents where id='${expId}'`) === "posted", "posted");

// Independent VAT settlement row (if table exists) — status must survive financial close
let vatId = null;
const vatExists = sql(`select to_regclass('public.erp_vat_settlements') is not null`);
if (vatExists === "t") {
  vatId = sql(
    `insert into erp_vat_settlements (period_kind, period_start, period_end, settlement_status, output_vat, total_input_vat, vat_payable)
     values ('monthly','${pStart}'::date,'${pEnd}'::date,'calculated',100,20,80)
     returning id`,
  );
}

// --- 9H-B checklist + close ---
const checklist = JSON.parse(sql(`select public.erp_period_close_checklist('${periodId}'::uuid)::text`));
check("9h_b_checklist_can_close", checklist.can_close === true, JSON.stringify(checklist.blocking_error_count));
check(
  "9h_b_vat_info_present",
  (checklist.checks || []).some((c) => c.check_code === "vat_period_independent"),
  "vat_period_independent",
);

const closeRes = JSON.parse(
  sql(
    `select public.erp_period_close('${periodId}'::uuid, '${actor}', true, 'ack warnings for 9H test')::text`,
  ),
);
check("9h_b_closed", closeRes.ok === true, JSON.stringify(closeRes));
check("9h_b_status_closed", sql(`select status from erp_financial_periods where id='${periodId}'`) === "closed", "closed");
const snapCount = Number(sql(`select count(*)::text from erp_period_snapshots where period_id='${periodId}'`));
check("9h_b_snapshots", snapCount >= 8, String(snapCount));
const checkRows = Number(sql(`select count(*)::text from erp_period_close_checks where period_id='${periodId}'`));
check("9h_b_checks_persisted", checkRows >= 5, String(checkRows));

const snapImmut = sqlOk(`update erp_period_snapshots set data_completeness='hacked' where period_id='${periodId}'`);
check("9h_b_snapshot_immutable", !snapImmut.ok && /immutable|LOCKED|ERP_/i.test(snapImmut.out), snapImmut.out);

// --- 9H-C historical protection ---
const blockAmt = sqlOk(
  `update erp_expense_documents set net_amount = net_amount + 1 where id='${expId}'`,
);
check("9h_c_amount_blocked", !blockAmt.ok && /PERIOD_CLOSED|ERP_/i.test(blockAmt.out), blockAmt.out);

const blockNew = sqlOk(
  `insert into erp_expense_documents (expense_category, description, transaction_date, recognition_date, net_amount, vat_amount, gross_amount, status)
   values ('rent','blocked','${midDay2}'::date,'${midDay2}'::date,1,0,1,'draft')`,
);
check("9h_c_insert_blocked", !blockNew.ok && /PERIOD_CLOSED|ERP_/i.test(blockNew.out), blockNew.out);

const payOk = sqlOk(
  `update erp_expense_documents set payment_status='partially_paid', amount_paid=1000, payment_date='${payDay}'::date where id='${expId}'`,
);
check("9h_c_payment_fields_allowed", payOk.ok, payOk.out);

if (vatId) {
  const vatBefore = sql(`select settlement_status from erp_vat_settlements where id='${vatId}'`);
  check("9h_c_vat_independent_status", vatBefore === "calculated", vatBefore);
}

// --- 9H-D reopen + correction ---
const reopenFail = sqlOk(`select public.erp_period_reopen('${periodId}'::uuid, '${actor}', '')`);
check("9h_d_reopen_reason_required", !reopenFail.ok, reopenFail.out);

sql(`select public.erp_period_reopen('${periodId}'::uuid, '${actor}', 'fix COGS / correction test ${runId}')`);
check("9h_d_reopened", sql(`select status from erp_financial_periods where id='${periodId}'`) === "reopened", "reopened");

const nextOpen = sql(
  `select public.erp_financial_period_save('${JSON.stringify({
    period_start: p2Start,
    period_end: p2End,
    period_name: `${y}-${mm2}-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);

const corrClosedFail = sqlOk(
  `select public.erp_financial_correction_save('${JSON.stringify({
    correction_kind: "expense",
    original_period_id: periodId,
    recognition_period_id: periodId,
    adjustment_amount: 100,
    adjustment_reason: "into closed",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
// period is reopened now — into same period should work. Re-close briefly to test closed rejection:
sql(
  `select public.erp_period_close('${periodId}'::uuid, '${actor}', true, 'reclose for correction test')::text`,
);
const corrIntoClosed = sqlOk(
  `select public.erp_financial_correction_save('${JSON.stringify({
    correction_kind: "expense",
    original_period_id: periodId,
    recognition_period_id: periodId,
    adjustment_amount: 100,
    adjustment_reason: "into closed again",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("9h_d_corr_into_closed_blocked", !corrIntoClosed.ok && /PERIOD_CLOSED|ERP_/i.test(corrIntoClosed.out), corrIntoClosed.out);

const corrId = sql(
  `select public.erp_financial_correction_save('${JSON.stringify({
    correction_kind: "expense",
    original_document_id: expId,
    original_period_id: periodId,
    recognition_period_id: nextOpen,
    adjustment_amount: -250000,
    adjustment_reason: `correction ${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_financial_correction_post('${corrId}'::uuid, '${actor}')`);
check("9h_d_corr_posted", sql(`select status from erp_financial_corrections where id='${corrId}'`) === "posted", "posted");
check(
  "9h_d_original_untouched",
  Number(sql(`select net_amount::text from erp_expense_documents where id='${expId}'`)) === 5000000,
  "net still 5m",
);

// Snapshots from first close still present after reopen/reclose
const snapsKeep = Number(sql(`select count(*)::text from erp_period_snapshots where period_id='${periodId}'`));
check("9h_d_snapshots_kept", snapsKeep >= 8, String(snapsKeep));

// --- 9H-E audit ---
const auditClose = Number(
  sql(`select count(*)::text from erp_audit_log where entity='financial_period' and entity_id='${periodId}' and action='close'`),
);
const auditReopen = Number(
  sql(`select count(*)::text from erp_audit_log where entity='financial_period' and entity_id='${periodId}' and action='reopen'`),
);
const auditCorr = Number(
  sql(`select count(*)::text from erp_audit_log where entity='financial_correction' and entity_id='${corrId}'`),
);
check("9h_e_audit_close", auditClose >= 1, String(auditClose));
check("9h_e_audit_reopen", auditReopen >= 1, String(auditReopen));
check("9h_e_audit_correction", auditCorr >= 1, String(auditCorr));

const auditUpd = sqlOk(`update erp_audit_log set reason='hack' where entity_id='${periodId}'`);
check("9h_e_audit_immutable", !auditUpd.ok && /FORBIDDEN|immutable|ERP_/i.test(auditUpd.out), auditUpd.out);

const loadParts = JSON.parse(
  sql(`select public.erp_load_state('financialPeriods,periodSnapshots,financialCorrections,auditLog')::text`),
);
check("9h_e_load_state_periods", Array.isArray(loadParts.financialPeriods) && loadParts.financialPeriods.length > 0, "periods");
check("9h_e_load_state_audit", Array.isArray(loadParts.auditLog), "audit");

// cleanup vat fixture if created
if (vatId) {
  sqlOk(`delete from erp_vat_settlements where id='${vatId}'`);
}

const outDir = join("docs", "screenshots", "phase9h");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "test-results.json"), JSON.stringify({ ok: true, runId, periodId, results }, null, 2));
console.log(JSON.stringify({ ok: true, passed: results.length, periodId, runId }));
