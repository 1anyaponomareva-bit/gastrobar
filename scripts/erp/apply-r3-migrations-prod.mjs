/**
 * Phase 10H — apply Release 3 migrations to production (Free Path).
 * Secrets from gitignored .env.db.local only. Never logs password.
 *
 * Usage: node scripts/erp/apply-r3-migrations-prod.mjs
 * Requires: APPLY_R3_PROD=YES
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

function loadEnvFile(path) {
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

if (process.env.APPLY_R3_PROD !== "YES") {
  console.error("Refusing: set APPLY_R3_PROD=YES");
  process.exit(2);
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "postgres").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";

if (!password || !host) {
  console.error("MISSING: SUPABASE_DB_PASSWORD / SUPABASE_DB_HOST in .env.db.local");
  process.exit(2);
}

const runEnv = { ...process.env, PGPASSWORD: password };

function sql(q) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: runEnv,
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 4000));
  return (r.stdout || "").trim();
}

function sqlFile(path) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], {
    encoding: "utf8",
    env: runEnv,
    timeout: 300000,
  });
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 5000)}`);
  return (r.stdout || "").trim();
}

const migrations = [
  "supabase/migrations/20261127090000_erp_r3_sales_output_vat.sql",
  "supabase/migrations/20261127091000_erp_r3_sales_rpcs.sql",
  "supabase/migrations/20261127100000_erp_r3_input_vat_register.sql",
  "supabase/migrations/20261127101000_erp_r3_input_vat_rpcs.sql",
  "supabase/migrations/20261127110000_erp_r3_platform_settlements.sql",
  "supabase/migrations/20261127111000_erp_r3_platform_rpcs.sql",
  "supabase/migrations/20261127120000_erp_r3_vat_settlement.sql",
  "supabase/migrations/20261127121000_erp_r3_vat_settlement_rpcs.sql",
  "supabase/migrations/20261127130000_erp_r3_sales_bom_cogs.sql",
  "supabase/migrations/20261127131000_erp_r3_sales_bom_cogs_rpcs.sql",
  "supabase/migrations/20261127132000_erp_r3_profitability_rpcs.sql",
  "supabase/migrations/20261127140000_erp_r3_opex_assets_pnl.sql",
  "supabase/migrations/20261127141000_erp_r3_opex_pnl_rpcs.sql",
  "supabase/migrations/20261127150000_erp_r3_financial_periods.sql",
  "supabase/migrations/20261127151000_erp_r3_financial_periods_rpcs.sql",
];

function baseline() {
  return {
    products: Number(sql("select count(*)::text from public.erp_products")),
    recipes: Number(sql("select count(*)::text from public.erp_recipes")),
    dishes: Number(sql("select count(*)::text from public.erp_dishes")),
    suppliers: Number(sql("select count(*)::text from public.erp_suppliers")),
    lots: Number(sql("select count(*)::text from public.erp_lots")),
    stock: Number(sql("select count(*)::text from public.erp_stock")),
    docs: Number(sql("select count(*)::text from public.erp_documents")),
    finance_tx: Number(sql("select count(*)::text from public.erp_finance_transactions")),
    tax_rates: Number(sql("select count(*)::text from public.erp_tax_rates")),
    auth_users: Number(sql("select count(*)::text from auth.users")),
    sales_docs_exists: sql("select to_regclass('public.erp_sales_documents') is not null"),
    periods_exists: sql("select to_regclass('public.erp_financial_periods') is not null"),
    auto_consume: sql("select coalesce(sales_auto_consume_stock::text,'') from public.erp_settings where id=1"),
  };
}

console.log(JSON.stringify({ action: "prod_migrate_start", host, port, user, db, migrations: migrations.length }, null, 2));

const before = baseline();
console.log(JSON.stringify({ before }, null, 2));

const applied = [];
for (const m of migrations) {
  if (!existsSync(m)) throw new Error("missing " + m);
  console.log(JSON.stringify({ applying: m }));
  sqlFile(m);
  applied.push({ file: m, status: "applied" });
}

const after = baseline();
const preserve = {};
for (const k of ["products", "recipes", "dishes", "suppliers", "lots", "stock", "docs", "finance_tx", "tax_rates", "auth_users"]) {
  preserve[k] = { before: before[k], after: after[k], ok: before[k] === after[k] };
}

const checks = {
  sales_table: after.sales_docs_exists === "t" || after.sales_docs_exists === "true",
  periods_table: after.periods_exists === "t" || after.periods_exists === "true",
  auto_consume_off: after.auto_consume === "false" || after.auto_consume === "",
  rpc_period_close: sql("select to_regprocedure('public.erp_period_close(uuid,text,boolean,text)') is not null") === "t" ||
    sql("select to_regprocedure('public.erp_period_close(uuid,text,boolean,text)') is not null") === "true",
  rpc_accrual_pnl: (sql("select to_regprocedure('public.erp_accrual_pnl(date,date,uuid)') is not null") === "t") ||
    (sql("select to_regprocedure('public.erp_accrual_pnl(date,date,uuid)') is not null") === "true"),
  anon_no_close: (() => {
    const v = sql("select has_function_privilege('anon', 'public.erp_period_close(uuid,text,boolean,text)', 'execute')::text");
    return v === "f" || v === "false";
  })(),
  auth_no_close: (() => {
    const v = sql("select has_function_privilege('authenticated', 'public.erp_period_close(uuid,text,boolean,text)', 'execute')::text");
    return v === "f" || v === "false";
  })(),
};

const outDir = join("docs", "screenshots", "phase10h");
mkdirSync(outDir, { recursive: true });
const report = {
  checked_at: new Date().toISOString(),
  host,
  db,
  applied,
  before,
  after,
  preserve,
  checks,
  ok: Object.values(preserve).every((p) => p.ok) && Object.values(checks).every(Boolean),
};
writeFileSync(join(outDir, "prod-migrate-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, applied: applied.length, checks, preserve }, null, 2));
if (!report.ok) process.exit(1);
