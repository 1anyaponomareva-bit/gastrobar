import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
function sql(q) {
  const r = spawnSync(
    psql,
    ["-h", env.SUPABASE_DB_HOST, "-p", env.SUPABASE_DB_PORT || "5432", "-U", env.SUPABASE_DB_USER, "-d", env.SUPABASE_DB_NAME || "postgres", "-t", "-A", "-c", q],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: env.SUPABASE_DB_PASSWORD }, timeout: 60000 },
  );
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "").slice(0, 800));
  return (r.stdout || "").trim();
}

const out = {
  checked_at: new Date().toISOString(),
  auto_consume: sql("select sales_auto_consume_stock::text from erp_settings where id=1"),
  expense_auto: sql("select coalesce(expense_auto_allocate::text,'') from erp_settings where id=1"),
  periods: sql("select to_regclass('public.erp_financial_periods') is not null"),
  sales: sql("select to_regclass('public.erp_sales_documents') is not null"),
  audit_immut_triggers: sql("select count(*)::text from pg_trigger where tgname in ('erp_audit_log_no_upd','erp_audit_log_no_del')"),
  snap_immut_triggers: sql("select count(*)::text from pg_trigger where tgname in ('erp_period_snapshots_no_upd','erp_period_snapshots_no_del')"),
  period_protect_triggers: sql("select count(*)::text from pg_trigger where tgname like 'erp_period_protect%'"),
  cit_status: sql("select coalesce(cit_status::text,'') from erp_settings where id=1"),
  products: sql("select count(*)::text from erp_products"),
  lots: sql("select count(*)::text from erp_lots"),
  tax_rates: sql("select count(*)::text from erp_tax_rates"),
  auth_users: sql("select count(*)::text from auth.users"),
};
mkdirSync(join("docs", "screenshots", "phase10h"), { recursive: true });
writeFileSync(join("docs", "screenshots", "phase10h", "prod-smoke-db.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
