/**
 * Apply Release 2 migrations to PRODUCTION (explicit owner OK required).
 * Secrets only from gitignored .env.db.local — never logged.
 *
 * Required:
 *   ERP_ALLOW_PROD_R2_APPLY=1
 *   ERP_PROD_APPLY_CONFIRM=RELEASE2_PRODUCTION_OK
 *   .env.db.local with SUPABASE_DB_* (pooler OK)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const PRODUCTION_REF = "ulxmubivimwxevgxxxyu";
const FILES = [
  "20261125150000_erp_purchase_input_vat.sql",
  "20261125160000_erp_lots_input_vat_fifo.sql",
  "20261125170000_erp_vat_cost_adjustment.sql",
  "20261125180000_erp_production_cost_lineage.sql",
  "20261125190000_erp_recipe_costing.sql",
  "20261125200000_erp_r2_preprod_hardening.sql",
];

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

function die(msg) {
  console.error("REFUSED:", msg);
  process.exit(2);
}

if (process.env.ERP_ALLOW_PROD_R2_APPLY !== "1") die("Set ERP_ALLOW_PROD_R2_APPLY=1");
if (process.env.ERP_PROD_APPLY_CONFIRM !== "RELEASE2_PRODUCTION_OK") {
  die("Set ERP_PROD_APPLY_CONFIRM=RELEASE2_PRODUCTION_OK");
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
if (!password || !host || !user) die("Missing SUPABASE_DB_* in .env.db.local");
if (!user.includes(PRODUCTION_REF) && !host.includes(PRODUCTION_REF)) {
  die("Connection target does not look like production ref " + PRODUCTION_REF);
}

const psqlCandidates = [
  process.env.PSQL_PATH,
  "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
  "psql",
].filter(Boolean);
let psql = null;
for (const c of psqlCandidates) {
  const r = spawnSync(c, ["--version"], { encoding: "utf8" });
  if (r.status === 0) {
    psql = c;
    break;
  }
}
if (!psql) die("psql not found");

const outRoot = join(homedir(), "GASTROBAR-backups");
mkdirSync(outRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = join(outRoot, `r2-prod-apply-${stamp}.json`);
const results = [];

const envRun = { ...process.env, PGPASSWORD: password };

function runSql(label, args) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    env: envRun,
    timeout: 10 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    label,
    status: r.status,
    stdout: (r.stdout || "").slice(0, 4000),
    stderr: (r.stderr || "").slice(0, 4000),
  };
}

// Pre-check: refuse if already partially applied
const pre = runSql("precheck", [
  "-t",
  "-A",
  "-c",
  "select coalesce(to_regclass('public.erp_vat_cost_adjustments')::text,'') || '|' || exists(select 1 from information_schema.columns where table_name='erp_settings' and column_name='recipe_cost_source')::text;",
]);
results.push(pre);
if (pre.status !== 0) {
  writeFileSync(logPath, JSON.stringify({ ok: false, stage: "precheck", results }, null, 2));
  console.error("PRECHECK_FAILED");
  process.exit(1);
}
const preLine = (pre.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
if (preLine && preLine !== "|f" && preLine !== "|false") {
  writeFileSync(logPath, JSON.stringify({ ok: false, stage: "already_applied", preLine, results }, null, 2));
  console.error("REFUSED: R2 objects already present — abort to avoid double-apply surprises", preLine);
  process.exit(3);
}

for (const file of FILES) {
  const full = join(process.cwd(), "supabase", "migrations", file);
  if (!existsSync(full)) {
    writeFileSync(logPath, JSON.stringify({ ok: false, missing: file, results }, null, 2));
    die("Missing " + file);
  }
  console.log(JSON.stringify({ applying: file }));
  const r = runSql(file, ["-f", full]);
  results.push({ file, status: r.status, stderr: r.stderr, stdout_tail: r.stdout.slice(-1500) });
  if (r.status !== 0) {
    writeFileSync(logPath, JSON.stringify({ ok: false, failed: file, results }, null, 2));
    console.error("STOPPED_ON", file);
    process.exit(r.status || 1);
  }
  // record migration version
  const ver = file.slice(0, 14);
  const rec = runSql("record_" + ver, [
    "-c",
    `insert into supabase_migrations.schema_migrations(version) values ('${ver}') on conflict do nothing;`,
  ]);
  results.push(rec);
}

const smoke = runSql("smoke", [
  "-c",
  `
select recipe_cost_source, vat_adj_allow_backdated from erp_settings where id=1;
select to_regclass('public.erp_vat_cost_adjustments') as vat_adj,
       to_regclass('public.erp_dish_cost_snapshots') as snapshots,
       to_regclass('public.erp_document_acquisition_costs') as acq,
       to_regclass('public.erp_production_lot_components') as lineage;
select public.erp_effective_inventory_cost(100,10,'deductible',100,0) as cost_deductible;
select public.erp_effective_inventory_cost(100,10,'non_deductible',0,0) as cost_nondeductible;
select public.erp_split_purchase_vat(10,'partial',50) as split_partial;
select count(*) as dishes from erp_dishes;
select count(*) as lots from erp_lots;
select version from supabase_migrations.schema_migrations where version between '20261125150000' and '20261125200000' order by 1;
`,
]);
results.push(smoke);

const ok = smoke.status === 0;
writeFileSync(
  logPath,
  JSON.stringify(
    {
      ok,
      checked_at: new Date().toISOString(),
      project_ref: PRODUCTION_REF,
      host,
      user,
      migrations: FILES,
      log_path: logPath,
      results: results.map((r) => ({
        label: r.label || r.file,
        status: r.status,
        stderr: r.stderr,
        stdout: r.stdout || r.stdout_tail,
      })),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok, log_path: logPath, smoke_status: smoke.status }, null, 2));
if (smoke.stdout) console.log(smoke.stdout);
process.exit(ok ? 0 : 1);
