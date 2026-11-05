import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Pack = { id: string; name: string; unit: string; qty_base: number; archived_at: string | null };
type Link = { pack_id: string; product_id: string; label: string | null; archived_at?: string | null };
type Product = { id: string; name_en: string; name_vn: string; code: string; base_unit: string | null };

const src = process.argv[2];
if (!src) {
  console.error("usage: tsx scripts/erp/write-pack-duplicates-from-state.ts <state.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(src, "utf8")) as {
  packs?: Pack[];
  productPacks?: Link[];
  products?: Product[];
};

const packs = (raw.packs ?? []).filter((p) => !p.archived_at);
const links = (raw.productPacks ?? []).filter((l) => !l.archived_at);
const products = new Map((raw.products ?? []).map((p) => [p.id, p]));
const has1284 = packs.filter(
  (p) => Number(p.qty_base) === 1.284 || String(p.qty_base).includes("1.284") || p.name.includes("1.284"),
);

const keyOf = (p: Pack) => `${p.name}\t${p.unit}\t${Number(p.qty_base)}`;
const groups = new Map<string, Pack[]>();
for (const pack of packs) {
  const list = groups.get(keyOf(pack)) ?? [];
  list.push(pack);
  groups.set(keyOf(pack), list);
}
const duplicates = [...groups.entries()]
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0], "ru") || b[1].length - a[1].length);

function title(id: string) {
  const product = products.get(id);
  if (!product) return id;
  const extra = product.name_vn && product.name_vn !== product.name_en ? ` / ${product.name_vn}` : "";
  const code = product.code ? ` \`${product.code}\`` : "";
  return `${product.name_en}${extra}${code}`;
}

const lines: string[] = [
  "# Дубли фасовок (не объединять)",
  "",
  "Снимок справочника `erp_packs` по ключу **name + unit + qty_base**. Строки **не сливаются**: одинаковое имя — разные id.",
  "",
  `Источник: прод REST \`/api/erp/state?parts=packs,productPacks,products\` (сессия владельца), ${new Date().toISOString().slice(0, 10)}. Активных групп-дублей: **${duplicates.length}**.`,
  "",
];

duplicates.forEach(([, list], index) => {
  const sample = list[0];
  lines.push(`## ${index + 1}. ${sample.name} · ${sample.unit} · ${sample.qty_base}`);
  lines.push("");
  lines.push(`Повторов: ${list.length}.`);
  lines.push("");
  for (const pack of list) {
    const related = links.filter((link) => link.pack_id === pack.id).map((link) => title(link.product_id));
    lines.push(`- id \`${pack.id}\`: ${related.length ? related.join("; ") : "_нет связанных товаров_"}`);
  }
  lines.push("");
});

if (!duplicates.length) lines.push("Активных дублей нет.");

const out = path.join(process.cwd(), "docs", "erp-pack-duplicate-groups.md");
writeFileSync(out, `${lines.join("\n").trim()}\n`);
console.log(`wrote ${out} (${duplicates.length} groups, packs=${packs.length}, has1284=${has1284.length})`);
