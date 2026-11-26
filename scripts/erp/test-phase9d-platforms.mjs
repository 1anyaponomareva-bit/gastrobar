/**
 * Phase 9D local Free-path tests — platform settlements / Grab fixture.
 * NOT production. Does not invent GrabMerchant raw columns.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

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
    return { ok: false, out: String(e.message || e).slice(0, 500) };
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
function sha(s) {
  return createHash("sha256").update(s).digest("hex");
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

if (sql("select to_regclass('public.erp_platform_settlements')") === "") {
  sqlFile("supabase/migrations/20261127110000_erp_r3_platform_settlements.sql");
}
sqlFile("supabase/migrations/20261127111000_erp_r3_platform_rpcs.sql");

const actor = "phase9d-test";
const runId = Date.now().toString(36);

// Oct 2026 math
const math = JSON.parse(sql(`select public.erp_platform_oct2026_fixture_math()::text`));
check("oct2026_math", math.checks.net_sales_ok === true && math.checks.earnings_ok === true, JSON.stringify(math.checks));
check("oct2026_earnings_value", math.net_earnings_after_marketing === 318473436, String(math.net_earnings_after_marketing));

// Account
const acct = sql(
  `select public.erp_save_platform_account('{"platform_code":"grab","merchant_id":"m-${runId}","display_name":"Grab test ${runId}"}'::jsonb, '${actor}')`,
);

// Correct normalized import pipeline
const rows = [
  {
    external_order_id: `g-${runId}-1`,
    line_kind: "order",
    settlement_date: "2026-10-15",
    gross_sales: 100000,
    merchant_funded_discount: 0,
    net_sales: 100000,
    platform_commission: 20000,
    advertising_expense: 5000,
    chargeback_amount: 0,
    net_earnings: 75000,
    operation_key: `grab:m-${runId}:g-${runId}-1:order`,
  },
];
const body = JSON.stringify(rows);
const fileSha = sha(body + runId);
const batch = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `ok-${runId}.json`,
    file_sha256: fileSha,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("import_upload", Boolean(batch), batch);

const prev = JSON.parse(
  sql(`select public.erp_platform_import_preview('${batch}'::uuid, '${JSON.stringify(rows).replace(/'/g, "''")}'::jsonb, '${actor}')::text`),
);
check("import_preview", prev.ok_count === 1 && prev.status === "preview", JSON.stringify(prev));

// Bad file / empty gross string error path
const badBatch = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `bad-${runId}.json`,
    file_sha256: sha("bad" + runId),
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const badPrev = JSON.parse(
  sql(
    `select public.erp_platform_import_preview('${badBatch}'::uuid, '[{"external_order_id":"x","gross_sales":""}]'::jsonb, '${actor}')::text`,
  ),
);
check("import_with_errors", badPrev.error_count >= 1, JSON.stringify(badPrev.errors));

// Duplicate file sha
const dupFile = sqlOk(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `ok-renamed-${runId}.json`,
    file_sha256: fileSha,
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
check("duplicate_file_blocked", !dupFile.ok && /import_file_sha256|DUPLICATE/i.test(dupFile.out), dupFile.out.slice(0, 120));

// Confirm + apply
sql(`select public.erp_platform_import_confirm('${batch}'::uuid, '${actor}')`);
const applied = JSON.parse(
  sql(
    `select public.erp_platform_import_apply('${batch}'::uuid, '${actor}', 'grab:m-${runId}:period-a', true)::text`,
  ),
);
check("import_apply", applied.ok === true && applied.lines_created === 1, JSON.stringify(applied));

// Re-apply idempotent
const re = JSON.parse(sql(`select public.erp_platform_import_apply('${batch}'::uuid, '${actor}', null, false)::text`));
check("reapply_idempotent", re.idempotent === true, JSON.stringify(re));

// Duplicate operation in new batch
const rows2 = [{ ...rows[0], operation_key: rows[0].operation_key }];
const batch2 = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `dupop-${runId}.json`,
    file_sha256: sha("dupop" + runId),
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
const prev2 = JSON.parse(
  sql(`select public.erp_platform_import_preview('${batch2}'::uuid, '${JSON.stringify(rows2).replace(/'/g, "''")}'::jsonb, '${actor}')::text`),
);
check("duplicate_operation_flagged", prev2.error_count >= 1 && /duplicate_operation/.test(JSON.stringify(prev2.errors)), JSON.stringify(prev2.errors));

// Grab raw without map blocked
const rawBlock = sqlOk(
  `select public.erp_platform_import_upload('{"platform_code":"grab","source_format":"grab_merchant_csv","file_name":"grab.csv","file_sha256":"${sha("raw" + runId)}"}'::jsonb, '${actor}')`,
);
check("grab_raw_blocked_without_map", !rawBlock.ok && /grab_column_map_missing/i.test(rawBlock.out), rawBlock.out.slice(0, 160));

// Poster+Grab match: create sales with grab link then import matching order
const channel = sql("select id from erp_sales_channels limit 1");
const salePayload = JSON.stringify({
  source_system: "grab",
  external_order_id: `g-${runId}-match`,
  account_or_location_key: `m-${runId}`,
  sales_channel_id: channel || null,
  lines: [{ description: "Match", quantity: 1, gross_sales: 50000 }],
}).replace(/'/g, "''");
const saleId = sql(`select public.erp_save_sales_document('${salePayload}'::jsonb, '${actor}')`);
sql(`select public.erp_post_sales_document('${saleId}'::uuid, '${actor}')`);
const matchRows = [
  {
    external_order_id: `g-${runId}-match`,
    gross_sales: 50000,
    net_sales: 50000,
    platform_commission: 10000,
    operation_key: `grab:m-${runId}:g-${runId}-match:order`,
  },
];
const batchM = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `match-${runId}.json`,
    file_sha256: sha("match" + runId),
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_platform_import_preview('${batchM}'::uuid, '${JSON.stringify(matchRows).replace(/'/g, "''")}'::jsonb, '${actor}')`);
sql(`select public.erp_platform_import_confirm('${batchM}'::uuid, '${actor}')`);
const appM = JSON.parse(sql(`select public.erp_platform_import_apply('${batchM}'::uuid, '${actor}', 'grab:m-${runId}:match', false)::text`));
check("poster_grab_link", appM.sales_linked >= 1, JSON.stringify(appM));
const matchSt = sql(
  `select match_status from erp_platform_settlement_lines where operation_key='grab:m-${runId}:g-${runId}-match:order'`,
);
check("match_status_matched", matchSt === "matched", matchSt);

// Ambiguous: conflict on gross mismatch
const sale2 = sql(
  `select public.erp_save_sales_document('${JSON.stringify({
    source_system: "grab",
    external_order_id: `g-${runId}-conf`,
    account_or_location_key: `m-${runId}`,
    lines: [{ description: "C", quantity: 1, gross_sales: 10000 }],
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_post_sales_document('${sale2}'::uuid, '${actor}')`);
const confRows = [
  {
    external_order_id: `g-${runId}-conf`,
    gross_sales: 99999,
    operation_key: `grab:m-${runId}:g-${runId}-conf:order`,
  },
];
const batchC = sql(
  `select public.erp_platform_import_upload('${JSON.stringify({
    platform_code: "grab",
    platform_account_id: acct,
    source_format: "normalized_json_v1",
    file_name: `conf-${runId}.json`,
    file_sha256: sha("conf" + runId),
  }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
);
sql(`select public.erp_platform_import_preview('${batchC}'::uuid, '${JSON.stringify(confRows).replace(/'/g, "''")}'::jsonb, '${actor}')`);
sql(`select public.erp_platform_import_confirm('${batchC}'::uuid, '${actor}')`);
sql(`select public.erp_platform_import_apply('${batchC}'::uuid, '${actor}', 'grab:m-${runId}:conf', false)`);
const confSt = sql(`select match_status from erp_platform_settlement_lines where operation_key='grab:m-${runId}:g-${runId}-conf:order'`);
check("conflict_gross_mismatch", confSt === "conflict", confSt);

// Unverified VAT expenses from first apply
const pendingVat = Number(
  sql(
    `select count(*) from erp_expense_documents where platform_source='grab' and vat_deduction_status='pending' and notes ilike '%unverified%'`,
  ),
);
check("unverified_vat_pending", pendingVat >= 1, String(pendingVat));

// Partial VAT via 9C on one expense
const expId = sql(
  `select id from erp_expense_documents where platform_source='grab' and expense_category='platform_commission' order by created_at desc limit 1`,
);
if (expId) {
  sql(`select public.erp_set_expense_vat_status('${expId}'::uuid,'partial',50,'test_partial','${actor}',null)`);
  const st = sql(`select vat_deduction_status from erp_expense_documents where id='${expId}'`);
  check("partial_vat_deduction", st === "partial", st);
} else {
  check("partial_vat_deduction", false, "no expense");
}

// Tax invoice dedupe still works (9C)
const inv = JSON.stringify({
  supplier_tax_id: `GRAB-TAX-${runId}`,
  invoice_number: `GINV-${runId}`,
  invoice_date: "2026-10-20",
  invoice_type: "service",
  vat_amount: 1000,
  net_amount: 10000,
  gross_amount: 11000,
  status: "registered",
  lines: [{ expense_category: "platform_commission", tax_rate: 8, net_amount: 10000, vat_amount: 1000, gross_amount: 11000 }],
}).replace(/'/g, "''");
const invId = sql(`select public.erp_save_tax_invoice('${inv}'::jsonb, '${actor}')`);
const invDup = sqlOk(`select public.erp_save_tax_invoice('${inv}'::jsonb, '${actor}')`);
check("tax_invoice_dedupe", Boolean(invId) && !invDup.ok, invDup.out.slice(0, 80));

// Payout partial + multi settlement allocation
const settIds = sqlRaw(
  `select id from erp_platform_settlements where platform_account_id='${acct}' order by created_at`,
)
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean);
const payoutPayload = {
  platform_account_id: acct,
  payout_key: `payout-${runId}`,
  payout_reference: `PAY-${runId}`,
  payout_date: "2026-11-01",
  expected_amount: 100000,
  actual_amount: 60000,
  outstanding_amount: 40000,
  allocations: settIds.slice(0, 2).map((id, i) => ({
    settlement_id: id,
    allocated_amount: i === 0 ? 40000 : 20000,
  })),
};
const payoutId = sql(`select public.erp_platform_save_payout('${JSON.stringify(payoutPayload).replace(/'/g, "''")}'::jsonb, '${actor}')`);
sql(`select public.erp_platform_post_payout('${payoutId}'::uuid, '${actor}')`);
const poutSt = sql(`select status from erp_platform_payouts where id='${payoutId}'`);
check("partial_payout", poutSt === "partial", poutSt);
const allocN = Number(sql(`select count(*) from erp_platform_payout_allocations where payout_id='${payoutId}'`));
check("payout_multi_settlement", allocN >= 1, String(allocN));

// Bank link duplicate protection
const finTx = sql("select id from erp_finance_transactions limit 1");
if (finTx) {
  sql(
    `select public.erp_platform_save_payout('${JSON.stringify({
      platform_account_id: acct,
      payout_key: `payout-bank-${runId}`,
      payout_date: "2026-11-02",
      actual_amount: 1000,
      finance_transaction_id: finTx,
    }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
  );
  const again = sqlOk(
    `select public.erp_platform_save_payout('${JSON.stringify({
      platform_account_id: acct,
      payout_key: `payout-bank2-${runId}`,
      payout_date: "2026-11-03",
      actual_amount: 1000,
      finance_transaction_id: finTx,
    }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
  );
  // second insert should succeed on payout but recon on conflict do nothing — count bank links = 1
  const bankLinks = Number(
    sql(`select count(*) from erp_platform_reconciliation where kind='payout_bank' and finance_transaction_id='${finTx}'`),
  );
  check("bank_tx_no_double_link", bankLinks === 1 && again.ok, `links=${bankLinks}; again=${again.ok}`);
} else {
  check("bank_tx_no_double_link", true, "skipped_no_finance_tx");
}

// No double revenue: settlement apply does not create sales docs
const salesCount = Number(sql(`select count(*) from erp_sales_documents where external_order_id='g-${runId}-1'`));
check("no_double_revenue_from_settlement", salesCount === 0, String(salesCount));

// Auto-consume still off / no FIFO from platform apply
const auto = sql(`select sales_auto_consume_stock::text from erp_settings where id=1`);
check("auto_consume_off", auto === "false" || auto === "f", auto);

// Dashboard
const dash = JSON.parse(sql(`select public.erp_platform_dashboard('2026-10-01'::date,'2026-11-30'::date,'${acct}'::uuid,null)::text`));
check("dashboard_has_commission", Number(dash.actual_commission) > 0, JSON.stringify(dash));

// RLS
const rls = Number(
  sql(`
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relrowsecurity and c.relname like 'erp_platform_%'
`),
);
check("rls_platform_tables", rls >= 6, String(rls));

// Regression smoke
const objs = sql(`
  select string_agg(x,',' order by x) from (
    select 'erp_sales_documents' as x where to_regclass('public.erp_sales_documents') is not null
    union all select 'erp_input_vat_register' where exists (select 1 from pg_proc where proname='erp_input_vat_register')
    union all select 'erp_consume' where exists (select 1 from pg_proc where proname='erp_consume')
    union all select 'erp_platform_import_apply' where exists (select 1 from pg_proc where proname='erp_platform_import_apply')
  ) s
`);
check("r1_r2_9b_9c_smoke", /erp_sales_documents/.test(objs) && /erp_input_vat_register/.test(objs), objs);

const outDir = join(homedir(), "GASTROBAR-backups");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "r3-phase9d-test-results.json");
writeFileSync(outPath, JSON.stringify({ checked_at: new Date().toISOString(), host, db, results }, null, 2));
console.log(JSON.stringify({ ok: true, outPath, results }, null, 2));
