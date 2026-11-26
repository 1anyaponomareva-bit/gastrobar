/**
 * Phase 9B local Free-path smoke (PostgreSQL copy — NOT production).
 * Env: .env.db.local OR local trust PG via ERP_TEST_PG* vars.
 *
 * Default local: 127.0.0.1:5432 db gastrofood_r2_copy user postgres password postgres
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

const envFile = { ...loadEnv(".env.db.local") };
const useLocal = process.env.ERP_TEST_LOCAL === "1" || process.argv.includes("--local");
const host = useLocal ? "127.0.0.1" : envFile.SUPABASE_DB_HOST || "127.0.0.1";
const port = useLocal ? "5432" : envFile.SUPABASE_DB_PORT || "5432";
const user = useLocal ? "postgres" : envFile.SUPABASE_DB_USER || "postgres";
const db = useLocal ? "gastrofood_r2_copy" : envFile.SUPABASE_DB_NAME || "gastrofood_r2_copy";
const password = useLocal ? "postgres" : envFile.SUPABASE_DB_PASSWORD || "postgres";
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";

function sql(q) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 2000));
  return (r.stdout || "").trim();
}

function sqlFile(path) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 180000,
  });
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 3000)}`);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

// Apply migrations if tables missing
if (sql("select to_regclass('public.erp_sales_documents')") === "") {
  sqlFile("supabase/migrations/20261127090000_erp_r3_sales_output_vat.sql");
  sqlFile("supabase/migrations/20261127091000_erp_r3_sales_rpcs.sql");
}

const actor = "phase9b-test";
const dish = sql("select id from erp_dishes limit 1");
const channel = sql("select id from erp_sales_channels limit 1");
const wh = sql("select id from erp_warehouses limit 1");

// 1) business date after midnight
const bd = sql(`select public.erp_sales_business_date('2026-11-27 02:30:00+07'::timestamptz, (select id from erp_legal_entities limit 1))`);
check("business_date_after_midnight", bd === "2026-11-26", bd);

// 2) draft + post
const payload = JSON.stringify({
  source_system: "manual",
  sales_channel_id: channel || null,
  warehouse_id: wh || null,
  lines: [
    {
      dish_id: dish || null,
      description: "Test dish",
      quantity: 1,
      gross_sales: 108000,
      merchant_funded_discount: 0,
      platform_funded_discount: 0,
    },
  ],
}).replace(/'/g, "''");

const id = sql(`select public.erp_save_sales_document('${payload}'::jsonb, '${actor}')`);
check("save_draft", Boolean(id), id);
sql(`select public.erp_post_sales_document('${id}'::uuid, '${actor}')`);
const status = sql(`select order_status from erp_sales_documents where id='${id}'`);
check("post_sale", status === "posted", status);
const vatAmt = Number(sql(`select output_vat_amount from erp_sales_documents where id='${id}'`));
check("output_vat_snapshot", Number.isFinite(vatAmt) && vatAmt > 0, String(vatAmt));

// 3) idempotent re-post
sql(`select public.erp_post_sales_document('${id}'::uuid, '${actor}')`);
check("repost_idempotent", sql(`select order_status from erp_sales_documents where id='${id}'`) === "posted");

// 4) duplicate source link protection
const ext = "poster-order-9b-1";
const p1 = JSON.stringify({
  source_system: "poster",
  external_order_id: ext,
  account_or_location_key: "spot1",
  sales_channel_id: channel || null,
  lines: [{ description: "A", quantity: 1, gross_sales: 10000 }],
}).replace(/'/g, "''");
const idA = sql(`select public.erp_save_sales_document('${p1}'::jsonb, '${actor}')`);
sql(`select public.erp_post_sales_document('${idA}'::uuid, '${actor}')`);
let dupOk = false;
try {
  sql(`select public.erp_save_sales_document('${p1}'::jsonb, '${actor}')`);
} catch {
  dupOk = true;
}
check("duplicate_poster_blocked", dupOk);

// 5) COGS default pending (no consume)
const cogs = sql(`select public.erp_sales_post_cogs('${id}'::uuid, '${actor}', false)::text`);
check("cogs_pending_default", /pending|auto_consume_disabled/.test(cogs), cogs);
const consumeFlag = sql(`select sales_auto_consume_stock::text from erp_settings where id=1`);
check("auto_consume_flag_false", consumeFlag === "f" || consumeFlag === "false", consumeFlag);

// 6) global rate change does not rewrite posted
const oldVat = sql(`select output_vat_amount::text from erp_sales_documents where id='${id}'`);
sql(`update erp_settings set default_output_vat_rate = 10 where id=1`);
const still = sql(`select output_vat_amount::text from erp_sales_documents where id='${id}'`);
check("posted_vat_frozen", still === oldVat, `${oldVat} vs ${still}`);
sql(`update erp_settings set default_output_vat_rate = 8 where id=1`);

// 7) refund
sql(`select public.erp_refund_sales_document('${id}'::uuid, '${actor}', null, true)`);
check("full_refund", sql(`select order_status from erp_sales_documents where id='${id}'`) === "refunded");

// 8) import stub
const batch = sql(
  `select public.erp_sales_import_stub_validate('grab', '[{"external_id":"g1"}]'::jsonb, '${actor}', 'fixture.json')`,
);
check("import_stub_validated", Boolean(batch), batch);
check(
  "import_stub_not_applied",
  sql(`select status from erp_sales_import_batches where id='${batch}'`) === "validated",
);

// 9) grab october arithmetic fixture (no docs)
const earn = 434140005 - 85240734 - 30349488 - 76347;
check("grab_oct2026_fixture_math", earn === 318473436, String(earn));

const outDir = join(homedir(), "GASTROBAR-backups");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "r3-phase9b-test-results.json");
writeFileSync(outPath, JSON.stringify({ checked_at: new Date().toISOString(), host, db, results }, null, 2));
console.log(JSON.stringify({ ok: true, outPath, results }, null, 2));
