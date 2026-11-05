/**
 * Read-only list of duplicate pack groups on the configured ERP database.
 * Does not merge rows. Prints no secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
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
}

type Pack = { id: string; name: string; unit: string; qty_base: number; archived_at: string | null };
type Link = { pack_id: string; product_id: string; label: string | null };
type Product = { id: string; name_en: string; name_vn: string; code: string; base_unit: string | null };

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ERP database is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const packsRes = await db.from("erp_packs").select("id, name, unit, qty_base, archived_at");
  if (packsRes.error) throw new Error(packsRes.error.message);
  const packs = (packsRes.data ?? []) as Pack[];

  const linksRes = await db.from("erp_product_packs").select("pack_id, product_id, label").is("archived_at", null);
  if (linksRes.error) throw new Error(linksRes.error.message);
  const links = (linksRes.data ?? []) as Link[];

  const productsRes = await db.from("erp_products").select("id, name_en, name_vn, code, base_unit");
  if (productsRes.error) throw new Error(productsRes.error.message);
  const products = new Map(((productsRes.data ?? []) as Product[]).map((p) => [p.id, p]));

  const keyOf = (p: Pack) => `${p.name}\t${p.unit}\t${Number(p.qty_base)}`;
  const groups = new Map<string, Pack[]>();
  for (const pack of packs) {
    if (pack.archived_at) continue;
    const list = groups.get(keyOf(pack)) ?? [];
    list.push(pack);
    groups.set(keyOf(pack), list);
  }
  const duplicates = [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0], "ru") || b[1].length - a[1].length);

  const lines: string[] = [
    "# Дубли фасовок (не объединять)",
    "",
    "Снимок справочника `erp_packs` по ключу **name + unit + qty_base**. Строки **не сливаются**: одинаковое имя — разные id.",
    "",
    `Дата чтения: ${new Date().toISOString().slice(0, 10)}. Активных групп-дублей: **${duplicates.length}**.`,
    "",
  ];

  duplicates.forEach(([, list], index) => {
    const sample = list[0];
    lines.push(`## ${index + 1}. ${sample.name} · ${sample.unit} · ${sample.qty_base}`);
    lines.push("");
    lines.push(`Повторов: ${list.length}.`);
    lines.push("");
    for (const pack of list) {
      const related = links
        .filter((link) => link.pack_id === pack.id)
        .map((link) => {
          const product = products.get(link.product_id);
          const title = product ? `${product.name_en}${product.name_vn && product.name_vn !== product.name_en ? ` / ${product.name_vn}` : ""}` : link.product_id;
          const code = product?.code ? ` \`${product.code}\`` : "";
          return `${title}${code}`;
        });
      lines.push(`- id \`${pack.id}\`: ${related.length ? related.join("; ") : "_нет связанных товаров_"}`);
    }
    lines.push("");
  });

  if (!duplicates.length) lines.push("Активных дублей нет.");

  const out = path.join(process.cwd(), "docs", "erp-pack-duplicate-groups.md");
  writeFileSync(out, `${lines.join("\n").trim()}\n`);
  console.log(`wrote ${out} (${duplicates.length} groups)`);
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : "error");
  process.exit(1);
});
