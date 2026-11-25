/**
 * Free-plan logical backup of production Postgres.
 * Reads secrets ONLY from gitignored .env.db.local — never logs them.
 *
 * Usage: node scripts/erp/pg-dump-prod-free.mjs
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

function findPgDump() {
  // Prefer major >= server (Supabase prod is 17.x); never pick older client first.
  const candidates = [
    process.env.PG_DUMP_PATH,
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
    "pg_dump",
  ].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return null;
}

const env = { ...loadEnvFile(".env.db.local"), ...process.env };
const password = (env.SUPABASE_DB_PASSWORD || "").trim();
const host = (env.SUPABASE_DB_HOST || "db.ulxmubivimwxevgxxxyu.supabase.co").trim();
const port = (env.SUPABASE_DB_PORT || "5432").trim();
const user = (env.SUPABASE_DB_USER || "postgres").trim();
const db = (env.SUPABASE_DB_NAME || "postgres").trim();
const ref = "ulxmubivimwxevgxxxyu";

if (!password) {
  console.error("MISSING: set SUPABASE_DB_PASSWORD in gitignored .env.db.local (see scripts/erp/free-plan-dump-restore.md)");
  process.exit(2);
}

const pgDump = findPgDump();
if (!pgDump) {
  console.error("MISSING: pg_dump not found. Install PostgreSQL client tools.");
  process.exit(3);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outRoot = join(homedir(), "GASTROBAR-backups");
mkdirSync(outRoot, { recursive: true });
const dumpPath = join(outRoot, `prod-${ref}-${stamp}.dump`);
const metaPath = join(outRoot, `prod-${ref}-${stamp}.meta.json`);

const envRun = { ...process.env, PGPASSWORD: password };
const args = [
  "-h",
  host,
  "-p",
  port,
  "-U",
  user,
  "-d",
  db,
  "-Fc",
  "--no-owner",
  "--no-acl",
  "-f",
  dumpPath,
];

console.log(JSON.stringify({ action: "pg_dump", host, port, user, db, out: dumpPath, pg_dump: pgDump }, null, 2));
const r = spawnSync(pgDump, args, { encoding: "utf8", env: envRun, timeout: 30 * 60 * 1000 });
if (r.status !== 0) {
  console.error("pg_dump_failed", (r.stderr || r.stdout || "").slice(0, 2000));
  process.exit(r.status || 1);
}

const list = spawnSync(pgDump.replace(/pg_dump(\.exe)?$/i, "pg_restore$1"), ["-l", dumpPath], {
  encoding: "utf8",
  timeout: 120000,
});
const bytes = statSync(dumpPath).size;
const meta = {
  checked_at: new Date().toISOString(),
  project_ref: ref,
  dump_path: dumpPath,
  bytes,
  pg_dump: pgDump,
  list_ok: list.status === 0,
  list_lines: list.status === 0 ? (list.stdout || "").split(/\n/).length : 0,
  note: "Logical dump (custom format). Auth users live in auth schema if included; Storage objects in DB metadata only — files need separate storage sync if used.",
};
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
