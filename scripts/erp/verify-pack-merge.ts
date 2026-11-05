/**
 * Read-only post-merge checks. Prints no secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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
    /* missing */
  }
}

function loadEnv() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  for (const extra of (process.env.ERP_ENV_FILES ?? "").split(";")) {
    if (extra.trim()) loadEnvFile(extra.trim());
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
}

type Pack = { id: string; name: string; unit: string; qty_base: number | string; archived_at: string | null };
type Link = { id: string; product_id: string; pack_id: string; is_default: boolean; archived_at: string | null; supplier_id: string | null };
type Lot = { qty_left: number | string; unit_cost: number | string | null };

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ERP database is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const timed = <T>(p: PromiseLike<T>) =>
    Promise.race([Promise.resolve(p), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("verify timed out")), 20000))]);

  const packs = ((await timed(db.from("erp_packs").select("id, name, unit, qty_base, archived_at"))).data ?? []) as Pack[];
  const links = ((await timed(db.from("erp_product_packs").select("id, product_id, pack_id, is_default, archived_at, supplier_id"))).data ?? []) as Link[];
  const lots = ((await timed(db.from("erp_lots").select("qty_left, unit_cost"))).data ?? []) as Lot[];
  const map = (await timed(db.from("erp_pack_merge_map").select("old_id, new_id, rolled_back_at"))).data ?? [];
  const skip = (await timed(db.from("erp_pack_merge_skip").select("pack_name, reason"))).data ?? [];
  const live = packs.filter((p) => !p.archived_at);
  const groups = new Map<string, number>();
  for (const p of live) {
    const k = `${p.name}\t${p.unit}\t${Number(p.qty_base)}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const dups = [...groups.entries()].filter(([, n]) => n > 1);
  const liveLinks = links.filter((l) => !l.archived_at);
  const broken = liveLinks.filter((l) => !packs.some((p) => p.id === l.pack_id));
  const stockQty = lots.reduce((n, r) => n + Number(r.qty_left ?? 0), 0);
  const stockValue = lots.reduce((n, r) => n + Number(r.qty_left ?? 0) * Number(r.unit_cost ?? 0), 0);
  console.log(
    JSON.stringify(
      {
        packs_all: packs.length,
        packs_live: live.length,
        packs_archived: packs.length - live.length,
        mapped: map.filter((m: { rolled_back_at: string | null }) => !m.rolled_back_at).length,
        skipped: skip.length,
        live_duplicate_groups: dups.length,
        broken_links: broken.length,
        live_links: liveLinks.length,
        default_links: liveLinks.filter((l) => l.is_default).length,
        stock_qty: stockQty,
        stock_value: stockValue,
        skip_reasons: skip,
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
