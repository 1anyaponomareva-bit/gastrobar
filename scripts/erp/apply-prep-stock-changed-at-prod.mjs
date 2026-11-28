/**
 * Apply Prep Stock balance changed_at field.
 * Usage: APPLY_PREP_STOCK_CHANGED_AT=YES node scripts/erp/apply-prep-stock-changed-at-prod.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

if (process.env.APPLY_PREP_STOCK_CHANGED_AT !== "YES") {
  console.error("Refusing: set APPLY_PREP_STOCK_CHANGED_AT=YES");
  process.exit(2);
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "postgres").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const migration = "supabase/migrations/20261128200000_erp_prep_stock_balance_changed_at.sql";

if (!password || !host) {
  console.error("MISSING env");
  process.exit(2);
}

const runEnv = { ...process.env, PGPASSWORD: password };
const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", migration], {
  encoding: "utf8",
  env: runEnv,
  timeout: 180000,
});
if (r.status !== 0) {
  console.error((r.stderr || r.stdout || "").slice(0, 4000));
  process.exit(r.status || 1);
}

const check = spawnSync(
  psql,
  [
    "-h",
    host,
    "-p",
    port,
    "-U",
    user,
    "-d",
    db,
    "-t",
    "-A",
    "-c",
    `select (pg_get_functiondef('public.erp_prep_stock_balances()'::regprocedure) like '%changed_at%')::text;`,
  ],
  { encoding: "utf8", env: runEnv, timeout: 60000 },
);
console.log(JSON.stringify({ ok: check.status === 0, check: (check.stdout || "").trim(), applied: migration }, null, 2));
if (check.status !== 0) process.exit(1);
