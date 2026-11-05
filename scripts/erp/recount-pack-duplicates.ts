/**
 * Read-only duplicate-pack counts. Prints no secrets. Does not merge.
 * Timeout: 15s. Writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file: string) {
  if (!file) return;
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

function loadEnv() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  for (const extra of (process.env.ERP_ENV_FILES ?? "").split(";")) {
    if (extra.trim()) loadEnvFile(extra.trim());
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
}

type Pack = { id: string; name: string; unit: string; qty_base: number | string; archived_at: string | null };

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ERP database is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const query = (async () => {
    const packsRes = await db.from("erp_packs").select("id, name, unit, qty_base, archived_at");
    if (packsRes.error) throw new Error(packsRes.error.message);
    return (packsRes.data ?? []) as Pack[];
  })();

  const packs = await Promise.race([
    query,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("recount timed out after 15s")), 15000)),
  ]);

  const live = packs.filter((p) => !p.archived_at);
  const keyOf = (p: Pack) => `${p.name}\t${p.unit}\t${Number(p.qty_base)}`;
  const groups = new Map<string, Pack[]>();
  for (const pack of live) {
    const list = groups.get(keyOf(pack)) ?? [];
    list.push(pack);
    groups.set(keyOf(pack), list);
  }
  const duplicates = [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0], "en") || b[1].length - a[1].length);

  const sumSizes = duplicates.reduce((n, [, list]) => n + list.length, 0);
  const extra = duplicates.reduce((n, [, list]) => n + (list.length - 1), 0);

  console.log(
    JSON.stringify(
      {
        packs_all: packs.length,
        packs_live: live.length,
        duplicate_groups: duplicates.length,
        sum_group_sizes: sumSizes,
        extra: extra,
        groups: duplicates.map(([, list]) => ({
          name: list[0].name,
          unit: list[0].unit,
          qty_base: Number(list[0].qty_base),
          n: list.length,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : "error");
  process.exit(1);
});
