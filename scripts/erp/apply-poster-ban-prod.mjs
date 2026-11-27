/**
 * Apply Poster POS sync ban SQL to production (Free Path).
 * Secrets from gitignored .env.db.local only. Never logs password.
 *
 * Usage: APPLY_POSTER_BAN_PROD=YES node scripts/erp/apply-poster-ban-prod.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

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

if (process.env.APPLY_POSTER_BAN_PROD !== "YES") {
  console.error("Refusing: set APPLY_POSTER_BAN_PROD=YES");
  process.exit(2);
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "postgres").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const migration = "supabase/migrations/20261127160000_erp_r3_poster_erp_sync_forbidden.sql";

if (!password || !host) {
  console.error("MISSING: SUPABASE_DB_PASSWORD / SUPABASE_DB_HOST in .env.db.local");
  process.exit(2);
}
if (!existsSync(migration)) {
  console.error("MISSING migration", migration);
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

const before = {
  products: Number(sql("select count(*)::text from public.erp_products")),
  sales: Number(sql("select count(*)::text from public.erp_sales_documents")),
  poster_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='poster'")),
  grab_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='grab'")),
  manual_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='manual'")),
  auto_consume: sql("select coalesce(sales_auto_consume_stock::text,'') from public.erp_settings where id=1"),
};

console.log(JSON.stringify({ action: "poster_ban_prod_start", host, db, migration, before }, null, 2));
sqlFile(migration);

const after = {
  products: Number(sql("select count(*)::text from public.erp_products")),
  sales: Number(sql("select count(*)::text from public.erp_sales_documents")),
  poster_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='poster'")),
  grab_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='grab'")),
  manual_sales: Number(sql("select count(*)::text from public.erp_sales_documents where source_system='manual'")),
  auto_consume: sql("select coalesce(sales_auto_consume_stock::text,'') from public.erp_settings where id=1"),
  assert_fn: sql("select to_regprocedure('public.erp_assert_poster_erp_sync_forbidden(text)') is not null"),
  is_fn: sql("select to_regprocedure('public.erp_is_poster_erp_source(text)') is not null"),
  triggers: Number(sql(`
    select count(*)::text from pg_trigger
    where tgname in ('erp_poster_sync_forbid_ins','erp_poster_sync_forbid_upd') and not tgisinternal
  `)),
  anon_assert: sql("select has_function_privilege('anon', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text"),
  auth_assert: sql("select has_function_privilege('authenticated', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text"),
  srv_assert: sql("select has_function_privilege('service_role', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text"),
  save_patched: sql(`
    select (position('erp_assert_poster_erp_sync_forbidden(v_source)' in pg_get_functiondef('public.erp_save_sales_document(jsonb,text)'::regprocedure)) > 0)::text
  `),
};

const preserveOk =
  before.products === after.products &&
  before.sales === after.sales &&
  before.poster_sales === after.poster_sales &&
  before.grab_sales === after.grab_sales &&
  before.manual_sales === after.manual_sales;

const isTrue = (x) => x === "t" || x === "true";
const isFalse = (x) => x === "f" || x === "false";

const checks = {
  preserveOk,
  assert_fn: isTrue(after.assert_fn),
  is_fn: isTrue(after.is_fn),
  triggers_ge_6: after.triggers >= 6,
  anon_no_exec: isFalse(after.anon_assert),
  auth_no_exec: isFalse(after.auth_assert),
  service_exec: isTrue(after.srv_assert),
  save_patched: isTrue(after.save_patched),
  auto_consume_off: after.auto_consume === "false" || after.auto_consume === "",
};

const ok = Object.values(checks).every(Boolean);
const outDir = join("docs", "screenshots", "poster-ban");
mkdirSync(outDir, { recursive: true });
const report = { checked_at: new Date().toISOString(), host, db, migration, before, after, checks, ok };
writeFileSync(join(outDir, "prod-apply-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok, checks, after: { sales: after.sales, poster_sales: after.poster_sales, triggers: after.triggers } }, null, 2));
if (!ok) process.exit(1);
