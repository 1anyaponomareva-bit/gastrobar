/**
 * Phase 10E — restore fresh prod dump to local PG, baseline, apply R3 migrations, compare.
 * Free Path only. Never touches production.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const pgRestore = process.env.PG_RESTORE_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe";
const host = "127.0.0.1";
const port = "5432";
const user = "postgres";
const password = "postgres";
const targetDb = "gastrofood_r3_phase10";
const env = { ...process.env, PGPASSWORD: password };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env, timeout: opts.timeout || 300000, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}\n${(r.stderr || r.stdout || "").slice(0, 4000)}`);
  return (r.stdout || "").trim();
}
function sql(db, q) {
  return run(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q]);
}
function sqlFile(db, path) {
  return run(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], { timeout: 300000 });
}

const backups = join(homedir(), "GASTROBAR-backups");
const dumps = readdirSync(backups)
  .filter((f) => /^prod-ulxmubivimwxevgxxxyu-.*\.dump$/.test(f) && statSync(join(backups, f)).size > 100000)
  .sort()
  .reverse();
if (!dumps.length) throw new Error("no usable dump in GASTROBAR-backups");
const dumpPath = join(backups, dumps[0]);

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail: String(detail ?? "").slice(0, 300) });
  console.log(JSON.stringify(results[results.length - 1]));
  if (!cond) throw new Error("FAIL " + name);
}

check("dump_selected", existsSync(dumpPath), dumpPath);
check("dump_bytes", statSync(dumpPath).size > 100000, String(statSync(dumpPath).size));

// Recreate empty target DB
sql("postgres", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${targetDb}' AND pid <> pg_backend_pid()`);
sql("postgres", `DROP DATABASE IF EXISTS ${targetDb}`);
sql("postgres", `CREATE DATABASE ${targetDb}`);

// Restore (ignore ACL/owner noise via --no-owner --no-acl already in dump; allow non-zero for role warnings?)
const restore = spawnSync(
  pgRestore,
  ["-h", host, "-p", port, "-U", user, "-d", targetDb, "--no-owner", "--no-acl", "--exit-on-error", dumpPath],
  { encoding: "utf8", env, timeout: 600000 },
);
if (restore.status !== 0) {
  // Some dumps fail on auth/storage roles; retry without --exit-on-error and verify public tables
  spawnSync(pgRestore, ["-h", host, "-p", port, "-U", user, "-d", targetDb, "--no-owner", "--no-acl", dumpPath], {
    encoding: "utf8",
    env,
    timeout: 600000,
  });
}
const productsBefore = Number(sql(targetDb, "select count(*)::text from public.erp_products"));
check("restore_products", productsBefore > 0, String(productsBefore));

const baseline = {
  products: productsBefore,
  recipes: Number(sql(targetDb, "select count(*)::text from public.erp_recipes")),
  dishes: Number(sql(targetDb, "select count(*)::text from public.erp_dishes")),
  suppliers: Number(sql(targetDb, "select count(*)::text from public.erp_suppliers")),
  lots: Number(sql(targetDb, "select count(*)::text from public.erp_lots")),
  stock: Number(sql(targetDb, "select count(*)::text from public.erp_stock")),
  docs: Number(sql(targetDb, "select count(*)::text from public.erp_documents")),
  finance_tx: Number(sql(targetDb, "select count(*)::text from public.erp_finance_transactions")),
  tax_rates: Number(sql(targetDb, "select count(*)::text from public.erp_tax_rates")),
  auth_users: Number(
    sql(
      targetDb,
      `select case when to_regclass('auth.users') is null then '0' else (select count(*)::text from auth.users) end`,
    ),
  ),
};
console.log(JSON.stringify({ baseline }, null, 2));
check("baseline_has_catalog", baseline.products > 0 && baseline.dishes >= 0, JSON.stringify(baseline));

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

for (const m of migrations) {
  check(`mig_exists_${m.split("/").pop()}`, existsSync(m), m);
  sqlFile(targetDb, m);
  check(`mig_applied_${m.split("/").pop()}`, true, "ok");
}

const after = {
  products: Number(sql(targetDb, "select count(*)::text from public.erp_products")),
  recipes: Number(sql(targetDb, "select count(*)::text from public.erp_recipes")),
  dishes: Number(sql(targetDb, "select count(*)::text from public.erp_dishes")),
  suppliers: Number(sql(targetDb, "select count(*)::text from public.erp_suppliers")),
  lots: Number(sql(targetDb, "select count(*)::text from public.erp_lots")),
  stock: Number(sql(targetDb, "select count(*)::text from public.erp_stock")),
  docs: Number(sql(targetDb, "select count(*)::text from public.erp_documents")),
  finance_tx: Number(sql(targetDb, "select count(*)::text from public.erp_finance_transactions")),
  tax_rates: Number(sql(targetDb, "select count(*)::text from public.erp_tax_rates")),
  auth_users: Number(
    sql(
      targetDb,
      `select case when to_regclass('auth.users') is null then '0' else (select count(*)::text from auth.users) end`,
    ),
  ),
  sales_docs_table: sql(targetDb, "select to_regclass('public.erp_sales_documents') is not null"),
  periods_table: sql(targetDb, "select to_regclass('public.erp_financial_periods') is not null"),
  auto_consume: sql(targetDb, "select coalesce(sales_auto_consume_stock::text,'') from public.erp_settings where id=1"),
};

for (const k of Object.keys(baseline)) {
  check(`preserve_${k}`, after[k] === baseline[k], `${baseline[k]} → ${after[k]}`);
}
check("r3_sales_table", after.sales_docs_table === "t", after.sales_docs_table);
check("r3_periods_table", after.periods_table === "t", after.periods_table);
check("auto_consume_off", after.auto_consume === "false" || after.auto_consume === "", after.auto_consume);

// RPC smoke
const rpcOk = sql(
  targetDb,
  `select (
      to_regprocedure('public.erp_accrual_pnl(date,date,uuid)') is not null
      and to_regprocedure('public.erp_period_close(uuid,text,boolean,text)') is not null
      and to_regprocedure('public.erp_management_cashflow(date,date)') is not null
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='erp_input_vat_register')
    )::text`,
);
check("r3_rpcs_present", rpcOk === "t" || rpcOk === "true", rpcOk);

const outDir = join("docs", "screenshots", "phase10");
mkdirSync(outDir, { recursive: true });
const out = { ok: true, dump: dumpPath, targetDb, baseline, after, results };
writeFileSync(join(outDir, "restore-migrate-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, passed: results.filter((r) => r.ok).length, targetDb }));
