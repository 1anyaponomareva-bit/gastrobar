import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function envLens(file) {
  if (!existsSync(file)) return { file, missing: true };
  const keys = {};
  for (const line of readFileSync(file, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!/SUPABASE|DATABASE|POSTGRES|DB_|DIRECT|POOLER/i.test(m[1])) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    keys[m[1]] = v.length;
  }
  return { file, keys };
}

const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const pgDump = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
const supabase = spawnSync("npx", ["--yes", "supabase", "--version"], { encoding: "utf8", shell: true });

console.log(
  JSON.stringify(
    {
      docker: { status: docker.status, out: (docker.stdout || docker.stderr || "").trim().slice(0, 200) },
      pg_dump: { status: pgDump.status, out: (pgDump.stdout || pgDump.stderr || "").trim().slice(0, 200) },
      supabase_cli: { status: supabase.status, out: (supabase.stdout || supabase.stderr || "").trim().slice(0, 200) },
      env: [".env.local", ".env.vercel.local", ".env"].map(envLens),
      gitignore_has_env: existsSync(".gitignore") && /\.env/.test(readFileSync(".gitignore", "utf8")),
      supabase_config: existsSync("supabase/config.toml"),
    },
    null,
    2,
  ),
);
