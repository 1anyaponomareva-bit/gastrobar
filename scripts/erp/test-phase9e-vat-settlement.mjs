/**
 * Phase 9E local Free-path tests — VAT Settlement.
 * NOT production. Test data only. Cases A–D + key scenarios.
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
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 3500));
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
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 4000)}`);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

if (sql("select to_regclass('public.erp_vat_settlements')") === "") {
  sqlFile("supabase/migrations/20261127120000_erp_r3_vat_settlement.sql");
}
sqlFile("supabase/migrations/20261127121000_erp_r3_vat_settlement_rpcs.sql");

const actor = "phase9e-test";
const runId = Date.now().toString(36);
// Unique far-future months so re-runs never collide with unique period index
const yBase = 2100 + (Date.now() % 50);
function ym(m) {
  const month = ((m - 1) % 12) + 1;
  const y = yBase + Math.floor((m - 1) / 12);
  const start = `${y}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(y, month, 0).getDate();
  const end = `${y}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}
const pA = ym(1);
const pB = ym(2);
const pUse = ym(3);
const pOver = ym(4);
const pWarn = ym(5);
const pQ = { start: `${yBase}-07-01`, end: `${yBase}-09-30` };

check("tables_exist", sql("select to_regclass('public.erp_vat_settlements')") === "erp_vat_settlements", "settlements");
check("cf_table", sql("select to_regclass('public.erp_vat_carryforwards')") === "erp_vat_carryforwards", "cf");
check("pay_table", sql("select to_regclass('public.erp_vat_payments')") === "erp_vat_payments", "pay");
check("alloc_table", sql("select to_regclass('public.erp_vat_payment_allocations')") === "erp_vat_payment_allocations", "alloc");
check("corr_table", sql("select to_regclass('public.erp_vat_period_corrections')") === "erp_vat_period_corrections", "corr");
check(
  "rpc_compute",
  sql("select to_regprocedure('public.erp_vat_settlement_compute(numeric,numeric,numeric,numeric,numeric,numeric)')") !== "",
  "compute",
);

// --- Case A: VAT Payable ---
const caseA = JSON.parse(
  sql(`select public.erp_vat_settlement_compute(32000000, 18000000, 6000000, 0, 0, 2000000)::text`),
);
check("case_a_payable", Number(caseA.vat_payable) === 12000000, JSON.stringify(caseA));
check("case_a_pending_excluded", Number(caseA.pending_input_vat) === 6000000 && Number(caseA.vat_payable) === 12000000, "pending not in deductible");
check("case_a_cf_applied", Number(caseA.applied_carryforward) === 2000000, String(caseA.applied_carryforward));

// --- Case B: Carryforward ---
const caseB = JSON.parse(sql(`select public.erp_vat_settlement_compute(10000000, 15000000, 0, 0, 0, 0)::text`));
check("case_b_payable_zero", Number(caseB.vat_payable) === 0, JSON.stringify(caseB));
check("case_b_potential_cf", Number(caseB.potential_carryforward) === 5000000, String(caseB.potential_carryforward));

// --- Case C: Partial deduction ---
const caseC = JSON.parse(sql(`select public.erp_vat_settlement_compute(1000000, 65000, 0, 65000, 0, 0)::text`));
check("case_c_deductible", Number(caseC.deductible_input_vat) === 65000, String(caseC.deductible_input_vat));
check("case_c_nonded", Number(caseC.non_deductible_input_vat) === 65000, String(caseC.non_deductible_input_vat));
check("case_c_payable", Number(caseC.vat_payable) === 935000, String(caseC.vat_payable));
check("case_c_nonded_excluded", Number(caseC.vat_payable) === 1000000 - 65000, "nonded not subtracted");

// Opening CF requires confirmed
const openFail = sqlOk(
  `select public.erp_vat_carryforward_opening('{"opening_amount":2000000}'::jsonb, '${actor}')`,
);
check("opening_cf_requires_confirmed", !openFail.ok, openFail.out.slice(0, 200));

const cfOpen = sql(
  `select public.erp_vat_carryforward_opening('${JSON.stringify({
    opening_amount: 2000000,
    confirmed: true,
    notes: `phase9e-${runId}-opening`,
    source_period_start: "2025-01-01",
    source_period_end: "2025-12-31",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("opening_cf_ok", Boolean(cfOpen), cfOpen);

// Case A settlement save (manual amounts, final)
const sidA = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "monthly",
    period_start: pA.start,
    period_end: pA.end,
    use_manual_amounts: true,
    is_final: true,
    warnings: [],
    output_vat: 32000000,
    deductible_input_vat: 18000000,
    pending_input_vat: 6000000,
    non_deductible_input_vat: 0,
    vat_adjustments: 0,
    opening_carryforward: 2000000,
    notes: `caseA-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("save_case_a", Boolean(sidA), sidA);
const rowA = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidA}'`));
check("save_case_a_payable", Number(rowA.vat_payable) === 12000000, JSON.stringify({ p: rowA.vat_payable, o: rowA.outstanding_liability }));
check("save_case_a_status", rowA.settlement_status === "calculated", rowA.settlement_status);

// Approve A (consumes CF)
sql(`select public.erp_vat_settlement_approve('${sidA}'::uuid, '${actor}', false)`);
const rowA2 = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidA}'`));
check("approve_a", rowA2.settlement_status === "approved", rowA2.settlement_status);
check("approve_snapshot", rowA2.snapshot && rowA2.snapshot.frozen_vat_payable != null, JSON.stringify(rowA2.snapshot?.frozen_vat_payable));

const cfAfter = JSON.parse(
  sql(`select to_jsonb(c)::text from public.erp_vat_carryforwards c where id='${cfOpen}'`),
);
check("cf_consumed", Number(cfAfter.remaining_amount) === 0 && cfAfter.approval_status === "exhausted", JSON.stringify(cfAfter));

// Locked against rewrite
const lockFail = sqlOk(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    id: sidA,
    period_kind: "monthly",
    period_start: pA.start,
    period_end: pA.end,
    use_manual_amounts: true,
    is_final: true,
    output_vat: 1,
    deductible_input_vat: 0,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("approved_locked", !lockFail.ok, lockFail.out.slice(0, 200));

// Case B settlement → potential CF
const sidB = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "monthly",
    period_start: pB.start,
    period_end: pB.end,
    use_manual_amounts: true,
    is_final: true,
    warnings: [],
    output_vat: 10000000,
    deductible_input_vat: 15000000,
    pending_input_vat: 0,
    non_deductible_input_vat: 0,
    vat_adjustments: 0,
    opening_carryforward: 0,
    notes: `caseB-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_vat_settlement_approve('${sidB}'::uuid, '${actor}', false)`);
const rowB = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidB}'`));
check("case_b_approved_payable", Number(rowB.vat_payable) === 0, String(rowB.vat_payable));
check("case_b_approved_potential", Number(rowB.potential_carryforward) === 5000000, String(rowB.potential_carryforward));
const cfGen = sql(
  `select id::text from public.erp_vat_carryforwards where source_settlement_id='${sidB}' and remaining_amount=5000000 limit 1`,
);
check("case_b_cf_generated", Boolean(cfGen), cfGen);

// Double-use protection: try approve another settlement needing same CF after exhaustion of first opening —
// Use remaining CF from case B for a new period, then try over-apply
const sidUseCf = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "monthly",
    period_start: pUse.start,
    period_end: pUse.end,
    use_manual_amounts: true,
    is_final: true,
    warnings: [],
    output_vat: 8000000,
    deductible_input_vat: 1000000,
    opening_carryforward: 5000000,
    notes: `useCf-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_vat_settlement_approve('${sidUseCf}'::uuid, '${actor}', false)`);
const cfGen2 = JSON.parse(sql(`select to_jsonb(c)::text from public.erp_vat_carryforwards c where id='${cfGen}'`));
check("cf_no_double_use_remaining_zero", Number(cfGen2.remaining_amount) === 0, JSON.stringify(cfGen2));

const sidOver = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "monthly",
    period_start: pOver.start,
    period_end: pOver.end,
    use_manual_amounts: true,
    is_final: true,
    warnings: [],
    output_vat: 5000000,
    deductible_input_vat: 0,
    opening_carryforward: 1000000,
    notes: `overCf-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const overFail = sqlOk(`select public.erp_vat_settlement_approve('${sidOver}'::uuid, '${actor}', false)`);
check("cf_insufficient_blocked", !overFail.ok, overFail.out.slice(0, 200));

// Case D — partial payment
const payId = sql(
  `select public.erp_vat_payment_save('${JSON.stringify({
    payment_key: `vatpay:${runId}:partial`,
    payment_date: pB.start,
    amount: 8000000,
    payment_reference: `REF-${runId}`,
    allocations: [{ settlement_id: sidA, allocated_amount: 8000000 }],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("payment_save", Boolean(payId), payId);
sql(`select public.erp_vat_payment_post('${payId}'::uuid, '${actor}')`);
const rowPay = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidA}'`));
check("case_d_outstanding", Number(rowPay.outstanding_liability) === 4000000, JSON.stringify({ paid: rowPay.vat_paid, out: rowPay.outstanding_liability, ps: rowPay.payment_status }));
check("case_d_partial_status", rowPay.payment_status === "partially_paid", rowPay.payment_status);

// Idempotent re-post
sql(`select public.erp_vat_payment_post('${payId}'::uuid, '${actor}')`);
const rowPay2 = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidA}'`));
check("repost_no_double", Number(rowPay2.vat_paid) === 8000000, String(rowPay2.vat_paid));

// Duplicate payment_key returns same id
const payId2 = sql(
  `select public.erp_vat_payment_save('${JSON.stringify({
    payment_key: `vatpay:${runId}:partial`,
    payment_date: pB.start,
    amount: 8000000,
    allocations: [],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("payment_key_idempotent", payId2 === payId, `${payId2} vs ${payId}`);

// Full pay remaining
const payFull = sql(
  `select public.erp_vat_payment_save('${JSON.stringify({
    payment_key: `vatpay:${runId}:full`,
    payment_date: pUse.start,
    amount: 4000000,
    allocations: [{ settlement_id: sidA, allocated_amount: 4000000 }],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_vat_payment_post('${payFull}'::uuid, '${actor}')`);
const rowFull = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidA}'`));
check("full_paid", rowFull.payment_status === "paid" && Number(rowFull.outstanding_liability) === 0, JSON.stringify(rowFull.payment_status));

// Quarterly period
const sidQ = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "quarterly",
    period_start: pQ.start,
    period_end: pQ.end,
    use_manual_amounts: true,
    is_final: true,
    warnings: [],
    output_vat: 1000000,
    deductible_input_vat: 65000,
    non_deductible_input_vat: 65000,
    notes: `caseCq-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const rowQ = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidQ}'`));
check("quarterly_period", rowQ.period_kind === "quarterly" && Number(rowQ.vat_payable) === 935000, JSON.stringify(rowQ));

// Incomplete data → not final, approve blocked without force
const sidWarn = sql(
  `select public.erp_vat_settlement_save('${JSON.stringify({
    period_kind: "monthly",
    period_start: pWarn.start,
    period_end: pWarn.end,
    use_manual_amounts: true,
    is_final: false,
    warnings: [{ code: "pending_input_vat", amount: 1000 }],
    output_vat: 100000,
    deductible_input_vat: 10000,
    pending_input_vat: 1000,
    notes: `warn-${runId}`,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const warnRow = JSON.parse(sql(`select to_jsonb(s)::text from public.erp_vat_settlements s where id='${sidWarn}'`));
check("incomplete_not_final", warnRow.is_final === false, String(warnRow.is_final));
const forceFail = sqlOk(`select public.erp_vat_settlement_approve('${sidWarn}'::uuid, '${actor}', false)`);
check("approve_incomplete_blocked", !forceFail.ok, forceFail.out.slice(0, 200));
sql(`select public.erp_vat_settlement_approve('${sidWarn}'::uuid, '${actor}', true)`);
check("approve_force_ok", sql(`select settlement_status from public.erp_vat_settlements where id='${sidWarn}'`) === "approved", "forced");

// Period correction (does not rewrite approved)
const corr = sql(
  `select public.erp_vat_period_correction_save('${JSON.stringify({
    original_period_start: pA.start,
    original_period_end: pA.end,
    recognition_period_start: pWarn.start,
    recognition_period_end: pWarn.end,
    original_settlement_id: sidA,
    original_document_ref: `DOC-${runId}`,
    adjustment_amount: -500000,
    adjustment_reason: "prior period correction test",
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("period_correction", Boolean(corr), corr);
const stillA = sql(`select settlement_status from public.erp_vat_settlements where id='${sidA}'`);
check("correction_no_rewrite", stillA === "approved", stillA);

// Collect from registers (smoke — may have warnings)
const collect = JSON.parse(sql(`select public.erp_vat_settlement_collect('2026-10-01'::date,'2026-10-31'::date,null)::text`));
check("collect_has_formula", collect.rule_ref === "erp_vat_settlement_compute@9e", JSON.stringify(collect.rule_ref));
check("collect_pending_field", collect.pending_input_vat != null, String(collect.pending_input_vat));
check("collect_no_forecast_key", !("forecast_vat" in collect) && !("predicted_vat" in collect), "no forecast");

// Export
const exp = JSON.parse(sql(`select public.erp_vat_settlement_export('${sidA}'::uuid)::text`));
check("export_disclaimer", /not an official/i.test(exp.disclaimer || ""), exp.disclaimer);
check("export_lines", Array.isArray(exp.lines) && exp.lines.length > 0, String(exp.lines?.length));

// Settings period kind default
const pk = sql(`select vat_settlement_period_kind from public.erp_settings where id=1`);
check("period_kind_accountant_tbd", pk === "accountant_tbd" || pk === "monthly" || pk === "quarterly", pk);

// RLS: service_role grants exist (table privileged)
check(
  "rls_enabled",
  sql(`select relrowsecurity::text from pg_class where relname='erp_vat_settlements'`) === "true",
  "rls",
);

// Regression presence 9B/9C/9D
check("reg_9b_sales", sql("select to_regclass('public.erp_sales_documents')") === "erp_sales_documents", "9b");
check("reg_9c_input", sql("select to_regprocedure('public.erp_input_vat_register(date,date,uuid,text,text,text,uuid,numeric,text)')") !== "" || sql("select count(*)::text from pg_proc where proname='erp_input_vat_register'") !== "0", "9c");
check("reg_9d_plat", sql("select to_regclass('public.erp_platform_settlements')") === "erp_platform_settlements", "9d");
check("reg_r2_adj", sql("select to_regclass('public.erp_vat_cost_adjustments')") === "erp_vat_cost_adjustments", "r2");

// load_state parts
const ls = JSON.parse(sql(`select public.erp_load_state('vatSettlements,vatCarryforwards,vatPayments,vatPeriodCorrections')::text`));
check("load_state_settlements", Array.isArray(ls.vatSettlements), String(ls.vatSettlements?.length));
check("load_state_cf", Array.isArray(ls.vatCarryforwards), String(ls.vatCarryforwards?.length));
check("load_state_pay", Array.isArray(ls.vatPayments), String(ls.vatPayments?.length));

const outDir = join("docs", "assets", "phase9e");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "r3-phase9e-test-results.json");
writeFileSync(outPath, JSON.stringify({ runId, results, caseA, caseB, caseC, sidA, sidB }, null, 2));
console.log(JSON.stringify({ ok: true, outPath, passed: results.length }));
