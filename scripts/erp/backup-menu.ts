/**
 * Read-only JSON dump of catalog / recipes / dishes / stock identity.
 * Never writes to the database. Output: .erp-menu-backup/ (gitignored).
 *
 *   npx tsx scripts/erp/backup-menu.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TIMEOUT_MS = 25000;

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

const timed = <T>(p: PromiseLike<T>) =>
  Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`backup timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
  ]);

async function allRows(db: SupabaseClient, table: string, columns = "*") {
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += page) {
    const res = await timed(db.from(table).select(columns).range(from, from + page - 1));
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    const chunk = (res.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < page) return rows;
  }
}

function n(value: unknown) {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("ERP database is not configured");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const products = await allRows(db, "erp_products");
  const packs = await allRows(db, "erp_packs");
  const productPacks = await allRows(db, "erp_product_packs");
  const suppliers = await allRows(db, "erp_suppliers");
  const categories = await allRows(db, "erp_categories");
  const warehouses = await allRows(db, "erp_warehouses");
  const recipes = await allRows(db, "erp_recipes");
  const recipeLines = await allRows(db, "erp_recipe_lines");
  const dishes = await allRows(db, "erp_dishes");
  const dishLines = await allRows(db, "erp_dish_lines");
  const dishPrices = await allRows(db, "erp_dish_channel_prices");
  const lots = await allRows(db, "erp_lots", "id, product_id, warehouse_id, qty_left, unit_cost, received_at, qty_in, source_document_id");
  const documents = await allRows(db, "erp_documents", "id, doc_no, doc_type, status, warehouse_id, occurred_at");

  const live = <T extends { archived_at?: unknown }>(rows: T[]) => rows.filter((r) => !r.archived_at);
  const stockQty = lots.reduce((sum, r) => sum + n(r.qty_left), 0);
  const stockValue = lots.reduce((sum, r) => sum + n(r.qty_left) * n(r.unit_cost), 0);

  const summary = {
    products: products.length,
    products_live: live(products).length,
    packs: packs.length,
    packs_live: live(packs).length,
    product_packs: productPacks.length,
    product_packs_live: live(productPacks).length,
    suppliers: suppliers.length,
    suppliers_live: live(suppliers).length,
    categories: categories.length,
    warehouses: warehouses.length,
    recipes: recipes.length,
    recipe_lines: recipeLines.length,
    dishes: dishes.length,
    dish_lines: dishLines.length,
    dish_channel_prices: dishPrices.length,
    lots: lots.length,
    documents: documents.length,
    documents_posted: documents.filter((d) => d.status === "posted").length,
    stock_qty: stockQty,
    stock_value: stockValue,
    product_ids: products.map((p) => p.id).sort(),
    pack_ids: packs.map((p) => p.id).sort(),
    supplier_ids: suppliers.map((p) => p.id).sort(),
    document_ids: documents.map((p) => p.id).sort(),
  };

  const dir = path.join(process.cwd(), ".erp-menu-backup");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    at: new Date().toISOString(),
    summary,
    products,
    packs,
    product_packs: productPacks,
    suppliers,
    categories,
    warehouses,
    recipes,
    recipe_lines: recipeLines,
    dishes,
    dish_lines: dishLines,
    dish_channel_prices: dishPrices,
    lots,
    documents,
  };
  const file = path.join(dir, `before-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload));
  const { product_ids, pack_ids, supplier_ids, document_ids, ...printSummary } = summary;
  console.log(
    JSON.stringify(
      {
        file: path.basename(file),
        id_counts: {
          products: product_ids.length,
          packs: pack_ids.length,
          suppliers: supplier_ids.length,
          documents: document_ids.length,
        },
        ...printSummary,
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
