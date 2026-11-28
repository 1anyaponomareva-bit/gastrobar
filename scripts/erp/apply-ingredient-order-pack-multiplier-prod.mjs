/**
 * Ingredient order_pack_* as weight multiplier in Prep Stock / Orders catalog.
 * Usage: APPLY_INGREDIENT_ORDER_PACK_MULT=YES node scripts/erp/apply-ingredient-order-pack-multiplier-prod.mjs
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

if (process.env.APPLY_INGREDIENT_ORDER_PACK_MULT !== "YES") {
  console.error("Refusing: set APPLY_INGREDIENT_ORDER_PACK_MULT=YES");
  process.exit(2);
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "postgres").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const migration = "supabase/migrations/20261128190000_erp_ingredient_order_pack_multiplier.sql";

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
    `select x->>'name_en' || '|' || coalesce(x->>'purchase_pack_label','') || '|' || coalesce(x->>'purchase_qty_base','') || '|' || coalesce(x->>'purchase_unit','')
       from jsonb_array_elements(public.erp_prep_stock_catalog()) x
      where x->>'name_en' ilike 'bacon%';`,
  ],
  { encoding: "utf8", env: runEnv, timeout: 60000 },
);
console.log(JSON.stringify({ ok: check.status === 0, bacon: (check.stdout || "").trim(), applied: migration }, null, 2));
if (check.status !== 0) process.exit(1);
