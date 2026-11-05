/**
 * Read-only backup of packs/links before merge. Prints no secrets.
 * Writes .erp-pack-merge-backup/ (gitignored).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file: string) {
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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ERP database is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const timed = <T>(p: PromiseLike<T>) =>
    Promise.race([Promise.resolve(p), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("backup timed out after 25s")), 25000))]);

  const packs = await timed(db.from("erp_packs").select("*"));
  if (packs.error) throw new Error(packs.error.message);
  const links = await timed(db.from("erp_product_packs").select("*"));
  if (links.error) throw new Error(links.error.message);
  const lots = await timed(db.from("erp_lots").select("id, product_id, warehouse_id, qty_left, unit_cost"));
  if (lots.error) throw new Error(lots.error.message);
  const mergeMap = await timed(db.from("erp_pack_merge_map").select("old_id").limit(1));
  const mergeApplied = !mergeMap.error;

  const livePacks = (packs.data ?? []).filter((p: { archived_at: string | null }) => !p.archived_at);
  const liveLinks = (links.data ?? []).filter((p: { archived_at: string | null }) => !p.archived_at);
  const stockQty = (lots.data ?? []).reduce((n: number, r: { qty_left: number | string }) => n + Number(r.qty_left ?? 0), 0);
  const stockValue = (lots.data ?? []).reduce(
    (n: number, r: { qty_left: number | string; unit_cost: number | string | null }) =>
      n + Number(r.qty_left ?? 0) * Number(r.unit_cost ?? 0),
    0,
  );

  const dir = path.join(process.cwd(), ".erp-pack-merge-backup");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    at: new Date().toISOString(),
    merge_map_exists: mergeApplied,
    merge_map_error: mergeMap.error?.message ?? null,
    packs: packs.data,
    product_packs: links.data,
    lots: lots.data,
    summary: {
      packs_all: (packs.data ?? []).length,
      packs_live: livePacks.length,
      links_all: (links.data ?? []).length,
      links_live: liveLinks.length,
      default_links: liveLinks.filter((l: { is_default: boolean }) => l.is_default).length,
      stock_qty: stockQty,
      stock_value: stockValue,
    },
  };
  const file = path.join(dir, `before-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload));
  console.log(
    JSON.stringify(
      {
        file: path.basename(file),
        merge_map_exists: mergeApplied,
        ...payload.summary,
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
