/**
 * ERP database checks on an in-memory Postgres (PGlite). Never touches production.
 * Run: npm run test:erp
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_STAFF_CATALOG, sanitizeStaffCatalog, type StaffCatalog } from "../../src/data/staffCatalog";
import { RECIPES } from "../../src/data/recipes";
import {
  buildCostContext,
  channelResult,
  costLine,
  DEFAULT_MENU_PRICE_SOURCE,
  productTitle,
  summarize,
  type CostProduct,
  type CostRecipe,
} from "../../src/lib/erp/costing";
import { dishCost, menuCostContext } from "../../src/lib/erp/menu";
import {
  menuListBackHref,
  menuListHref,
  parseMenuListSearch,
  productEditorReturnHref,
  safeMenuListReturn,
  withMenuListReturn,
} from "../../src/lib/erp/menuListQuery";
import { setErpLang } from "../../src/components/erp/i18n";
import { categoryLabel, dishInitials, lossPercentsText, posterDishMarkup, posterStockQty, productBrandFieldLabel, productCodeFieldLabel } from "../../src/components/erp/menuFields";
import { initialWarehouses } from "../../src/lib/erp/docDefaults";
import {
  applyReceiptSupplier,
  documentSupplierLabel,
  documentSupplierIds,
  receiptMatchesSupplier,
} from "../../src/lib/erp/docSupplier";
import { basePrice, formatPackLabel, packPrice, packToBase, parsePackLabel, type PackWords } from "../../src/lib/erp/packs";
import { xlsxBytes } from "../../src/lib/erp/xlsx";
import { costInfo, costNumber, stockByProduct, stockOf, stockValue } from "../../src/lib/erp/stockView";
import { packSupplierIds, packSupplierLabel, supplierCategoryIds } from "../../src/lib/erp/supplierCategories";
import { ingredientCategoryStats, withInputVat } from "../../src/lib/erp/ingredientCategoryStats";
import { planStaffMerge, type ErpCatalogRows } from "../../src/lib/erp/staffMerge";
import { countFromDocument } from "../../src/lib/erp/inventoryUi";
import type { ErpCountMove, ErpStockRow } from "../../src/lib/erp/types";
import { makeSupplierOrderPdfBlob } from "../../src/lib/staffInventoryPdf";
import { supplierOrderRows } from "../../src/lib/staffOrderRows";
import { applyMigration, createTestDb } from "./testDb";
import {
  decideErpHostGate,
  isErpHostAllowedPath,
  parseHostList,
  readErpHostGateConfig,
  type ErpHostGateConfig,
} from "../../src/lib/erp/hostGate";
import { publicErpHref, toInternalErpPathname, toPublicErpPathname } from "../../src/lib/erp/publicPath";

const ACTOR = "test@gastrofood";
let db: PGlite;
let passed = 0;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  assert.equal(rows.length, 1, `expected one row: ${sql}`);
  return rows[0];
}
async function value<T>(sql: string, params: unknown[] = []): Promise<T> {
  const row = await one<Record<string, T>>(sql, params);
  return Object.values(row)[0];
}
async function expectError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.match((error as Error).message, new RegExp(code), `expected ${code}, got ${(error as Error).message}`);
    return;
  }
  assert.fail(`expected error ${code}`);
}
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function saveProduct(p: Record<string, unknown>) {
  return value<string>("select public.erp_save_product($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);
}
async function savePack(p: Record<string, unknown>) {
  return value<string>("select public.erp_save_pack($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);
}
async function saveDoc(p: Record<string, unknown>) {
  return value<string>("select public.erp_save_document($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);
}
async function post(id: string) {
  return value<Record<string, unknown>>("select public.erp_post_document($1, $2)", [id, ACTOR]);
}
async function cancel(id: string, reason = "test") {
  return value<Record<string, unknown>>("select public.erp_cancel_document($1, $2, $3)", [id, ACTOR, reason]);
}
async function stock(product: string, warehouse: string) {
  return n(
    await value("select coalesce(sum(qty_left), 0) from public.erp_lots where product_id = $1 and warehouse_id = $2", [
      product,
      warehouse,
    ]),
  );
}
async function wh(code: string) {
  return value<string>("select id from public.erp_warehouses where code = $1", [code]);
}

function gateCfg(over: Partial<ErpHostGateConfig> = {}): ErpHostGateConfig {
  return { erpHosts: ["erp.example.test"], redirectFromLegacy: false, closeLegacyApi: false, ...over };
}

function gate(host: string, path: string, method = "GET", cfg?: ErpHostGateConfig) {
  const url = new URL(path, "https://example.invalid");
  return decideErpHostGate(
    { hostHeader: host, pathname: url.pathname, search: url.search, method },
    cfg ?? gateCfg(),
  );
}

async function main() {
  await test("host gate flags split: empty A and B off leave legacy ERP in place", async () => {
    const cfg = readErpHostGateConfig({});
    assert.deepEqual(cfg, { erpHosts: [], redirectFromLegacy: false, closeLegacyApi: false });
    assert.equal(gate("www.gastrotruck.org", "/erp", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/action", "POST", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/staff", "GET", cfg).action, "allow");
  });

  await test("host gate does not invent gastrotruck.org as the new ERP host", async () => {
    assert.deepEqual(parseHostList("https://www.gastrotruck.org, kitchen.gastrotruck.org, erp.example.test"), [
      "erp.example.test",
    ]);
  });

  await test("dual-run: named host serves ERP while old /erp still works", async () => {
    const cfg = gateCfg({ redirectFromLegacy: false });
    const home = gate("erp.example.test", "/", "GET", cfg);
    assert.equal(home.action, "allow");
    const stock = gate("erp.example.test", "/stock/receipts", "GET", cfg);
    assert.equal(stock.action, "redirect");
    if (stock.action === "redirect") {
      assert.equal(stock.status, 307);
      assert.equal(stock.location, "https://erp.example.test/erp/stock/receipts");
    }
    const invite = gate("erp.example.test", "/erp?invite=abc", "GET", cfg);
    assert.equal(invite.action, "allow");
    assert.equal(gate("erp.example.test", "/erp/stock", "GET", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/erp/state", "GET", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/recipes-admin/login", "POST", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/recipes-admin/logout", "POST", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/recipes-admin/register", "POST", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/recipes-admin/session", "GET", cfg).action, "allow");
    assert.equal(gate("erp.example.test", "/api/recipes-admin/profile", "POST", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/erp/stock", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg).action, "allow");
  });

  await test("new host allowlist: other pages 307, other APIs JSON, writes not redirected", async () => {
    const page = gate("erp.example.test", "/staff?x=1", "GET");
    assert.equal(page.action, "redirect");
    if (page.action === "redirect") {
      assert.equal(page.status, 307);
      assert.equal(page.location, "https://www.gastrotruck.org/staff?x=1");
    }
    const api = gate("erp.example.test", "/api/staff-catalog", "GET");
    assert.equal(api.action, "json");
    if (api.action === "json") {
      assert.equal(api.status, 404);
      assert.equal(api.body.error, "not_found");
    }
    const recipesApi = gate("erp.example.test", "/api/recipes-admin/recipes", "POST");
    assert.equal(recipesApi.action, "json");
    const writePage = gate("erp.example.test", "/staff", "POST");
    assert.equal(writePage.action, "json");
    if (writePage.action === "json") assert.equal(writePage.status, 403);
    const proxy = gate("erp.example.test", "/supabase-proxy/rest/v1/x", "GET");
    assert.equal(proxy.action, "json");
    assert.equal(isErpHostAllowedPath("/_next/static/chunks/app.js"), true);
    assert.equal(isErpHostAllowedPath("/favicon.ico"), true);
    assert.equal(isErpHostAllowedPath("/"), true);
    assert.equal(isErpHostAllowedPath("/coming-soon"), true);
    assert.equal(isErpHostAllowedPath("/coming-soon/icon"), true);
    assert.equal(isErpHostAllowedPath("/erp"), true);
    assert.equal(isErpHostAllowedPath("/erp/stock/receipts"), true);
    assert.equal(isErpHostAllowedPath("/orders"), true);
    assert.equal(isErpHostAllowedPath("/orders/history"), true);
    assert.equal(isErpHostAllowedPath("/orders/admin"), true);
    assert.equal(isErpHostAllowedPath("/api/orders/catalog"), true);
    assert.equal(isErpHostAllowedPath("/api/orders/admin/catalog"), true);
    assert.equal(isErpHostAllowedPath("/api/orders/drafts/729e2699-1db3-492b-8a14-e98286c38781"), true);
    assert.equal(gate("erp.example.test", "/orders", "GET").action, "allow");
    assert.equal(gate("erp.example.test", "/api/orders/session", "POST").action, "allow");
    assert.equal(gate("erp.example.test", "/api/orders/drafts/729e2699-1db3-492b-8a14-e98286c38781", "PUT").action, "allow");
    assert.equal(gate("erp.example.test", "/api/orders/drafts/729e2699-1db3-492b-8a14-e98286c38781", "POST").action, "allow");
    assert.equal(isErpHostAllowedPath("/stock/receipts"), false);
    assert.equal(isErpHostAllowedPath("/menu"), false);
  });

  await test("legacy 307 is GET/HEAD only, preserves path+query, never 308", async () => {
    const cfg = gateCfg({ redirectFromLegacy: true, closeLegacyApi: false });
    const get = gate("www.gastrotruck.org", "/erp/menu/ingredients?from=packaging", "GET", cfg);
    assert.equal(get.action, "redirect");
    if (get.action === "redirect") {
      assert.equal(get.status, 307);
      assert.equal(get.location, "https://erp.example.test/erp/menu/ingredients?from=packaging");
    }
    const head = gate("gastrotruck.org", "/erp", "HEAD", cfg);
    assert.equal(head.action, "redirect");
    if (head.action === "redirect") assert.equal(head.status, 307);
    assert.equal(gate("www.gastrotruck.org", "/erp", "POST", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/action", "POST", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/staff", "GET", cfg).action, "allow");
    const root = gate("www.gastrotruck.org", "/erp", "GET", cfg);
    assert.equal(root.action, "redirect");
    if (root.action === "redirect") assert.equal(root.location, "https://erp.example.test/erp");
  });

  await test("www ERP host serves the same stub and /erp paths", async () => {
    const cfg = gateCfg({ erpHosts: ["erp.example.test", "www.erp.example.test"] });
    assert.equal(gate("www.erp.example.test", "/", "GET", cfg).action, "allow");
    assert.equal(gate("www.erp.example.test", "/erp", "GET", cfg).action, "allow");
    const www = gate("www.erp.example.test", "/erp/stock?x=1", "GET", cfg);
    assert.equal(www.action, "allow");
  });

  await test("gastrofood.vn homepage is a stub; ERP stays under /erp", async () => {
    const cfg = gateCfg({ erpHosts: ["gastrofood.vn", "www.gastrofood.vn"] });
    assert.equal(gate("gastrofood.vn", "/", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrofood.vn", "/", "GET", cfg).action, "allow");
    assert.equal(gate("gastrofood.vn", "/coming-soon", "GET", cfg).action, "allow");
    assert.equal(gate("gastrofood.vn", "/erp", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrofood.vn", "/erp", "GET", cfg).action, "allow");
    assert.equal(gate("gastrofood.vn", "/erp/stock", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrofood.vn", "/erp/menu?q=1", "GET", cfg).action, "allow");
    const oldStock = gate("www.gastrofood.vn", "/stock/receipts?x=1", "GET", cfg);
    assert.equal(oldStock.action, "redirect");
    if (oldStock.action === "redirect") {
      assert.equal(oldStock.status, 307);
      assert.equal(oldStock.location, "https://www.gastrofood.vn/erp/stock/receipts?x=1");
    }
    const staff = gate("gastrofood.vn", "/staff?x=1", "GET", cfg);
    assert.equal(staff.action, "redirect");
    if (staff.action === "redirect") {
      assert.equal(staff.status, 307);
      assert.equal(staff.location, "https://www.gastrotruck.org/staff?x=1");
    }
    assert.equal(gate("www.gastrotruck.org", "/", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/erp", "GET", cfg).action, "allow");
  });

  await test("public ERP hrefs keep the /erp prefix; slash stays the stub", async () => {
    assert.equal(toPublicErpPathname("/erp"), "/erp");
    assert.equal(toPublicErpPathname("/erp/stock"), "/erp/stock");
    assert.equal(toPublicErpPathname("/"), "/");
    assert.equal(toPublicErpPathname("/stock/receipts"), "/erp/stock/receipts");
    assert.equal(toInternalErpPathname("/stock"), "/erp/stock");
    assert.equal(toInternalErpPathname("/erp/menu"), "/erp/menu");
    assert.equal(publicErpHref("/erp/menu", false), "/erp/menu");
    assert.equal(publicErpHref("/erp/menu", true), "/erp/menu");
  });

  await test("redirect OFF restores old ERP even if close-API flag is on", async () => {
    const cfg = gateCfg({ redirectFromLegacy: false, closeLegacyApi: true });
    assert.equal(gate("www.gastrotruck.org", "/erp", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/action", "POST", cfg).action, "allow");
  });

  await test("after cutover, old ERP API closes with JSON about the move", async () => {
    const cfg = gateCfg({ redirectFromLegacy: true, closeLegacyApi: true });
    const closed = gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg);
    assert.equal(closed.action, "json");
    if (closed.action === "json") {
      assert.equal(closed.status, 410);
      assert.equal(closed.body.error, "erp_moved");
      assert.equal(closed.body.newOrigin, "https://erp.example.test");
    }
    const post = gate("www.gastrotruck.org", "/api/erp/action", "POST", cfg);
    assert.equal(post.action, "json");
    if (post.action === "json") assert.equal(post.status, 410);
    assert.equal(gate("www.gastrotruck.org", "/api/recipes-admin/login", "POST", cfg).action, "allow");
  });

  await test("redirect ON without a named host does not yank old ERP", async () => {
    const cfg = readErpHostGateConfig({ ERP_REDIRECT_FROM_LEGACY: "1", ERP_CLOSE_LEGACY_API: "1" });
    assert.equal(cfg.erpHosts.length, 0);
    assert.equal(gate("www.gastrotruck.org", "/erp", "GET", cfg).action, "allow");
    assert.equal(gate("www.gastrotruck.org", "/api/erp/state", "GET", cfg).action, "allow");
  });

  db = await createTestDb();

  await test("migration can be applied twice", async () => {
    await applyMigration(db);
    assert.equal(n(await value("select count(*) from public.erp_warehouses")), 4);
    assert.equal(n(await value("select count(*) from public.erp_sales_channels")), 3);
  });

  await test("anon and authenticated have no access", async () => {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await value("select has_table_privilege($1, 'public.erp_products', 'select')", [role]), false);
      assert.equal(await value("select has_table_privilege($1, 'public.erp_lots', 'insert')", [role]), false);
      assert.equal(
        await value("select has_function_privilege($1, 'public.erp_post_document(uuid,text)', 'execute')", [role]),
        false,
      );
    }
    assert.equal(await value("select has_table_privilege('service_role', 'public.erp_products', 'select')"), true);
    assert.equal(
      await value("select has_function_privilege('service_role', 'public.erp_post_document(uuid,text)', 'execute')"),
      true,
    );
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        await value("select has_function_privilege($1, 'public.erp_load_state(text)', 'execute')", [role]),
        false,
      );
    }
    assert.equal(
      await value("select has_function_privilege('service_role', 'public.erp_load_state(text)', 'execute')"),
      true,
    );
  });

  await test("erp_load_state returns screen parts in one call", async () => {
    const full = await value<Record<string, unknown>>("select public.erp_load_state(null)");
    assert.equal(typeof full, "object");
    assert.ok(full);
    for (const key of [
      "settings",
      "categories",
      "suppliers",
      "warehouses",
      "locations",
      "channels",
      "products",
      "packs",
      "productPacks",
      "stock",
      "recipes",
      "dishes",
      "writeoffReasons",
      "costSources",
      "locations",
    ]) {
      assert.ok(key in full, key);
    }
    const stock = await value<Record<string, unknown>>("select public.erp_load_state($1)", ["stock,products"]);
    assert.deepEqual(Object.keys(stock).sort(), ["products", "stock"]);
  });

  await test("pack parsing never guesses", async () => {
    const parse = async (pack: string) => q<{ base_unit: string; qty: string }>("select * from public.erp_parse_pack($1)", [pack]);
    assert.deepEqual((await parse("5 kg")).map((r) => [r.base_unit, n(r.qty)]), [["kg", 5]]);
    assert.deepEqual((await parse("10*1040 g")).map((r) => [r.base_unit, n(r.qty)]), [["kg", 10.4]]);
    assert.deepEqual((await parse("10 000 pcs")).map((r) => [r.base_unit, n(r.qty)]), [["pcs", 10000]]);
    assert.deepEqual((await parse("1 L")).map((r) => [r.base_unit, n(r.qty)]), [["l", 1]]);
    assert.equal((await parse("13-15 kg")).length, 0);
    assert.equal((await parse("")).length, 0);
  });

  const catalog = DEFAULT_STAFF_CATALOG;
  await test("staff catalog import is repeatable and keeps ids", async () => {
    const first = await value<Record<string, number>>("select public.erp_sync_staff_catalog($1::jsonb, $2)", [
      JSON.stringify(catalog),
      ACTOR,
    ]);
    assert.equal(first.created, catalog.items.length);
    const counts = async () =>
      one<Record<string, string>>(
        `select (select count(*) from public.erp_products) p, (select count(*) from public.erp_categories) c,
                (select count(*) from public.erp_suppliers) s, (select count(*) from public.erp_product_packs) k,
                (select count(*) from public.erp_legacy_map) m`,
      );
    const before = await counts();
    const second = await value<Record<string, number>>("select public.erp_sync_staff_catalog($1::jsonb, $2)", [
      JSON.stringify(catalog),
      ACTOR,
    ]);
    assert.equal(second.created, 0);
    assert.equal(second.updated, catalog.items.length);
    assert.deepEqual(await counts(), before);
    const missing = await value<number>(
      "select count(*) from jsonb_array_elements($1::jsonb) x where not exists (select 1 from public.erp_products where code = x->>'id')",
      [JSON.stringify(catalog.items)],
    );
    assert.equal(n(missing), 0);
  });

  await test("staff catalog export matches the Staff format", async () => {
    const exported = await value<unknown>("select public.erp_staff_catalog()");
    const clean: StaffCatalog | null = sanitizeStaffCatalog(exported);
    assert.ok(clean, "export passes sanitizeStaffCatalog");
    assert.deepEqual(
      clean!.items.map((i) => i.id),
      catalog.items.map((i) => i.id),
    );
    for (const [index, item] of catalog.items.entries()) {
      const out: StaffCatalog["items"][number] = clean!.items[index];
      assert.equal(out.name, item.name, item.id);
      assert.equal(out.nameVn, item.nameVn, item.id);
      assert.equal(out.unit, item.unit, item.id);
      assert.equal(out.pack ?? "", item.pack ?? "", item.id);
      assert.equal(out.supplier, item.supplier, item.id);
      assert.equal(out.category, item.category, item.id);
    }
    assert.deepEqual(
      clean!.suppliers.map((s) => s.id),
      catalog.suppliers.map((s) => s.id),
    );
  });

  await test("staff admin 'EN / VN' single name is split and round-trips", async () => {
    const edited = structuredClone(catalog);
    edited.items.push({
      id: "test-beef-mince",
      category: edited.categories[0].id,
      name: "Beef mince / Thịt bò xay",
      nameVn: "Beef mince / Thịt bò xay",
      unit: "kg",
      pack: "1 kg",
      supplier: edited.suppliers[0].id,
    });
    await q("select public.erp_sync_staff_catalog($1::jsonb, $2)", [JSON.stringify(edited), ACTOR]);
    const row = await one<{ name_en: string; name_vn: string; base_unit: string }>(
      "select name_en, name_vn, base_unit from public.erp_products where code = 'test-beef-mince'",
    );
    assert.deepEqual(row, { name_en: "Beef mince", name_vn: "Thịt bò xay", base_unit: "kg" });
    // Removing it from the Staff list only unlists it.
    await q("select public.erp_sync_staff_catalog($1::jsonb, $2)", [JSON.stringify(catalog), ACTOR]);
    const after = await one<{ staff_listed: boolean; archived_at: unknown }>(
      "select staff_listed, archived_at from public.erp_products where code = 'test-beef-mince'",
    );
    assert.deepEqual(after, { staff_listed: false, archived_at: null });
  });

  await test("recipes import is repeatable; ambiguous ingredients go to review", async () => {
    const first = await value<Record<string, number>>("select public.erp_import_recipes($1::jsonb, $2)", [
      JSON.stringify(RECIPES),
      ACTOR,
    ]);
    const preps = RECIPES.filter((r) => r.kind === "prep").length;
    assert.equal(first.created, preps);
    const lines = n(await value("select count(*) from public.erp_recipe_lines"));
    const second = await value<Record<string, number>>("select public.erp_import_recipes($1::jsonb, $2)", [
      JSON.stringify(RECIPES),
      ACTOR,
    ]);
    assert.equal(second.created, 0);
    assert.equal(second.refreshed, preps);
    assert.equal(n(await value("select count(*) from public.erp_recipes")), preps);
    assert.equal(n(await value("select count(*) from public.erp_recipe_lines")), lines);
    assert.ok(n(await value("select count(*) from public.erp_recipe_lines where product_id is null"))! > 0);
    await expectError(
      q("select public.erp_activate_recipe(id, $1) from public.erp_recipes limit 1", [ACTOR]),
      "ERP_RECIPE_UNRESOLVED",
    );
  });

  // ---- First working cycle: beef -> patties -> Online Kitchen -> burger ----
  const warehouse = await wh("warehouse");
  const prep = await wh("prep-kitchen");
  const online = await wh("online-kitchen");

  const beef = await saveProduct({ type: "ingredient", name_en: "Beef chuck", name_vn: "Thịt bò vai", base_unit: "kg" });
  const salt = await saveProduct({ type: "ingredient", name_en: "Salt test", name_vn: "Muối", base_unit: "kg" });
  const bun = await saveProduct({ type: "ingredient", name_en: "Burger bun", name_vn: "Bánh burger", base_unit: "pcs" });
  const box = await saveProduct({ type: "packaging", name_en: "Burger box test", name_vn: "Hộp burger", base_unit: "pcs" });
  const patty = await saveProduct({
    type: "semi_finished",
    name_en: "Beef patty",
    name_vn: "Chả bò",
    base_unit: "pcs",
    shelf_life_days: 3,
  });

  let receipt1 = "";
  await test("receipt directly into Prep Kitchen", async () => {
    receipt1 = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [
        { product_id: beef, qty: 10, unit_price: 200000 },
        { product_id: salt, qty: 1, unit_price: 10000 },
      ],
    });
    assert.equal(await stock(beef, prep), 0, "draft does not change stock");
    const res = await post(receipt1);
    assert.equal(n(res.total_cost), 2010000);
    assert.equal(await stock(beef, prep), 10);
    assert.equal(n(await value("select est_unit_cost from public.erp_products where id = $1", [beef])), 200000);
  });

  await test("re-posting is rejected and creates no duplicates", async () => {
    await expectError(post(receipt1), "ERP_ALREADY_POSTED");
    assert.equal(await stock(beef, prep), 10);
    assert.equal(n(await value("select count(*) from public.erp_lots where source_document_id = $1", [receipt1])), 2);
    await expectError(saveDoc({ id: receipt1, lines: [] }), "ERP_DOCUMENT_LOCKED");
  });

  let transferBeef = "";
  await test("transfer keeps the cost of the transferred lot", async () => {
    const r2 = await saveDoc({ doc_type: "receipt", warehouse_id: warehouse, lines: [{ product_id: beef, qty: 5, unit_price: 260000 }] });
    await post(r2);
    transferBeef = await saveDoc({
      doc_type: "transfer",
      warehouse_id: warehouse,
      target_warehouse_id: prep,
      lines: [{ product_id: beef, qty: 5 }],
    });
    const res = await post(transferBeef);
    assert.equal(n(res.total_cost), 1300000);
    assert.equal(await stock(beef, warehouse), 0);
    assert.equal(await stock(beef, prep), 15);
    assert.equal(await stock(beef, online), 0, "raw beef never appears in Online Kitchen by itself");
    const costs = await q<{ unit_cost: string }>(
      "select unit_cost from public.erp_lots where product_id = $1 and warehouse_id = $2 order by received_at",
      [beef, prep],
    );
    assert.deepEqual(costs.map((c) => n(c.unit_cost)), [200000, 260000]);
  });

  let recipe = "";
  await test("semi-finished recipe with versions and no cycles", async () => {
    recipe = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({
        product_id: patty,
        yield_qty: 6,
        shelf_life_days: 3,
        lines: [
          { product_id: beef, qty: 1 },
          { product_id: salt, qty: 0.01 },
        ],
      }),
      ACTOR,
    ]);
    await expectError(
      q("select public.erp_save_recipe($1::jsonb, $2)", [
        JSON.stringify({ id: recipe, yield_qty: 6, lines: [{ product_id: patty, qty: 1 }] }),
        ACTOR,
      ]),
      "ERP_RECIPE_CYCLE",
    );
    await q("select public.erp_activate_recipe($1, $2)", [recipe, ACTOR]);
    // Indirect cycle: patty -> sauce -> patty.
    const sauce = await saveProduct({ type: "semi_finished", name_en: "Cycle sauce", base_unit: "kg" });
    await q("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: sauce, yield_qty: 1, lines: [{ product_id: patty, qty: 1 }] }),
      ACTOR,
    ]);
    await expectError(
      q("select public.erp_save_recipe($1::jsonb, $2)", [
        JSON.stringify({ id: recipe, yield_qty: 6, lines: [{ product_id: sauce, qty: 1 }] }),
        ACTOR,
      ]),
      "ERP_RECIPE_CYCLE",
    );
    // Editing an active recipe creates version 2 and keeps version 1 untouched.
    const v2 = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ id: recipe, yield_qty: 6, lines: [{ product_id: beef, qty: 1.05 }, { product_id: salt, qty: 0.01 }] }),
      ACTOR,
    ]);
    assert.notEqual(v2, recipe);
    assert.equal(n(await value("select version from public.erp_recipes where id = $1", [v2])), 2);
    assert.equal(await value("select status from public.erp_recipes where id = $1", [recipe]), "active");
  });

  let batch1 = "";
  await test("production: actual consumption and yield, cost carried to the batch", async () => {
    batch1 = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: prep,
      recipe_id: recipe,
      output_product_id: patty,
      plan_output_qty: 12,
      output_qty: 13,
      output_pieces: 13,
      output_weight_kg: 1.95,
      responsible: "Cook A",
      lines: [
        { product_id: beef, planned_qty: 2, qty: 2.1 },
        { product_id: salt, planned_qty: 0.02, qty: 0.02 },
      ],
    });
    const res = await post(batch1);
    assert.equal(n(res.total_cost), 420200);
    const doc = await one<Record<string, unknown>>("select * from public.erp_documents where id = $1", [batch1]);
    assert.equal(n(doc.output_unit_cost), 32323.076923);
    assert.ok(doc.batch_no);
    assert.ok(doc.expires_at, "expiry from shelf life");
    assert.equal(await stock(patty, prep), 13);
    assert.ok(Math.abs((await stock(beef, prep))! - 12.9) < 1e-9);
  });

  await test("insufficient stock blocks posting and changes nothing", async () => {
    const lotsBefore = await q("select id, qty_left from public.erp_lots order by id");
    const movesBefore = n(await value("select count(*) from public.erp_movements"));
    const big = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: prep,
      output_product_id: patty,
      output_qty: 100,
      lines: [
        { product_id: salt, qty: 0.01 },
        { product_id: beef, qty: 50 },
      ],
    });
    await expectError(post(big), "ERP_INSUFFICIENT_STOCK");
    assert.deepEqual(await q("select id, qty_left from public.erp_lots order by id"), lotsBefore);
    assert.equal(n(await value("select count(*) from public.erp_movements")), movesBefore);
    assert.equal(await value("select status from public.erp_documents where id = $1", [big]), "draft");
    await q("select public.erp_delete_draft($1, $2)", [big, ACTOR]);
  });

  let transferPatty = "";
  await test("patties move to Online Kitchen with their batch cost", async () => {
    transferPatty = await saveDoc({
      doc_type: "transfer",
      warehouse_id: prep,
      target_warehouse_id: online,
      lines: [{ product_id: patty, qty: 10 }],
    });
    await post(transferPatty);
    const lot = await one<Record<string, unknown>>(
      "select unit_cost, batch_no, expires_at, origin_lot_id from public.erp_lots where product_id = $1 and warehouse_id = $2",
      [patty, online],
    );
    assert.equal(n(lot.unit_cost), 32323.076923);
    assert.ok(lot.batch_no && lot.origin_lot_id);
  });

  await test("posted batch keeps its cost after new prices", async () => {
    const r3 = await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: beef, qty: 20, unit_price: 300000 }] });
    await post(r3);
    const b2 = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: prep,
      output_product_id: patty,
      output_qty: 6,
      lines: [{ product_id: beef, qty: 13 }],
    });
    await post(b2);
    assert.equal(n(await value("select output_unit_cost from public.erp_documents where id = $1", [batch1])), 32323.076923);
    assert.equal(n(await value("select total_cost from public.erp_documents where id = $1", [batch1])), 420200);
    // 12.9 kg of the 200k/260k lots, then 0.1 kg of the 300k lot.
    const expected = (7.9 * 200000 + 5 * 260000 + 0.1 * 300000) / 6;
    assert.ok(Math.abs(n(await value("select output_unit_cost from public.erp_documents where id = $1", [b2]))! - expected) < 0.01);
    await cancel(b2);
  });

  await test("unknown cost stays unknown, never zero", async () => {
    const ketchup = await saveProduct({ type: "ingredient", name_en: "Ketchup test", base_unit: "kg" });
    const opening = await saveDoc({ doc_type: "opening", warehouse_id: prep, lines: [{ product_id: ketchup, qty: 3 }] });
    const res = await post(opening);
    assert.equal(res.cost_known, false);
    assert.equal(res.total_cost, null);
    const sauce = await saveProduct({ type: "semi_finished", name_en: "Burger sauce test", base_unit: "kg" });
    const batch = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: prep,
      output_product_id: sauce,
      output_qty: 1,
      lines: [
        { product_id: ketchup, qty: 1 },
        { product_id: salt, qty: 0.01 },
      ],
    });
    const out = await post(batch);
    assert.equal(out.cost_known, false);
    assert.equal(out.total_cost, null);
    assert.equal(await value("select output_unit_cost from public.erp_documents where id = $1", [batch]), null);
    assert.equal(
      await value("select unit_cost from public.erp_lots where source_document_id = $1 and product_id = $2", [batch, sauce]),
      null,
    );
  });

  await test("cancel keeps history and never breaks dependent documents", async () => {
    await expectError(cancel(receipt1), "ERP_CANCEL_BLOCKED");
    await expectError(cancel(batch1), "ERP_CANCEL_BLOCKED");
    await expectError(q("select public.erp_cancel_document($1, $2, '')", [transferPatty, ACTOR]), "ERP_REASON_REQUIRED");
    await cancel(transferPatty, "wrong quantity");
    assert.equal(await stock(patty, online), 0);
    assert.equal(await stock(patty, prep), 13);
    await cancel(batch1, "re-enter batch");
    assert.equal(await stock(patty, prep), 0);
    const doc = await one<Record<string, unknown>>("select status, cancelled_by, cancel_reason from public.erp_documents where id = $1", [batch1]);
    assert.deepEqual(doc, { status: "cancelled", cancelled_by: ACTOR, cancel_reason: "re-enter batch" });
    assert.ok(n(await value("select count(*) from public.erp_movements where document_id = $1 and reversal_of is not null", [batch1]))! > 0);
    await expectError(cancel(batch1), "ERP_NOT_POSTED");
    await expectError(q("update public.erp_movements set qty = 1"), "ERP_LEDGER_IMMUTABLE");
  });

  await test("write-off without a reason posts (shown as 'No reason'); count posts the difference", async () => {
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, lines: [{ product_id: salt, qty: 0.1 }] });
    await post(wo);
    const posted = await one<{ reason: string | null; reason_id: string | null }>("select reason, reason_id from public.erp_documents where id = $1", [wo]);
    assert.deepEqual([posted.reason, posted.reason_id], [null, null]);
    const before = (await stock(salt, prep))!;
    const count = await saveDoc({ doc_type: "count", warehouse_id: prep, lines: [{ product_id: salt, qty: 0.5 }] });
    await post(count);
    assert.equal(await stock(salt, prep), 0.5);
    const line = await one<Record<string, unknown>>("select system_qty, diff_qty from public.erp_document_lines where document_id = $1", [count]);
    assert.equal(n(line.system_qty), before);
    assert.ok(Math.abs(n(line.diff_qty)! - (0.5 - before)) < 1e-9);
  });

  await test("input VAT: recoverable VAT is excluded from cost", async () => {
    await q("update public.erp_settings set input_vat_enabled = true, default_input_vat_rate = 10");
    const r = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      prices_include_vat: true,
      lines: [{ product_id: bun, qty: 10, unit_price: 11000 }],
    });
    await post(r);
    const line = await one<Record<string, unknown>>(
      "select net_amount, vat_amount, gross_amount, unit_cost from public.erp_document_lines where document_id = $1",
      [r],
    );
    assert.deepEqual(
      [n(line.net_amount), n(line.vat_amount), n(line.gross_amount), n(line.unit_cost)],
      [100000, 10000, 110000, 10000],
    );
    await q("update public.erp_settings set input_vat_enabled = false");
  });

  await test("product with stock cannot be archived; base unit locked once used", async () => {
    await expectError(q("select public.erp_set_archived('product', $1, true, $2)", [beef, ACTOR]), "ERP_HAS_STOCK");
    await expectError(saveProduct({ id: beef, type: "ingredient", name_en: "Beef chuck", base_unit: "l" }), "ERP_UNIT_LOCKED");
    await q("select public.erp_set_archived('product', $1, true, $2)", [box, ACTOR]);
    await expectError(
      saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: box, qty: 1 }] }).then(post),
      "ERP_PRODUCT_ARCHIVED",
    );
    await q("select public.erp_set_archived('product', $1, false, $2)", [box, ACTOR]);
  });

  await test("dish save is pure calculation data (no stock change)", async () => {
    const movesBefore = n(await value("select count(*) from public.erp_movements"));
    await value("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({
        name_en: "Beef burger",
        name_vn: "Burger bò",
        sale_price: 120000,
        lines: [
          { product_id: patty, qty: 1 },
          { product_id: bun, qty: 1 },
          { product_id: box, qty: 1 },
        ],
      }),
      ACTOR,
    ]);
    assert.equal(n(await value("select count(*) from public.erp_movements")), movesBefore);
  });

  await test("warehouses: create, rename, no duplicates, archive only when empty", async () => {
    const id = await value<string>("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [
      JSON.stringify({ name: "Event Stand", kind: "other" }),
      ACTOR,
    ]);
    await expectError(
      q("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ name: "event stand" }), ACTOR]),
      "erp_warehouses_name_uidx",
    );
    await q("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ id, name: "Event Stand 2" }), ACTOR]);
    await q("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [
      JSON.stringify({ id, name: "Event Stand 2", address: "Stand street 1", phone: "+84 11 111 11 11" }),
      ACTOR,
    ]);
    const contact = await one<{ address: string; phone: string }>("select address, phone from public.erp_warehouses where id = $1", [id]);
    assert.equal(contact.address, "Stand street 1");
    assert.equal(contact.phone, "+84 11 111 11 11");
    await q("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ id, name: "Event Stand 3" }), ACTOR]);
    const kept = await one<{ name: string; address: string }>("select name, address from public.erp_warehouses where id = $1", [id]);
    assert.equal(kept.name, "Event Stand 3");
    assert.equal(kept.address, "Stand street 1", "name-only save keeps address");
    const prepContact = await one<{ address: string; phone: string }>(
      "select address, phone from public.erp_warehouses where code = 'prep-kitchen'",
    );
    assert.match(prepContact.address, /Mường Thanh Viễn Triều/);
    assert.equal(prepContact.phone, "+84 98 863 15 07");
    await q("select public.erp_set_archived('warehouse', $1, true, $2)", [id, ACTOR]);
    await expectError(q("select public.erp_set_archived('warehouse', $1, true, $2)", [prep, ACTOR]), "ERP_HAS_STOCK");
    await q("select public.erp_save_settings($1::jsonb, $2)", [JSON.stringify({ output_vat_enabled: true, default_output_vat_rate: 8 }), ACTOR]);
    assert.equal(n(await value("select default_output_vat_rate from public.erp_settings")), 8);
  });

  await test("burger costing: food vs packaging, VAT, commission, incomplete marking", async () => {
    const load = async () => {
      const products = (await q<Record<string, unknown>>("select * from public.erp_products")).map((p) => ({
        id: p.id as string,
        type: p.type as CostProduct["type"],
        name_en: p.name_en as string,
        name_vn: p.name_vn as string,
        base_unit: p.base_unit as CostProduct["base_unit"],
        est_unit_cost: n(p.est_unit_cost),
        est_cost_source: p.est_cost_source as CostProduct["est_cost_source"],
      }));
      const recipes = (await q<Record<string, unknown>>("select * from public.erp_recipes")).map(async (r) => ({
        id: r.id as string,
        product_id: r.product_id as string,
        status: r.status as CostRecipe["status"],
        yield_qty: n(r.yield_qty),
        lines: (await q<Record<string, unknown>>("select product_id, qty from public.erp_recipe_lines where recipe_id = $1 order by line_no", [r.id])).map(
          (l) => ({ product_id: l.product_id as string | null, qty: n(l.qty) }),
        ),
      }));
      return buildCostContext(products, await Promise.all(recipes));
    };
    const dishLines = (ctx: ReturnType<typeof buildCostContext>) => [
      costLine(ctx, patty, 1),
      costLine(ctx, bun, 1),
      costLine(ctx, box, 1),
    ];

    let summary = summarize(dishLines(await load()));
    assert.equal(summary.complete, false);
    assert.equal(summary.totalCost, null);
    assert.equal(summary.packagingCost, null);
    assert.deepEqual(summary.missing, ["Burger box test"]);
    const pattyLine = summary.lines[0];
    assert.equal(pattyLine.source, "recipe");
    assert.equal(pattyLine.children?.length, 2);
    assert.ok(Math.abs(pattyLine.cost! - (300000 * 1 + 10000 * 0.01) / 6) < 1e-6);

    await saveProduct({ id: box, type: "packaging", name_en: "Burger box test", name_vn: "Hộp burger", base_unit: "pcs", est_unit_cost: 2000 });
    assert.equal(await value("select est_cost_source from public.erp_products where id = $1", [box]), "manual");
    summary = summarize(dishLines(await load()));
    const food = (300000 + 100) / 6 + 10000;
    assert.equal(summary.complete, true);
    assert.ok(Math.abs(summary.foodCost! - food) < 1e-6);
    assert.equal(summary.packagingCost, 2000);

    const settings = { output_vat_enabled: true, default_output_vat_rate: 8 };
    const direct = channelResult(summary, { id: "d", name: "Direct", commission_pct: 0, price: 120000 }, settings, null);
    const net = 120000 / 1.08;
    assert.ok(direct.complete);
    assert.ok(Math.abs(direct.netRevenue! - net) < 1e-6);
    assert.ok(Math.abs(direct.grossProfit! - (net - food - 2000)) < 1e-6);
    assert.ok(Math.abs(direct.foodCostPct! - (food / net) * 100) < 1e-9);
    // Poster KB: food cost % = cost / sale price × 100 (price as printed, not net of VAT)
    assert.ok(Math.abs(direct.foodCostOnPricePct! - (food / 120000) * 100) < 1e-9);
    assert.ok(Math.abs(direct.totalCostPct! - ((food + 2000) / net) * 100) < 1e-9);
    const total = food + 2000;
    // markupPct = (netRevenue − totalCost) / totalCost × 100
    assert.ok(Math.abs(direct.markupPct! - ((net - total) / total) * 100) < 1e-9);
    // foodMarkupPct = (netRevenue − foodCost) / foodCost × 100
    assert.ok(Math.abs(direct.foodMarkupPct! - ((net - food) / food) * 100) < 1e-9);

    const grab = channelResult(summary, { id: "g", name: "Grab Food", commission_pct: 25, price: 150000 }, settings, null);
    assert.ok(Math.abs(grab.grossProfit! - (150000 / 1.08 - 37500 - food - 2000)) < 1e-6);
    const unset = channelResult(summary, { id: "s", name: "Shopee Food", commission_pct: null, price: 150000 }, settings, null);
    assert.equal(unset.complete, false);
    assert.equal(unset.grossProfit, null);
    assert.deepEqual(unset.issues, ["no_commission"]);
  });

  await test("losses: stored on products and recipe/dish lines, gross stays the stock amount", async () => {
    const apple = await saveProduct({ type: "ingredient", name_en: "Apple loss test", base_unit: "kg", loss_clean_pct: 26 });
    assert.equal(n(await value("select loss_clean_pct from public.erp_products where id = $1", [apple])), 26);
    await saveProduct({ id: apple, type: "ingredient", name_en: "Apple loss test", base_unit: "kg" });
    assert.equal(n(await value("select loss_clean_pct from public.erp_products where id = $1", [apple])), 26, "omitted loss is kept");
    await expectError(saveProduct({ id: apple, type: "ingredient", name_en: "Apple loss test", base_unit: "kg", loss_fry_pct: 100 }), "check");

    const pie = await saveProduct({ type: "semi_finished", name_en: "Apple pie loss test", base_unit: "kg" });
    const recipe = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: pie, yield_qty: 1, lines: [{ product_id: apple, qty: 1.351, net_qty: 1, methods: ["clean", "clean"] }] }),
      ACTOR,
    ]);
    const line = await one<{ qty: string; net_qty: string; methods: string[] }>(
      "select qty, net_qty, methods from public.erp_recipe_lines where recipe_id = $1",
      [recipe],
    );
    assert.deepEqual([n(line.qty), n(line.net_qty), line.methods], [1.351, 1, ["clean"]]);
    await expectError(
      q("select public.erp_save_recipe($1::jsonb, $2)", [JSON.stringify({ id: recipe, product_id: pie, yield_qty: 1, lines: [{ product_id: apple, qty: 1, methods: ["smoke"] }] }), ACTOR]),
      "check",
    );

    const dish = await value<string>("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({ name_en: "Apple dish loss test", lines: [{ product_id: apple, qty: 0.2, net_qty: 0.148, methods: ["clean"] }] }),
      ACTOR,
    ]);
    const dl = await one<{ qty: string; net_qty: string; methods: string[] }>("select qty, net_qty, methods from public.erp_dish_lines where dish_id = $1", [dish]);
    assert.deepEqual([n(dl.qty), n(dl.net_qty), dl.methods], [0.2, 0.148, ["clean"]]);
    const old = await value<string>("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({ name_en: "Dish without losses", lines: [{ product_id: apple, qty: 0.3 }] }),
      ACTOR,
    ]);
    const ol = await one<{ net_qty: string | null; methods: string[] }>("select net_qty, methods from public.erp_dish_lines where dish_id = $1", [old]);
    assert.deepEqual([ol.net_qty, ol.methods], [null, []]);
  });

  await test("movement report: opening, in, out, closing with cancellations and dates", async () => {
    const w = await value<string>("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ name: "Report test", kind: "other" }), ACTOR]);
    const salt = await saveProduct({ type: "ingredient", name_en: "Salt report test", base_unit: "kg" });
    const receipt = (date: string, qty: number, price: number) =>
      saveDoc({ doc_type: "receipt", doc_date: date, warehouse_id: w, lines: [{ product_id: salt, qty, unit_price: price }] }).then(post);
    await receipt("2026-10-01", 10, 1000);
    await receipt("2026-10-05", 5, 2000);
    const wo = await saveDoc({ doc_type: "writeoff", doc_date: "2026-10-06", warehouse_id: w, reason: "spoiled", lines: [{ product_id: salt, qty: 4 }] });
    await post(wo);
    const bad = await saveDoc({ doc_type: "receipt", doc_date: "2026-10-07", warehouse_id: w, lines: [{ product_id: salt, qty: 3, unit_price: 500 }] });
    await post(bad);
    await cancel(bad);
    await receipt("2026-11-01", 1, 3000);

    const report = async (from: string, to: string) =>
      one<Record<string, string | null>>("select * from public.erp_movement_report($1::date, $2::date, $3) where product_id = $4", [from, to, w, salt]);
    const r = await report("2026-10-03", "2026-10-31");
    assert.deepEqual(
      [r.opening_qty, r.opening_value, r.in_qty, r.in_value, r.out_qty, r.out_value, r.closing_qty, r.closing_value].map(n),
      [10, 10000, 5, 10000, 4, 4000, 11, 16000],
    );
    const all = await report("2026-01-01", "2026-12-31");
    assert.deepEqual([all.opening_qty, all.in_qty, all.out_qty, all.closing_qty].map(n), [0, 16, 4, 12]);
    assert.equal(n(all.closing_value), 19000);
    const other = await q("select * from public.erp_movement_report('2026-01-01', '2026-12-31', $1) where product_id = $2", [prep, salt]);
    assert.equal(other.length, 0, "filtered by warehouse");
    const json = await value<Record<string, unknown>[]>("select public.erp_movement_report_json('2026-10-03', '2026-10-31', $1)", [w]);
    assert.deepEqual(json.map((row) => [row.product_id, row.closing_qty, row.closing_value]), [[salt, 11, 16000]]);
  });

  // ---- Stock fixes: brands, categories on re-import, packs, default receipt location, full cycle ----

  await test("staff re-import keeps a corrected category; a real source change still applies", async () => {
    const fries = await one<{ id: string; category_id: string; staff_category: string }>(
      "select id, category_id, staff_category from public.erp_products where name_en = 'French Fries'",
    );
    const source = catalog.items.find((i) => i.name === "French Fries")!;
    assert.equal(fries.staff_category, source.category);
    const counts = async () =>
      one<Record<string, string>>("select (select count(*) from public.erp_products) p, (select count(*) from public.erp_product_packs) k");
    const before = await counts();
    const fixed = await value<string>("select id from public.erp_categories where code = 'fruits-vegetables'");
    await q("update public.erp_products set category_id = $1 where id = $2", [fixed, fries.id]);
    const sync = (c: StaffCatalog) => q("select public.erp_sync_staff_catalog($1::jsonb, $2)", [JSON.stringify(c), ACTOR]);

    await sync(catalog);
    assert.equal(await value("select category_id from public.erp_products where id = $1", [fries.id]), fixed, "same source keeps the fix");
    assert.deepEqual(await counts(), before, "no duplicates");

    const moved: StaffCatalog = { ...catalog, items: catalog.items.map((i) => (i.id === source.id ? { ...i, category: "pantry" } : i)) };
    await sync(moved);
    const pantry = await value<string>("select id from public.erp_categories where code = 'pantry'");
    assert.equal(await value("select category_id from public.erp_products where id = $1", [fries.id]), pantry, "a changed source applies");

    // Imported before staff_category existed: the ERP category wins, the source is only recorded.
    await q("update public.erp_products set category_id = $1, staff_category = null where id = $2", [fixed, fries.id]);
    await sync(catalog);
    const after = await one<{ category_id: string; staff_category: string }>("select category_id, staff_category from public.erp_products where id = $1", [fries.id]);
    assert.deepEqual([after.category_id, after.staff_category], [fixed, source.category]);
    assert.deepEqual(await counts(), before);
  });

  await test("brands: same name, different brands stay separate and distinguishable", async () => {
    const rows = await q<{ id: string; name_en: string; name_vn: string; brand: string; code: string }>(
      "select id, name_en, name_vn, brand, code from public.erp_products where name_en = 'Cheese - Mozzarella' order by brand",
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.brand), ["Golden Pizza", "Mlekpol"]);
    const titles = rows.map((r) => productTitle(r));
    assert.notEqual(titles[0], titles[1]);
    assert.ok(titles[1].endsWith(" · Mlekpol"), titles[1]);
    assert.equal(productTitle({ name_en: "Salt", name_vn: "Muối", brand: null }), "Salt");
    assert.equal(productTitle({ name_en: "Salt", name_vn: "Salt", brand: "  " }), "Salt");
    await q("select public.erp_sync_staff_catalog($1::jsonb, $2)", [JSON.stringify(catalog), ACTOR]);
    const again = await q<{ id: string }>("select id from public.erp_products where name_en = 'Cheese - Mozzarella' order by brand");
    assert.deepEqual(again.map((r) => r.id), rows.map((r) => r.id), "ids unchanged by re-import");
  });

  await test("pack labels: readable in each language, unknown patterns unchanged, never guessed", async () => {
    const ru: PackWords = {
      container: (c) => ({ box: "Коробка", pack: "Пачка", pcs: "Упаковка", btl: "Бутылка", can: "Банка", bag: "Мешок" })[c],
      unit: (u) => ({ g: "г", kg: "кг", ml: "мл", l: "л", pcs: "шт" })[u],
      num: (v) => new Intl.NumberFormat("ru-RU").format(v).replace(/\s/g, " "),
    };
    const en: PackWords = { container: (c) => ({ box: "Box", pack: "Pack", pcs: "Unit", btl: "Bottle", can: "Can", bag: "Bag" })[c], unit: (u) => u, num: (v) => v.toLocaleString("en-US") };
    assert.equal(formatPackLabel("pcs 1 L", ru), "Упаковка: 1 л");
    assert.equal(formatPackLabel("box 10*1040 g", ru), "Коробка: 10 × 1 040 г");
    assert.equal(formatPackLabel("box 10*1040 g", en), "Box: 10 × 1,040 g");
    assert.equal(formatPackLabel("pack 100 pcs", ru), "Пачка: 100 шт");
    assert.equal(formatPackLabel("box 13-15 kg", ru), "Коробка: 13–15 кг");
    assert.equal(formatPackLabel("kg 1 kg", ru), "1 кг");
    assert.equal(formatPackLabel("pcs 10 000 pcs", ru), "Упаковка: 10 000 шт");
    for (const raw of ["Коробка большая", "box ~5 kg", "box 5 lb", "tray 6 pcs", "", "5 kg"]) assert.equal(formatPackLabel(raw, ru), raw);
    // Every pack the import created reads cleanly and its label agrees with the stored coefficient.
    const packs = await q<{ label: string; qty_base: string; base_unit: string }>(
      "select k.label, k.qty_base, p.base_unit from public.erp_product_packs k join public.erp_products p on p.id = k.product_id where p.staff_listed",
    );
    assert.ok(packs.length > 50);
    const toBase: Record<string, number> = { g: 0.001, kg: 1, ml: 0.001, l: 1, pcs: 1 };
    for (const pack of packs) {
      const parsed = parsePackLabel(pack.label);
      assert.ok(parsed && parsed.sizeTo === null, `unreadable stored pack: ${pack.label}`);
      const total = (parsed.count ?? 1) * parsed.size * toBase[parsed.unit];
      assert.ok(Math.abs(total - n(pack.qty_base)!) < 1e-6, `${pack.label} vs ${pack.qty_base}`);
    }
  });

  await test("receipt location: Prep by default, explicit wins, never Warehouse, none without Prep", async () => {
    const list = await q<{ id: string; kind: string; archived_at: string | null }>("select id, kind, archived_at from public.erp_warehouses");
    const main = list.find((w) => w.kind === "warehouse")!.id;
    assert.deepEqual(initialWarehouses("receipt", list, null), { warehouse_id: prep, target_warehouse_id: null });
    assert.equal(initialWarehouses("receipt", list, online).warehouse_id, online, "explicit location wins");
    assert.equal(initialWarehouses("receipt", list, main).warehouse_id, main, "explicit Warehouse is allowed");
    assert.equal(initialWarehouses("receipt", list, "00000000-0000-0000-0000-000000000000").warehouse_id, prep, "unknown id falls back to Prep");
    const noPrep = list.map((w) => (w.kind === "prep_kitchen" ? { ...w, archived_at: "2026-11-01" } : w));
    assert.equal(initialWarehouses("receipt", noPrep, null).warehouse_id, null, "no active Prep: the user must choose");
    assert.equal(initialWarehouses("receipt", noPrep, prep).warehouse_id, null, "an archived Prep is not offered");
    assert.equal(initialWarehouses("receipt", list.filter((w) => w.kind !== "prep_kitchen"), null).warehouse_id, null);
    // Other documents keep their old defaults.
    assert.deepEqual(initialWarehouses("transfer", list, null), { warehouse_id: main, target_warehouse_id: prep });
    assert.equal(initialWarehouses("writeoff", list, null).warehouse_id, main);
    assert.equal(initialWarehouses("count", list, online).warehouse_id, online);
    assert.equal(n(await value("select count(*) from public.erp_warehouses")), list.length, "no location created");

    // A saved draft keeps its location when the supplier and lines change.
    const supplier = await value<string>("select id from public.erp_suppliers order by code limit 1");
    const draft = await saveDoc({ doc_type: "receipt", warehouse_id: online, lines: [{ product_id: salt, qty: 1, unit_price: 1000 }] });
    await saveDoc({ id: draft, warehouse_id: online, supplier_id: supplier, lines: [{ product_id: salt, qty: 1, unit_price: 1000 }, { product_id: beef, qty: 2, unit_price: 5000 }] });
    const saved = await one<{ warehouse_id: string; supplier_id: string; status: string }>("select warehouse_id, supplier_id, status from public.erp_documents where id = $1", [draft]);
    assert.deepEqual([saved.warehouse_id, saved.supplier_id, saved.status], [online, supplier, "draft"]);
    await q("delete from public.erp_document_lines where document_id = $1", [draft]);
    await q("delete from public.erp_documents where id = $1", [draft]);
  });

  await test("packs convert quantity and cost correctly", async () => {
    const mozz = await value<string>("select id from public.erp_products where name_en = 'Cheese - Mozzarella' and brand = 'Mlekpol'");
    const pack = await one<{ id: string; label: string; qty_base: string }>("select id, label, qty_base from public.erp_product_packs where product_id = $1", [mozz]);
    assert.equal(pack.label, "box 5*2 kg");
    const qtyBase = n(pack.qty_base)!;
    assert.equal(qtyBase, 10);
    const qty = packToBase(3, qtyBase);
    assert.equal(qty, 30);
    assert.equal(packPrice(150000, qtyBase), 1500000, "price per box from price per kg");
    assert.equal(packToBase(1.5, 10.4), 15.6);
    const doc = await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: mozz, pack_id: pack.id, pack_qty: 3, qty, unit_price: 150000 }] });
    const res = await post(doc);
    assert.equal(n(res.total_cost), 4500000);
    const line = await one<Record<string, string>>("select qty, pack_qty, unit_cost, cost_amount from public.erp_document_lines where document_id = $1", [doc]);
    assert.deepEqual([line.qty, line.pack_qty, line.unit_cost, line.cost_amount].map(n), [30, 3, 150000, 4500000]);
    assert.equal(await stock(mozz, prep), 30);
  });

  await test("full cycle: receipt into Prep → transfer to Online → write-off → count, report after each step", async () => {
    const cheese = await saveProduct({ type: "ingredient", name_en: "Cycle cheese", name_vn: "Phô mai chu trình", brand: "Mlekpol", base_unit: "kg" });
    const view = async (warehouses: string[] | null) => {
      const rows = await q<ErpStockRow>("select * from public.erp_stock where product_id = $1", [cheese]);
      return stockOf(stockByProduct(rows, warehouses ? new Set(warehouses) : null), cheese);
    };
    const report = async (w: string) => {
      const rows = await q<Record<string, string>>("select * from public.erp_movement_report('2026-10-01', '2026-10-31', $1) where product_id = $2", [w, cheese]);
      if (!rows.length) return [0, 0, 0, 0, 0, 0];
      const r = rows[0];
      return [r.in_qty, r.in_value, r.out_qty, r.out_value, r.closing_qty, r.closing_value].map(n);
    };
    const check = async (label: string, prepQty: number, prepValue: number, onlineQty: number, onlineValue: number) => {
      assert.equal(await stock(cheese, prep), prepQty, `${label}: prep qty`);
      assert.equal(await stock(cheese, online), onlineQty, `${label}: online qty`);
      const p = await view([prep]);
      const o = await view([online]);
      const all = await view(null);
      assert.deepEqual([p.qty, p.knownValue, p.complete], [prepQty, prepValue, true], `${label}: prep view`);
      assert.deepEqual([o.qty, o.knownValue, o.complete], [onlineQty, onlineValue, true], `${label}: online view`);
      assert.deepEqual([all.qty, all.knownValue], [prepQty + onlineQty, prepValue + onlineValue], `${label}: all locations`);
      const both = await view([prep, online]);
      assert.deepEqual([both.qty, both.knownValue], [all.qty, all.knownValue]);
      assert.deepEqual((await report(prep)).slice(4), [prepQty, prepValue], `${label}: report prep closing`);
      assert.deepEqual((await report(online)).slice(4), [onlineQty, onlineValue], `${label}: report online closing`);
    };

    // Two lots at different prices.
    const r1 = await saveDoc({ doc_type: "receipt", doc_date: "2026-10-10", warehouse_id: prep, lines: [{ product_id: cheese, qty: 10, unit_price: 100000 }] });
    const r2 = await saveDoc({ doc_type: "receipt", doc_date: "2026-10-11", warehouse_id: prep, lines: [{ product_id: cheese, qty: 5, unit_price: 130000 }] });
    await check("drafts", 0, 0, 0, 0);
    await post(r1);
    await post(r2);
    await check("receipts", 15, 1650000, 0, 0);
    assert.deepEqual(await report(prep), [15, 1650000, 0, 0, 15, 1650000]);
    const lots = await view([prep]);
    assert.deepEqual(costInfo(lots, { est_unit_cost: 130000, est_cost_source: "receipt" }), { kind: "lots", unitCost: 110000 }, "remaining lots, not the last price");

    await expectError(post(r1), "ERP_ALREADY_POSTED");
    assert.equal(n(await value("select count(*) from public.erp_lots where source_document_id = $1", [r1])), 1);

    await expectError(
      saveDoc({ doc_type: "transfer", doc_date: "2026-10-12", warehouse_id: prep, target_warehouse_id: prep, lines: [{ product_id: cheese, qty: 1 }] }).then(post),
      "ERP_SAME_WAREHOUSE",
    );

    // Shortage blocks everything and keeps the entered draft.
    const t = await saveDoc({ doc_type: "transfer", doc_date: "2026-10-12", warehouse_id: prep, target_warehouse_id: online, comment: "to online", lines: [{ product_id: cheese, qty: 20 }] });
    await expectError(post(t), "ERP_INSUFFICIENT_STOCK");
    await check("shortage", 15, 1650000, 0, 0);
    const kept = await one<{ status: string; comment: string; qty: string }>(
      "select d.status, d.comment, l.qty from public.erp_documents d join public.erp_document_lines l on l.document_id = d.id where d.id = $1",
      [t],
    );
    assert.deepEqual([kept.status, kept.comment, n(kept.qty)], ["draft", "to online", 20]);
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1", [t])), 0);

    await saveDoc({ id: t, doc_type: "transfer", doc_date: "2026-10-12", warehouse_id: prep, target_warehouse_id: online, lines: [{ product_id: cheese, qty: 12 }] });
    const tr = await post(t);
    assert.equal(n(tr.total_cost), 1260000, "FIFO: 10 × 100 000 + 2 × 130 000");
    await check("transfer", 3, 390000, 12, 1260000);
    assert.deepEqual(await report(prep), [15, 1650000, 12, 1260000, 3, 390000]);
    assert.deepEqual(await report(online), [12, 1260000, 0, 0, 12, 1260000]);
    assert.deepEqual(costInfo(await view([online]), { est_unit_cost: null }), { kind: "lots", unitCost: 105000 });

    const wo = await saveDoc({ doc_type: "writeoff", doc_date: "2026-10-13", warehouse_id: online, reason: "spoiled", lines: [{ product_id: cheese, qty: 2 }] });
    assert.equal(n((await post(wo)).total_cost), 200000);
    await check("write-off", 3, 390000, 10, 1060000);
    assert.deepEqual(await report(online), [12, 1260000, 2, 200000, 10, 1060000]);

    const cnt = await saveDoc({ doc_type: "count", doc_date: "2026-10-14", warehouse_id: online, lines: [{ product_id: cheese, qty: 9.5 }] });
    await post(cnt);
    await check("count", 3, 390000, 9.5, 1010000);
    assert.deepEqual(await report(online), [12, 1260000, 2.5, 250000, 9.5, 1010000]);

    // Cancelling respects what came later.
    await expectError(cancel(r1), "ERP_CANCEL_BLOCKED");
    await expectError(cancel(t), "ERP_CANCEL_BLOCKED");
    await cancel(cnt);
    await cancel(wo);
    await check("write-off and count cancelled", 3, 390000, 12, 1260000);
    await cancel(t);
    await check("transfer cancelled", 15, 1650000, 0, 0);
    await cancel(r2);
    await check("second receipt cancelled", 10, 1000000, 0, 0);
  });

  await test("unknown cost stays unknown in stock values; zero stock shows only a reference price", async () => {
    const mystery = await saveProduct({ type: "ingredient", name_en: "Unpriced test", base_unit: "kg" });
    const priced = await saveDoc({ doc_type: "receipt", warehouse_id: online, lines: [{ product_id: mystery, qty: 2, unit_price: 50000 }] });
    await post(priced);
    const unpriced = await saveDoc({ doc_type: "opening", warehouse_id: prep, lines: [{ product_id: mystery, qty: 3 }] });
    await post(unpriced);
    const rows = await q<ErpStockRow>("select * from public.erp_stock where product_id = $1", [mystery]);
    const product = { est_unit_cost: 50000, est_cost_source: "receipt" };
    const prepOnly = stockOf(stockByProduct(rows, new Set([prep])), mystery);
    assert.deepEqual([prepOnly.qty, prepOnly.complete, stockValue(prepOnly)], [3, false, null], "never 0");
    assert.deepEqual(costInfo(prepOnly, product), { kind: "unknown" }, "the last delivery price is not used for unpriced lots");
    const onlineOnly = stockOf(stockByProduct(rows, new Set([online])), mystery);
    assert.deepEqual([stockValue(onlineOnly), costInfo(onlineOnly, product)], [100000, { kind: "lots", unitCost: 50000 }]);
    const all = stockOf(stockByProduct(rows, null), mystery);
    assert.deepEqual([all.qty, all.knownValue, all.complete, stockValue(all)], [5, 100000, false, null], "lower bound only");
    const nothing = stockOf(stockByProduct(rows, new Set([warehouse])), mystery);
    assert.deepEqual(costInfo(nothing, product), { kind: "reference", unitCost: 50000, source: "receipt" });
    assert.deepEqual(costInfo(nothing, { est_unit_cost: null }), { kind: "none" });
    assert.equal(costNumber({ kind: "unknown" }), null);
  });

  // ---- One catalog for Staff and ERP ----
  const staffExport = async () => sanitizeStaffCatalog(await value<unknown>("select public.erp_staff_catalog()"))!;
  const staffVersion = () => value<string>("select public.erp_staff_catalog_version()");
  const saveStaff = (c: StaffCatalog, version: string | null) =>
    value<Record<string, unknown>>("select public.erp_save_staff_catalog($1::jsonb, $2, $3)", [JSON.stringify(c), version, ACTOR]);
  const workCounts = () =>
    one<Record<string, string>>(
      `select (select count(*) from public.erp_lots) lots, (select count(*) from public.erp_movements) movements,
              (select count(*) from public.erp_documents) documents, (select count(*) from public.erp_document_lines) document_lines,
              (select count(*) from public.erp_recipes) recipes, (select count(*) from public.erp_recipe_lines) recipe_lines,
              (select coalesce(sum(qty_left), 0) from public.erp_lots) qty_left`,
    );
  const catalogRows = async (): Promise<ErpCatalogRows> => ({
    categories: await q("select id, code, name_en, name_vn, archived_at from public.erp_categories"),
    suppliers: await q("select id, code, name, zalo_url, archived_at from public.erp_suppliers"),
    products: await q("select * from public.erp_products"),
    itemLinks: await q("select legacy_id, target_id from public.erp_legacy_map where source = 'staff' and entity = 'item'"),
  });
  const work = await workCounts();

  await test("shared catalog: item and supplier created in Staff appear in the ERP with brand, unit, pack and link", async () => {
    const c = await staffExport();
    const version = await staffVersion();
    c.suppliers.push({ id: "test-oat-supplier", label: "Oat Supplier Co" });
    c.items.push({
      id: "test-oat-milk",
      category: c.categories[0].id,
      name: "Oat milk",
      nameVn: "Sữa yến mạch",
      brand: "Oatly",
      unit: "box",
      pack: "12*1 L",
      supplier: "test-oat-supplier",
      itemNo: "OAT-1",
    });
    const result = await saveStaff(c, version);
    assert.notEqual(result.version, version, "a save gives a new version");
    assert.equal(result.version, await staffVersion());
    const row = await one<Record<string, string>>(
      `select p.name_en, p.name_vn, p.brand, p.base_unit, p.staff_unit, p.staff_pack, p.staff_item_no, s.code supplier, c.code category
       from public.erp_products p join public.erp_suppliers s on s.id = p.staff_supplier_id join public.erp_categories c on c.id = p.category_id
       where p.code = 'test-oat-milk'`,
    );
    assert.deepEqual(row, {
      name_en: "Oat milk",
      name_vn: "Sữa yến mạch",
      brand: "Oatly",
      base_unit: "l",
      staff_unit: "box",
      staff_pack: "12*1 L",
      staff_item_no: "OAT-1",
      supplier: "test-oat-supplier",
      category: c.categories[0].id,
    });
    const pack = await one<{ label: string; qty_base: string; is_default: boolean; supplier: string }>(
      `select k.label, k.qty_base, k.is_default, s.code supplier from public.erp_product_packs k
       join public.erp_products p on p.id = k.product_id join public.erp_suppliers s on s.id = k.supplier_id where p.code = 'test-oat-milk'`,
    );
    assert.deepEqual([pack.label, n(pack.qty_base), pack.is_default, pack.supplier], ["box 12*1 L", 12, true, "test-oat-supplier"]);
    const back = (await staffExport()).items.find((i) => i.id === "test-oat-milk");
    assert.deepEqual(back, c.items.at(-1), "Staff reads back exactly what it saved");
    assert.deepEqual(await workCounts(), work, "no stock, documents or movements");
  });

  await test("shared catalog: a save based on an old version is refused and changes nothing", async () => {
    const old = await staffVersion();
    const first = await staffExport();
    first.items.find((i) => i.id === "test-oat-milk")!.brand = "Oatly Barista";
    await saveStaff(first, old);
    const stale = await staffExport();
    stale.items.find((i) => i.id === "test-oat-milk")!.itemNo = "OLD-COPY";
    await expectError(saveStaff(stale, old), "ERP_STALE");
    await expectError(saveStaff(stale, null), "ERP_STALE");
    const row = await one<{ brand: string; staff_item_no: string }>("select brand, staff_item_no from public.erp_products where code = 'test-oat-milk'");
    assert.deepEqual(row, { brand: "Oatly Barista", staff_item_no: "OAT-1" }, "the newer save is kept");
  });

  let lime = "";
  await test("shared catalog: products created and edited in the ERP show up in Staff", async () => {
    const supplier = await value<string>("select id from public.erp_suppliers where code = 'test-oat-supplier'");
    const category = await value<string>("select id from public.erp_categories where archived_at is null order by sort limit 1");
    const base = { type: "ingredient", name_en: "Test lime", name_vn: "", brand: "Farm A", base_unit: "kg", category_id: category };
    const staff = { listed: true, supplier_id: supplier, unit: "kg", pack: "1 kg", item_no: "L-1", hidden: false };
    lime = await saveProduct({ ...base, staff });
    const code = await value<string>("select code from public.erp_products where id = $1", [lime]);
    let item = (await staffExport()).items.find((i) => i.id === code);
    assert.ok(item, "visible in Staff");
    assert.deepEqual([item!.name, item!.brand, item!.unit, item!.pack, item!.supplier, item!.itemNo], ["Test lime", "Farm A", "kg", "1 kg", "test-oat-supplier", "L-1"]);
    // An edit without Staff settings keeps them; brand changes reach Staff.
    await saveProduct({ ...base, id: lime, brand: "Farm B" });
    item = (await staffExport()).items.find((i) => i.id === code);
    assert.deepEqual([item!.brand, item!.supplier, item!.pack], ["Farm B", "test-oat-supplier", "1 kg"]);
    await saveProduct({ ...base, id: lime, brand: "Farm B", staff: { ...staff, hidden: true } });
    assert.equal((await staffExport()).items.find((i) => i.id === code)!.hidden, true);
    await saveProduct({ ...base, id: lime, brand: "Farm B", staff: { ...staff, listed: false } });
    assert.equal((await staffExport()).items.some((i) => i.id === code), false, "unlisted in the ERP → gone from Staff orders");
    await saveProduct({ ...base, id: lime, brand: "Farm B", staff });
    // Missing Staff settings: refused with the list of fields, nothing saved.
    const before = n(await value("select count(*) from public.erp_products"));
    const failure = async (p: Record<string, unknown>) => {
      const error = (await saveProduct(p).then(() => null, (e: Error & { detail?: string }) => e))!;
      assert.ok(error, "expected an error");
      return [error.message, error.detail];
    };
    assert.deepEqual(await failure({ ...base, name_en: "Test lemon", staff: { ...staff, supplier_id: null, unit: "" } }), ["ERP_STAFF_INCOMPLETE", "supplier,unit"]);
    assert.deepEqual(await failure({ ...base, name_en: "Test lemon", category_id: null, staff }), ["ERP_STAFF_INCOMPLETE", "category"]);
    assert.equal(n(await value("select count(*) from public.erp_products")), before);
    assert.deepEqual(await workCounts(), work);
  });

  await test("shared catalog: a Staff save of unchanged data changes nothing in the ERP", async () => {
    const snapshot = () =>
      q("select code, name_en, name_vn, brand, category_id, base_unit, staff_unit, staff_pack, staff_supplier_id, staff_item_no, staff_hidden, staff_listed, archived_at from public.erp_products order by code");
    const packs = () => q("select product_id, supplier_id, label, qty_base, is_default, archived_at from public.erp_product_packs order by product_id, label");
    const products = await snapshot();
    const packsBefore = await packs();
    const suppliers = await q("select code, name, archived_at from public.erp_suppliers order by code");
    await saveStaff(await staffExport(), await staffVersion());
    assert.deepEqual(await snapshot(), products, "no product field rewritten (empty VN names stay empty)");
    assert.deepEqual(await packs(), packsBefore, "no pack added or switched");
    assert.deepEqual(await q("select code, name, archived_at from public.erp_suppliers order by code"), suppliers);
    assert.equal(await value("select name_vn from public.erp_products where id = $1", [lime]), "");
  });

  await test("shared catalog: Staff cannot take a code of an ERP-only product; hidden products are not unlisted", async () => {
    const prepOnly = await saveProduct({ type: "ingredient", name_en: "Staff collision prep", base_unit: "kg" });
    const code = await value<string>("select code from public.erp_products where id = $1", [prepOnly]);
    const reserved = await value<{ items: string[] }>("select public.erp_staff_reserved_ids()");
    assert.ok(reserved.items.includes(code), "reserved for the Staff editor");
    const c = await staffExport();
    c.items.push({ id: code, category: c.categories[0].id, name: "Something else", nameVn: "", unit: "kg", supplier: "test-oat-supplier" });
    await expectError(saveStaff(c, await staffVersion()), "ERP_DUPLICATE");
    const kept = await one<{ name_en: string; staff_listed: boolean }>("select name_en, staff_listed from public.erp_products where id = $1", [prepOnly]);
    assert.deepEqual(kept, { name_en: "Staff collision prep", staff_listed: false });

    // Supplier archived in the ERP: Staff does not see the product, and its save must not unlist it.
    await q("update public.erp_suppliers set archived_at = now() where code = 'test-oat-supplier'");
    const hidden = await q<{ code: string }>("select code from public.erp_products where staff_supplier_id = (select id from public.erp_suppliers where code = 'test-oat-supplier')");
    assert.ok(hidden.length >= 2);
    const without = await staffExport();
    assert.equal(without.items.some((i) => hidden.some((h) => h.code === i.id)), false);
    await saveStaff(without, await staffVersion());
    assert.equal(n(await value("select count(*) from public.erp_products where staff_listed and code = any($1)", [hidden.map((h) => h.code)])), hidden.length);
    await q("update public.erp_suppliers set archived_at = null where code = 'test-oat-supplier'");
    assert.ok((await staffExport()).items.some((i) => i.id === "test-oat-milk"), "back in Staff with its settings");
  });

  await test("old Staff file merge: adds only missing records, ambiguous ones go to review, never overwrites, repeatable", async () => {
    const erpOnly = await value<string>("select code from public.erp_products where name_en = 'Staff collision prep'");
    const old = structuredClone(await staffExport());
    const mozzarella = await one<{ code: string; brand: string }>("select code, brand from public.erp_products where name_en = 'Cheese - Mozzarella' and brand = 'Mlekpol'");
    const changed = old.items.find((i) => i.id === "test-oat-milk")!;
    changed.brand = "Old brand";
    const limeCode = await value<string>("select code from public.erp_products where id = $1", [lime]);
    old.items = old.items.filter((i) => i.id !== limeCode);
    old.suppliers.push({ id: "test-old-supplier", label: "Old Supplier" });
    old.items.push(
      { id: "test-old-fish", category: old.categories[0].id, name: "Old fish", nameVn: "Cá", unit: "box", pack: "13-15 kg", supplier: "test-old-supplier" },
      { id: "test-old-mozzarella", category: old.categories[0].id, name: "Cheese - Mozzarella", nameVn: "", brand: "Mlekpol", unit: "box", pack: "5*2 kg", supplier: "test-old-supplier" },
      { id: "test-old-mozzarella-arla", category: old.categories[0].id, name: "Cheese - Mozzarella", nameVn: "", brand: "Arla", unit: "box", pack: "5*2 kg", supplier: "test-old-supplier" },
      { id: erpOnly, category: old.categories[0].id, name: "Other thing", nameVn: "", unit: "kg", supplier: "test-old-supplier" },
    );
    const plan = planStaffMerge(old, await catalogRows());
    assert.deepEqual(plan.add.suppliers.map((s) => s.id), ["test-old-supplier"]);
    assert.deepEqual(plan.add.items.map((i) => i.id).sort(), ["test-old-fish", "test-old-mozzarella-arla"], "different brand is a different item");
    assert.deepEqual(plan.ambiguous.map((a) => a.id).sort(), [erpOnly, "test-old-mozzarella"].sort(), "same name and brand, or a taken code → manual check");
    assert.deepEqual(plan.ambiguous.find((a) => a.id === "test-old-mozzarella")!.candidates.map((c) => c.code), [mozzarella.code]);
    assert.deepEqual(plan.needsSetup.map((i) => i.id), ["test-old-fish"], "a range pack gives no unit");
    assert.deepEqual(plan.differs.find((d) => d.id === "test-oat-milk")!.fields, [{ field: "brand", staff: "Old brand", erp: "Oatly Barista" }]);
    assert.ok(plan.onlyInErp.some((p) => p.code === limeCode), "created in the ERP, not in the old file");

    const applied = await value<Record<string, number>>("select public.erp_add_staff_catalog($1::jsonb, $2)", [JSON.stringify(plan.add), ACTOR]);
    assert.deepEqual([applied.items, applied.suppliers, applied.categories, applied.pack_review], [2, 1, 0, 1]);
    assert.equal(await value("select brand from public.erp_products where code = 'test-oat-milk'"), "Oatly Barista", "existing ERP data not overwritten");
    const fish = await one<{ base_unit: string | null; staff_unit: string; staff_listed: boolean; packs: string }>(
      "select base_unit, staff_unit, staff_listed, (select count(*) from public.erp_product_packs k where k.product_id = p.id) packs from public.erp_products p where code = 'test-old-fish'",
    );
    assert.deepEqual([fish.base_unit, fish.staff_unit, fish.staff_listed, n(fish.packs)], [null, "box", true, 0], "unit not guessed, item kept");
    const arla = await one<{ base_unit: string; qty_base: string }>(
      "select p.base_unit, k.qty_base from public.erp_products p join public.erp_product_packs k on k.product_id = p.id where p.code = 'test-old-mozzarella-arla'",
    );
    assert.deepEqual([arla.base_unit, n(arla.qty_base)], ["kg", 10]);
    assert.ok((await staffExport()).items.some((i) => i.id === "test-old-fish"), "a transferred item is in Staff orders");

    const counts = () => one("select (select count(*) from public.erp_products) p, (select count(*) from public.erp_suppliers) s, (select count(*) from public.erp_product_packs) k");
    const before = await counts();
    const again = planStaffMerge(old, await catalogRows());
    assert.equal(again.add.items.length + again.add.suppliers.length + again.add.categories.length, 0, "nothing left to add");
    const second = await value<Record<string, number>>("select public.erp_add_staff_catalog($1::jsonb, $2)", [JSON.stringify(plan.add), ACTOR]);
    assert.deepEqual([second.items, second.suppliers, second.skipped], [0, 0, 2]);
    assert.deepEqual(await counts(), before, "no duplicates");
    assert.deepEqual(await workCounts(), work, "no stock, documents, movements or recipe changes");

    // Incomplete settings block only stock operations.
    const fishId = await value<string>("select id from public.erp_products where code = 'test-old-fish'");
    const draft = await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: fishId, qty: 1, unit_price: 1000 }] }).catch((e: Error) => e);
    if (typeof draft === "string") {
      await expectError(post(draft), "ERP_PRODUCT_NO_UNIT");
      await q("delete from public.erp_document_lines where document_id = $1", [draft]);
      await q("delete from public.erp_documents where id = $1", [draft]);
    } else assert.match(draft.message, /ERP_PRODUCT_NO_UNIT/);
    assert.deepEqual(await workCounts(), work);
  });

  await test("supplier order PDF from the shared catalog", async () => {
    const c = await staffExport();
    c.items.push({ id: "test-hidden", category: c.categories[0].id, name: "Hidden", nameVn: "", unit: "kg", supplier: "test-oat-supplier", hidden: true });
    const qty: Record<string, number> = { "test-oat-milk": 3, "test-hidden": 5 };
    const rows = supplierOrderRows(c.items, "test-oat-supplier", (id) => qty[id] ?? 0);
    assert.equal(rows.length, 1, "only marked, visible items of this supplier");
    assert.equal(rows[0].quantity, 3);
    assert.equal(rows[0].details, "Oatly Barista");
    assert.equal(rows[0].itemNo, "OAT-1");
    assert.ok(rows[0].name.includes("Oat milk"), rows[0].name);
    assert.ok(rows[0].packInfo?.includes("12*1 L"), rows[0].packInfo);
    const fonts = path.join(process.cwd(), "public");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input).split("?")[0];
      return new Response(await readFile(path.join(fonts, url.replace(/^https?:\/\/[^/]+/, ""))));
    }) as typeof fetch;
    try {
      const blob = await makeSupplierOrderPdfBlob({ title: "ORDER: OAT SUPPLIER CO", dateLine: "Date: 2026-11-05", employeeLine: "Employee: test", rows, emptyMessage: "-" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), 1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  await test("product delivery history: one query, posted deliveries and openings only, newest first", async () => {
    const butter = await saveProduct({ type: "ingredient", name_en: "History butter", name_vn: "Bơ lịch sử", base_unit: "kg" });
    const history = () =>
      value<{ doc_no: string; doc_type: string; doc_date: string; qty: number; unit_cost: number | null }[]>("select public.erp_product_receipts($1, 20)", [butter]);
    assert.deepEqual(await history(), []);
    const opening = await saveDoc({ doc_type: "opening", doc_date: "2026-09-01", warehouse_id: prep, lines: [{ product_id: butter, qty: 2 }] });
    await post(opening);
    const r1 = await saveDoc({ doc_type: "receipt", doc_date: "2026-09-10", warehouse_id: prep, lines: [{ product_id: butter, qty: 4, unit_price: 200000 }] });
    await post(r1);
    const r2 = await saveDoc({ doc_type: "receipt", doc_date: "2026-09-12", warehouse_id: prep, lines: [{ product_id: butter, qty: 1, unit_price: 210000 }] });
    await post(r2);
    await cancel(r2);
    await saveDoc({ doc_type: "receipt", doc_date: "2026-09-15", warehouse_id: prep, lines: [{ product_id: butter, qty: 9, unit_price: 1 }] });
    const rows = await history();
    assert.deepEqual(
      rows.map((r) => [r.doc_type, r.doc_date, n(r.qty), n(r.unit_cost)]),
      [
        ["receipt", "2026-09-10", 4, 200000],
        ["opening", "2026-09-01", 2, null],
      ],
      "cancelled deliveries and drafts are not history",
    );
    assert.equal(n(await value("select jsonb_array_length(public.erp_product_receipts($1, 1))", [butter])), 1, "limit");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await value("select has_function_privilege($1, 'public.erp_product_receipts(uuid,integer)', 'execute')", [role]), false, role);
    }
    assert.equal(await value("select has_function_privilege('service_role', 'public.erp_product_receipts(uuid,integer)', 'execute')"), true);
  });

  await test("average cost shown in stock does not change FIFO: write-offs take the oldest lots at their own cost", async () => {
    const oil = await saveProduct({ type: "ingredient", name_en: "FIFO oil", name_vn: "Dầu FIFO", base_unit: "l" });
    const shown = async () => {
      const rows = await q<ErpStockRow>("select * from public.erp_stock where product_id = $1", [oil]);
      const t = stockOf(stockByProduct(rows, new Set([prep])), oil);
      return { qty: t.qty, value: t.knownValue, avg: costNumber(costInfo(t, { est_unit_cost: null })) };
    };
    const writeOff = async (qty: number) => {
      const id = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, reason: "fifo test", lines: [{ product_id: oil, qty }] });
      await post(id);
      return one<{ total_cost: string; cost_known: boolean }>("select total_cost, cost_known from public.erp_documents where id = $1", [id]);
    };
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-08-01", warehouse_id: prep, lines: [{ product_id: oil, qty: 10, unit_price: 100 }] }));
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-08-02", warehouse_id: prep, lines: [{ product_id: oil, qty: 10, unit_price: 200 }] }));
    assert.deepEqual(await shown(), { qty: 20, value: 3000, avg: 150 }, "display: average of the remaining lots");

    // 5 l leave from the 100-lot: 500, not 5 × average 150 = 750.
    const first = await writeOff(5);
    assert.equal(n(first.total_cost), 500);
    assert.deepEqual(await shown(), { qty: 15, value: 2500, avg: 2500 / 15 }, "the average follows what is left");

    // 10 l: the last 5 of the 100-lot, then 5 of the 200-lot: 500 + 1000.
    const second = await writeOff(10);
    assert.equal(n(second.total_cost), 1500);
    assert.deepEqual(await shown(), { qty: 5, value: 1000, avg: 200 }, "only the newest lot is left");
    const lots = await q<{ qty_left: string; unit_cost: string }>(
      "select qty_left, unit_cost from public.erp_lots where product_id = $1 and warehouse_id = $2 order by received_at",
      [oil, prep],
    );
    assert.deepEqual(lots.map((l) => [n(l.qty_left), n(l.unit_cost)]), [[0, 100], [5, 200]], "the old lot is used up first");
  });

  const saveReason = (p: Record<string, unknown>) => value<string>("select public.erp_save_writeoff_reason($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);

  await test("write-off reasons: create, edit, archive; archived reason stays on old documents and cannot be newly chosen", async () => {
    const spoiled = await saveReason({ name: "Испорчено", color: "#E11D48" });
    const row = await one<{ name: string; color: string; pnl_block: string; archived_at: string | null }>("select * from public.erp_writeoff_reasons where id = $1", [spoiled]);
    assert.deepEqual([row.name, row.color, row.pnl_block, row.archived_at], ["Испорчено", "#e11d48", "cost", null]);
    await expectError(saveReason({ name: " испорчено " }), "duplicate key");
    await expectError(saveReason({ name: "  " }), "ERP_INVALID");
    await expectError(saveReason({ name: "x", color: "red" }), "check constraint");
    await saveReason({ id: spoiled, name: "Испорчено (порча)", color: "#e11d48", pnl_block: "expense" });

    const cheese = await saveProduct({ type: "ingredient", name_en: "Reason cheese", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: cheese, qty: 5, unit_price: 1000 }] }));
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, reason_id: spoiled, doc_time: "17:26", lines: [{ product_id: cheese, qty: 1 }] });
    await post(wo);
    const draft = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, reason_id: spoiled, lines: [{ product_id: cheese, qty: 1 }] });

    await saveReason({ id: spoiled, name: "Испорчено (порча)", color: "#e11d48", archived: true });
    const doc = await one<{ reason_id: string; doc_time: string; name: string; archived_at: string | null }>(
      "select d.reason_id, d.doc_time::text as doc_time, r.name, r.archived_at from public.erp_documents d join public.erp_writeoff_reasons r on r.id = d.reason_id where d.id = $1",
      [wo],
    );
    assert.equal(doc.reason_id, spoiled, "the posted document keeps its reason");
    assert.equal(doc.name, "Испорчено (порча)");
    assert.ok(doc.archived_at, "archived, not deleted");
    assert.equal(doc.doc_time, "17:26:00");
    // A draft that already had the reason may be saved again; a new document cannot pick it.
    await saveDoc({ id: draft, warehouse_id: prep, reason_id: spoiled, lines: [{ product_id: cheese, qty: 1 }] });
    await expectError(saveDoc({ doc_type: "writeoff", warehouse_id: prep, reason_id: spoiled, lines: [{ product_id: cheese, qty: 1 }] }), "ERP_REASON_ARCHIVED");
    // The same name can be used again once the old one is archived.
    await saveReason({ name: "Испорчено (порча)" });
    await saveReason({ id: spoiled, name: "Испорчено (порча) old", color: "#e11d48", archived: false });
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await value("select has_function_privilege($1, 'public.erp_save_writeoff_reason(jsonb,text)', 'execute')", [role]), false, role);
      assert.equal(await value("select has_table_privilege($1, 'public.erp_writeoff_reasons', 'select')", [role]), false, role);
    }
  });

  await test("write-off: draft keeps stock, posting takes FIFO lots at their own cost", async () => {
    const flour = await saveProduct({ type: "ingredient", name_en: "WO flour", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-09-01", warehouse_id: prep, lines: [{ product_id: flour, qty: 2, unit_price: 10000 }] }));
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-09-02", warehouse_id: prep, lines: [{ product_id: flour, qty: 2, unit_price: 30000 }] }));
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, lines: [{ product_id: flour, qty: 3 }] });
    assert.equal(await stock(flour, prep), 4, "a draft does not change stock");
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1", [wo])), 0);
    await post(wo);
    assert.equal(await stock(flour, prep), 1);
    const doc = await one<{ total_cost: string; cost_known: boolean }>("select total_cost, cost_known from public.erp_documents where id = $1", [wo]);
    // 2 kg × 10 000 from the first lot + 1 kg × 30 000 from the second = 50 000 (an average would give 60 000).
    assert.equal(n(doc.total_cost), 50000);
    assert.equal(doc.cost_known, true);
    const line = await one<{ cost_amount: string; unit_cost: string }>("select cost_amount, unit_cost from public.erp_document_lines where document_id = $1", [wo]);
    assert.equal(n(line.cost_amount), 50000);
    assert.ok(Math.abs(n(line.unit_cost)! - 50000 / 3) < 1e-3);
    const moved = await one<{ qty: string; value: string }>("select sum(qty) as qty, sum(qty * unit_cost) as value from public.erp_movements where document_id = $1", [wo]);
    assert.deepEqual([n(moved.qty), n(moved.value)], [-3, -50000], "the movements carry the same cost");
  });

  await test("write-off: a shortage on one line blocks the whole document and changes nothing", async () => {
    const a = await saveProduct({ type: "ingredient", name_en: "WO short A", base_unit: "pcs" });
    const b = await saveProduct({ type: "ingredient", name_en: "WO short B", base_unit: "pcs" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: a, qty: 5, unit_price: 100 }, { product_id: b, qty: 1, unit_price: 100 }] }));
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, lines: [{ product_id: a, qty: 2 }, { product_id: b, qty: 3 }] });
    await expectError(post(wo), "ERP_INSUFFICIENT_STOCK");
    assert.deepEqual([await stock(a, prep), await stock(b, prep)], [5, 1], "the first line is not taken either");
    assert.equal(await value("select status from public.erp_documents where id = $1", [wo]), "draft");
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1", [wo])), 0);
  });

  await test("write-off: a repeated save/post of a new document is one document, posted once", async () => {
    const egg = await saveProduct({ type: "ingredient", name_en: "WO egg", base_unit: "pcs" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: egg, qty: 10, unit_price: 3000 }] }));
    const key = "6f7e3b52-27a4-4c55-9c1f-0a6f4f3c2b11";
    const body = { doc_type: "writeoff", client_key: key, warehouse_id: prep, lines: [{ product_id: egg, qty: 2 }] };
    const first = await saveDoc(body);
    assert.equal(await saveDoc(body), first, "the same key returns the same draft");
    await post(first);
    await expectError(saveDoc(body), "ERP_ALREADY_POSTED");
    await expectError(post(first), "ERP_ALREADY_POSTED");
    assert.equal(n(await value("select count(*) from public.erp_documents where client_key = $1", [key])), 1);
    assert.equal(await stock(egg, prep), 8, "written off once");
  });

  await test("write-off: posted documents cannot be edited or deleted; cancelling is explicit and returns stock", async () => {
    const tea = await saveProduct({ type: "ingredient", name_en: "WO tea", base_unit: "pcs" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: tea, qty: 4, unit_price: 500 }] }));
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, lines: [{ product_id: tea, qty: 1 }] });
    await post(wo);
    await expectError(saveDoc({ id: wo, warehouse_id: prep, lines: [{ product_id: tea, qty: 3 }] }), "ERP_DOCUMENT_LOCKED");
    await expectError(value("select public.erp_delete_draft($1, $2)", [wo, ACTOR]), "ERP_DOCUMENT_LOCKED");
    await expectError(q("delete from public.erp_documents where id = $1", [wo]), "ERP_DOCUMENT_LOCKED");
    await expectError(q("update public.erp_document_lines set qty = 3 where document_id = $1", [wo]), "ERP_DOCUMENT_LOCKED");
    await expectError(q("update public.erp_documents set warehouse_id = warehouse_id where id = $1", [wo]), "ERP_DOCUMENT_LOCKED");
    assert.equal(await stock(tea, prep), 3);
    await expectError(cancel(wo, " "), "ERP_REASON_REQUIRED");
    await cancel(wo, "wrong product");
    assert.equal(await stock(tea, prep), 4, "cancelling returns the stock");
    const audit = await q("select action from public.erp_audit_log where entity_id = $1 order by id", [wo]);
    assert.deepEqual(audit.map((r) => r.action), ["save", "post", "cancel"]);
  });

  // ---- Inventory count logic (period, book qty, fact, posting, recipes) ----
  const preview = (p: Record<string, unknown>) =>
    value<Record<string, unknown>>("select public.erp_count_preview($1::jsonb)", [JSON.stringify(p)]);
  const countGet = (id: string) => value<Record<string, unknown>>("select public.erp_count_get($1)", [id]);
  const reopen = (id: string, cascade = false, reason = "fix") =>
    value<Record<string, unknown>>("select public.erp_reopen_count($1, $2, $3, $4)", [id, ACTOR, cascade, reason]);

  await test("count: first and second full, idle leftover without movement stays out", async () => {
    const milk = await saveProduct({ type: "ingredient", name_en: "Count milk", base_unit: "l" });
    const idle = await saveProduct({ type: "ingredient", name_en: "Count idle oil", base_unit: "l" });
    await post(await saveDoc({ doc_type: "opening", occurred_at: "2026-01-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: milk, qty: 4, unit_price: 20000 }] }));
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-01-02T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: milk, qty: 6, unit_price: 22000 }] }));
    await post(await saveDoc({ doc_type: "opening", occurred_at: "2026-01-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: idle, qty: 3, unit_price: 10000 }] }));
    await post(await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: "2026-01-01T12:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: idle, qty: 3 }],
    }));
    const seen = await preview({ warehouse_id: prep, count_kind: "full", counted_at: "2026-01-03T12:00:00+07:00" });
    const naive = await preview({ warehouse_id: prep, count_kind: "full", counted_at: "2026-01-03T12:00:00" });
    assert.equal(String(naive.timezone), "Asia/Ho_Chi_Minh");
    assert.equal(new Date(String(naive.counted_at)).toISOString(), new Date("2026-01-03T12:00:00+07:00").toISOString(), "naive counted_at is business TZ, not UTC");
    const lines = seen.lines as { product_id: string; book_qty: number; opening_qty: number; in_qty: number }[];
    assert.ok(lines.some((l) => l.product_id === milk));
    assert.ok(!lines.some((l) => l.product_id === idle), "idle after its own count is not auto-included");
    const idleRows = seen.idle as { product_id: string; reason: string }[];
    assert.ok(idleRows.some((r) => r.product_id === idle && r.reason === "no_movement_in_period"));
    const milkLine = lines.find((l) => l.product_id === milk)!;
    assert.equal(n(milkLine.opening_qty), 0, "first check of milk starts at 0; opening is a movement");
    assert.equal(n(milkLine.in_qty), 10);
    assert.equal(n(milkLine.book_qty), 10);
    const first = await saveDoc({
      doc_type: "count", count_kind: "full", counted_at: "2026-01-03T12:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: milk, qty: 9 }],
    });
    await post(first);
    assert.equal(await stock(milk, prep), 9);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-01-04T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: milk, qty: 2, unit_price: 22000 }] }));
    const secondPrev = await preview({ warehouse_id: prep, count_kind: "full", counted_at: "2026-01-05T12:00:00+07:00" });
    const again = (secondPrev.lines as { product_id: string; book_qty: number; opening_qty: number; in_qty: number; last_count_id: string }[])
      .find((l) => l.product_id === milk)!;
    assert.equal(n(again.opening_qty), 9, "second full starts from the previous fact of this product");
    assert.equal(n(again.in_qty), 2);
    assert.equal(n(again.book_qty), 11);
    assert.equal(again.last_count_id, first);
    const second = await saveDoc({
      doc_type: "count", count_kind: "full", counted_at: "2026-01-05T12:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: milk, qty: 11 }],
    });
    await post(second);
    assert.equal(await stock(milk, prep), 11);
  });

  await test("count: partials of different products keep separate periods", async () => {
    const a = await saveProduct({ type: "ingredient", name_en: "Count partial A", base_unit: "kg" });
    const b = await saveProduct({ type: "ingredient", name_en: "Count partial B", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-02-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: a, qty: 5, unit_price: 1 }] }));
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-02-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: b, qty: 8, unit_price: 1 }] }));
    const ca = await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: "2026-02-02T10:00:00+07:00", warehouse_id: prep,
      count_scope: { product_ids: [a] },
      lines: [{ product_id: a, qty: 4 }],
    });
    await post(ca);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-02-03T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: a, qty: 1, unit_price: 1 }] }));
    const later = await preview({ warehouse_id: prep, count_kind: "partial", counted_at: "2026-02-04T10:00:00+07:00", product_ids: [a, b] });
    const lines = later.lines as { product_id: string; opening_qty: number; book_qty: number; last_count_id: string | null }[];
    const la = lines.find((l) => l.product_id === a)!;
    const lb = lines.find((l) => l.product_id === b)!;
    assert.equal(n(la.opening_qty), 4);
    assert.equal(n(la.book_qty), 5);
    assert.equal(la.last_count_id, ca);
    assert.equal(n(lb.opening_qty), 0);
    assert.equal(n(lb.book_qty), 8);
    assert.equal(lb.last_count_id, null);
  });

  await test("count: empty fact blocks posting; 0 is an explicit zero", async () => {
    const rice = await saveProduct({ type: "ingredient", name_en: "Count rice", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: rice, qty: 2, unit_price: 5000 }] }));
    const empty = await saveDoc({
      doc_type: "count", count_kind: "partial", warehouse_id: prep,
      lines: [{ product_id: rice }],
    });
    const emptyLine = await one<{ counted: boolean; qty: string }>("select counted, qty from public.erp_document_lines where document_id = $1", [empty]);
    assert.equal(emptyLine.counted, false);
    await expectError(post(empty), "ERP_COUNT_INCOMPLETE");
    assert.equal(await stock(rice, prep), 2, "draft and incomplete post do not move stock");
    const zero = await saveDoc({
      doc_type: "count", count_kind: "partial", warehouse_id: prep,
      lines: [{ product_id: rice, fact_qty: 0, counted: true }],
    });
    await post(zero);
    assert.equal(await stock(rice, prep), 0);
    const z = await one<{ qty: string; diff_qty: string; counted: boolean }>("select qty, diff_qty, counted from public.erp_document_lines where document_id = $1", [zero]);
    assert.equal(z.counted, true);
    assert.equal(n(z.qty), 0);
    assert.equal(n(z.diff_qty), -2);
  });

  await test("count: surplus, shortage and exact zero; surplus cost source is stored", async () => {
    const sugar = await saveProduct({ type: "ingredient", name_en: "Count sugar", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-03-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: sugar, qty: 10, unit_price: 8000 }] }));
    const short = await saveDoc({ doc_type: "count", counted_at: "2026-03-02T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: sugar, qty: 7 }] });
    const s = await post(short);
    assert.equal(await stock(sugar, prep), 7);
    assert.equal(n(s.total_cost), -24000);
    const exact = await saveDoc({ doc_type: "count", counted_at: "2026-03-03T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: sugar, qty: 7 }] });
    const e = await post(exact);
    assert.equal(n(e.total_cost), 0);
    const over = await saveDoc({ doc_type: "count", counted_at: "2026-03-04T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: sugar, qty: 9 }] });
    await post(over);
    assert.equal(await stock(sugar, prep), 9);
    const src = await one<{ surplus_cost_source: string; cost_amount: string }>(
      "select surplus_cost_source, cost_amount from public.erp_document_lines where document_id = $1",
      [over],
    );
    assert.equal(src.surplus_cost_source, "last_lot");
    assert.equal(n(src.cost_amount), 16000);
    const mystery = await saveProduct({ type: "ingredient", name_en: "Count mystery", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "opening", warehouse_id: prep, lines: [{ product_id: mystery, qty: 1 }] }));
    const unk = await saveDoc({ doc_type: "count", warehouse_id: prep, lines: [{ product_id: mystery, qty: 2 }] });
    const u = await post(unk);
    assert.equal(u.cost_known, false);
    assert.equal(u.total_cost, null, "unknown surplus is not valued at zero");
    assert.equal(await value("select surplus_cost_source from public.erp_document_lines where document_id = $1", [unk]), "unknown");
    const mysteryLot = await one<{ unit_cost: string | null }>(
      "select unit_cost from public.erp_lots where source_document_id = $1",
      [unk],
    );
    assert.equal(mysteryLot.unit_cost, null, "surplus lot cost stays unknown, not 0");
  });

  await test("count: surplus without lot or reference price does not create a lot with unit_cost=0", async () => {
    const ghost = await saveProduct({ type: "ingredient", name_en: "Count unpriced surplus", base_unit: "kg" });
    const id = await saveDoc({
      doc_type: "count",
      count_kind: "partial",
      warehouse_id: prep,
      count_scope: { product_ids: [ghost] },
      lines: [{ product_id: ghost, qty: 4, counted: true }],
    });
    const posted = await post(id);
    assert.equal(posted.cost_known, false);
    assert.equal(posted.total_cost, null);
    const lot = await one<{ unit_cost: string | null; qty_in: string }>(
      "select unit_cost, qty_in from public.erp_lots where source_document_id = $1",
      [id],
    );
    assert.equal(n(lot.qty_in), 4);
    assert.equal(lot.unit_cost, null, "unknown ≠ confirmed 0");
    assert.notEqual(n(lot.unit_cost), 0);
    const stockRow = await one<{ qty: string; known_value: string | null; cost_known: boolean }>(
      "select qty, known_value, cost_known from public.erp_stock where product_id = $1 and warehouse_id = $2",
      [ghost, prep],
    );
    assert.equal(n(stockRow.qty), 4);
    assert.equal(stockRow.cost_known, false);
    assert.equal(stockRow.known_value, null, "stock value is incomplete, not 0");
    const move = await one<{ unit_cost: string | null; amount: string | null }>(
      "select unit_cost, amount from public.erp_movements where document_id = $1",
      [id],
    );
    assert.equal(move.unit_cost, null);
    assert.equal(move.amount, null);
    const report = await one<{ in_value: string | null; closing_value: string | null; closing_qty: string }>(
      "select in_value, closing_value, closing_qty from public.erp_movement_report((current_date - 2), (current_date + 2), $1) where product_id = $2",
      [prep, ghost],
    );
    assert.equal(n(report.closing_qty), 4);
    assert.equal(report.in_value, null, "movement report does not value unknown surplus at 0");
    assert.equal(report.closing_value, null);
    const view = stockOf(
      stockByProduct(
        await q<ErpStockRow>("select * from public.erp_stock where product_id = $1", [ghost]),
        new Set([prep]),
      ),
      ghost,
    );
    assert.equal(stockValue(view), null);
    assert.deepEqual(costInfo(view, { est_unit_cost: null }), { kind: "unknown" });
  });

  await test("count: brands stay separate; packs are stored, qty is base units", async () => {
    const brandA = await saveProduct({ type: "ingredient", name_en: "Count cola", brand: "Brand A", base_unit: "l" });
    const brandB = await saveProduct({ type: "ingredient", name_en: "Count cola", brand: "Brand B", base_unit: "l" });
    const packId = await value<string>(
      "insert into public.erp_product_packs (product_id, label, qty_base, is_default) values ($1, '6x1L', 6, true) returning id",
      [brandA],
    );
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: brandA, qty: 6, unit_price: 10000 }] }));
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: brandB, qty: 4, unit_price: 12000 }] }));
    const ca = await saveDoc({
      doc_type: "count", count_kind: "partial", warehouse_id: prep,
      lines: [{ product_id: brandA, qty: 5, pack_id: packId, pack_qty: 1 }],
    });
    await post(ca);
    assert.equal(await stock(brandA, prep), 5);
    assert.equal(await stock(brandB, prep), 4, "other brand is untouched");
    const packLine = await one<{ pack_id: string; pack_qty: string; qty: string }>(
      "select pack_id, pack_qty, qty from public.erp_document_lines where document_id = $1",
      [ca],
    );
    assert.equal(packLine.pack_id, packId);
    assert.equal(n(packLine.pack_qty), 1);
    assert.equal(n(packLine.qty), 5);
  });

  await test("count: produced leftover is counted as itself, ingredients are not added again", async () => {
    const flour = await saveProduct({ type: "ingredient", name_en: "Count flour", base_unit: "kg" });
    const sauce = await saveProduct({ type: "semi_finished", name_en: "Count sauce", base_unit: "kg" });
    const rec = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: sauce, yield_qty: 1, lines: [{ product_id: flour, qty: 1 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [rec, ACTOR]);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-04-01T08:00:00+07:00", warehouse_id: prep, lines: [{ product_id: flour, qty: 5, unit_price: 10000 }] }));
    await post(await saveDoc({
      doc_type: "production", occurred_at: "2026-04-01T10:00:00+07:00", warehouse_id: prep, target_warehouse_id: prep,
      recipe_id: rec, output_product_id: sauce, output_qty: 2,
      lines: [{ product_id: flour, qty: 2 }],
    }));
    const at = "2026-04-01T12:00:00+07:00";
    const seen = await preview({ warehouse_id: prep, count_kind: "full", counted_at: at });
    const lines = seen.lines as { product_id: string; book_qty: number }[];
    assert.ok(lines.some((l) => l.product_id === sauce && n(l.book_qty) === 2));
    assert.ok(lines.some((l) => l.product_id === flour && n(l.book_qty) === 3));
    await expectError(
      preview({ warehouse_id: prep, count_kind: "partial", counted_at: at, product_ids: [sauce], explode_product_ids: [sauce] }),
      "ERP_COUNT_BOTH_MODES",
    );
    const id = await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: at, warehouse_id: prep,
      lines: [
        { product_id: sauce, qty: 2 },
        { product_id: flour, qty: 3 },
      ],
    });
    await post(id);
    assert.equal(await stock(sauce, prep), 2);
    assert.equal(await stock(flour, prep), 3);
    assert.equal(n(await value("select coalesce(in_composition_qty,0) from public.erp_document_lines where document_id = $1 and product_id = $2", [id, flour])), 0);
  });

  await test("count: dish tech card adds composition without double-counting a stocked prep", async () => {
    const bun2 = await saveProduct({ type: "ingredient", name_en: "Count bun", base_unit: "pcs" });
    const patty2 = await saveProduct({ type: "semi_finished", name_en: "Count patty", base_unit: "pcs" });
    const rec = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: patty2, yield_qty: 1, lines: [{ product_id: bun2, qty: 99 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [rec, ACTOR]);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-04-10T08:00:00+07:00", warehouse_id: prep, lines: [{ product_id: bun2, qty: 20, unit_price: 1000 }] }));
    await post(await saveDoc({
      doc_type: "production", occurred_at: "2026-04-10T10:00:00+07:00", warehouse_id: prep, target_warehouse_id: prep,
      output_product_id: patty2, output_qty: 4, lines: [{ product_id: bun2, qty: 4 }],
    }));
    const dishId = await value<string>("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({ name_en: "Count burger dish", lines: [{ product_id: bun2, qty: 1 }, { product_id: patty2, qty: 1 }] }),
      ACTOR,
    ]);
    const at = "2026-04-10T12:00:00+07:00";
    const id = await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: at, warehouse_id: prep,
      dish_lines: [{ dish_id: dishId, qty: 2, counted: true }],
      lines: [
        { product_id: bun2, qty: 10 },
        { product_id: patty2, qty: 4 },
      ],
    });
    const got = await countGet(id);
    const lines = got.lines as { product_id: string; in_composition_qty: number }[];
    assert.equal(n(lines.find((l) => l.product_id === bun2)!.in_composition_qty), 2, "bun from two dishes");
    assert.equal(n(lines.find((l) => l.product_id === patty2)!.in_composition_qty), 2, "stocked patty stops the walk");
    const comps = got.components as { product_id: string; qty: number }[];
    assert.ok(!comps.some((c) => n(c.qty) === 198), "patty recipe is not exploded");
    await post(id);
    assert.equal(await stock(bun2, prep), 12, "fact 10 + 2 in dishes, book 16, leftover 12");
    assert.equal(await stock(patty2, prep), 6, "fact 4 + 2 in dishes");
  });

  await test("count: posted explosion keeps the recipe version; a later card is not applied", async () => {
    const water = await saveProduct({ type: "ingredient", name_en: "Count water", base_unit: "l" });
    const mix = await saveProduct({ type: "semi_finished", name_en: "Count mix ghost", base_unit: "l" });
    const v1 = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: mix, yield_qty: 1, lines: [{ product_id: water, qty: 2 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [v1, ACTOR]);
    await q("update public.erp_recipes set activated_at = '2026-04-01T00:00:00+07:00', created_at = '2026-04-01T00:00:00+07:00' where id = $1", [v1]);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-05-01T08:00:00+07:00", warehouse_id: prep, lines: [{ product_id: water, qty: 10, unit_price: 1000 }] }));
    const at = "2026-05-01T12:00:00+07:00";
    const id = await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: at, warehouse_id: prep,
      lines: [
        { product_id: water, qty: 6 },
        { product_id: mix, qty: 1, counted: true, count_mode: "explode" },
      ],
    });
    await post(id);
    const before = await q<{ recipe_id: string; qty: string }>("select recipe_id, qty from public.erp_count_components where document_id = $1", [id]);
    assert.equal(before[0].recipe_id, v1);
    assert.equal(n(before[0].qty), 2);
    const v2 = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ id: v1, product_id: mix, yield_qty: 1, lines: [{ product_id: water, qty: 9 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [v2, ACTOR]);
    await q("update public.erp_recipes set activated_at = '2026-05-15T00:00:00+07:00' where id = $1", [v2]);
    const after = await q<{ recipe_id: string; qty: string }>("select recipe_id, qty from public.erp_count_components where document_id = $1", [id]);
    assert.equal(after[0].recipe_id, v1, "posted count is not rebuilt on a new card");
    assert.equal(n(after[0].qty), 2);
    const fresh = await q<{ qty: string; recipe_id: string }>(
      "select qty, recipe_id from public.erp_count_explode('recipe', $1, 1, $2::timestamptz, '{}'::uuid[])",
      [mix, "2026-05-20T12:00:00+07:00"],
    );
    assert.equal(fresh[0].recipe_id, v2);
    assert.equal(n(fresh[0].qty), 9, "a new check would use the new card; the posted one does not");
    const ghost = await saveProduct({ type: "semi_finished", name_en: "Count no card", base_unit: "kg" });
    await expectError(
      q("select public.erp_count_explode('recipe', $1, 1, $2::timestamptz, '{}'::uuid[])", [ghost, at]),
      "ERP_RECIPE_MISSING",
    );
  });

  await test("count: full posting supersedes a partial draft without taking its fact or movements", async () => {
    const tea = await saveProduct({ type: "ingredient", name_en: "Count tea", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: tea, qty: 5, unit_price: 3000 }] }));
    const partial = await saveDoc({
      doc_type: "count", count_kind: "partial", warehouse_id: prep,
      lines: [{ product_id: tea, qty: 1 }],
    });
    const full = await saveDoc({
      doc_type: "count", count_kind: "full", warehouse_id: prep,
      lines: [{ product_id: tea, qty: 5 }],
    });
    await post(full);
    const row = await one<{ status: string; superseded_by: string }>("select status, superseded_by from public.erp_documents where id = $1", [partial]);
    assert.equal(row.status, "draft");
    assert.equal(row.superseded_by, full);
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1", [partial])), 0);
    assert.equal(await stock(tea, prep), 5, "fact 1 from the replaced draft is not applied");
  });

  await test("count: past date keeps later movements (plan 10, fact 8, then +5 → 13)", async () => {
    const ice = await saveProduct({ type: "ingredient", name_en: "Count ice", base_unit: "kg" });
    await post(await saveDoc({
      doc_type: "receipt", occurred_at: "2026-07-01T08:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: ice, qty: 10, unit_price: 1000 }],
    }));
    const later = await saveDoc({
      doc_type: "receipt", occurred_at: "2026-07-03T09:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: ice, qty: 5, unit_price: 1000 }],
    });
    await post(later);
    assert.equal(await stock(ice, prep), 15);
    const id = await saveDoc({
      doc_type: "count", count_kind: "partial", counted_at: "2026-07-02T12:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: ice, qty: 8 }],
    });
    const booked = await one<{ book_qty: string; diff_qty: string }>(
      "select book_qty, diff_qty from public.erp_document_lines where document_id = $1",
      [id],
    );
    assert.equal(n(booked.book_qty), 10);
    assert.equal(n(booked.diff_qty), -2);
    await post(id);
    assert.equal(await stock(ice, prep), 13, "later +5 is kept: 8 + 5, not 8");
    const report = await q<{ closing_qty: string }>(
      "select closing_qty from public.erp_movement_report('2026-07-01', '2026-07-31', $1) where product_id = $2",
      [prep, ice],
    );
    assert.equal(n(report[0].closing_qty), 13);
  });

  await test("count: retry of a posted count is idempotent; overlap is refused", async () => {
    const salt2 = await saveProduct({ type: "ingredient", name_en: "Count race salt", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-08-09T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: salt2, qty: 3, unit_price: 1 }] }));
    const at = "2026-08-10T12:00:00+07:00";
    const id = await saveDoc({ doc_type: "count", counted_at: at, warehouse_id: prep, lines: [{ product_id: salt2, qty: 3 }] });
    const first = await post(id);
    const again = await post(id);
    assert.equal(again.idempotent, true);
    assert.equal(n(first.total_cost), n(again.total_cost));
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1 and reversal_of is null", [id])), 0);
    const other = await saveDoc({ doc_type: "count", counted_at: at, warehouse_id: prep, lines: [{ product_id: salt2, qty: 2 }] });
    await expectError(post(other), "ERP_COUNT_OVERLAP");
    assert.equal(await stock(salt2, prep), 3);
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1", [other])), 0);
  });

  await test("count: two simultaneous posts of one document do not double-consume", async () => {
    const race = await saveProduct({ type: "ingredient", name_en: "Count simultaneous salt", base_unit: "kg" });
    await post(
      await saveDoc({
        doc_type: "receipt",
        occurred_at: "2026-08-11T00:00:00+07:00",
        warehouse_id: prep,
        lines: [{ product_id: race, qty: 10, unit_price: 1000 }],
      }),
    );
    const id = await saveDoc({
      doc_type: "count",
      counted_at: "2026-08-12T12:00:00+07:00",
      warehouse_id: prep,
      lines: [{ product_id: race, qty: 7, counted: true }],
    });
    const [a, b] = await Promise.allSettled([post(id), post(id)]);
    const ok = [a, b].filter((row): row is PromiseFulfilledResult<Record<string, unknown>> => row.status === "fulfilled");
    const failed = [a, b].filter((row) => row.status === "rejected");
    assert.ok(ok.length >= 1, "at least one post must succeed");
    for (const row of failed) {
      assert.match((row as PromiseRejectedResult).reason.message, /ERP_|idempotent|posted/i);
    }
    const fresh = ok.map((row) => row.value).filter((row) => row.idempotent !== true);
    assert.ok(fresh.length <= 1, "only one non-idempotent consume");
    assert.equal(await stock(race, prep), 7, "stock is adjusted once");
    assert.equal(n(await value("select coalesce(sum(qty), 0) from public.erp_movements where document_id = $1", [id])), -3);
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id = $1 and reversal_of is null", [id])), 1);
  });

  await test("count: reopen is audited and follows later counts; ordinary edit of a posted count is blocked", async () => {
    const peas = await saveProduct({ type: "ingredient", name_en: "Count peas", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-08-01T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: peas, qty: 10, unit_price: 2000 }] }));
    const c1 = await saveDoc({
      doc_type: "count", counted_at: "2026-08-02T00:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: peas, qty: 9 }],
    });
    await post(c1);
    await post(await saveDoc({ doc_type: "receipt", occurred_at: "2026-08-03T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: peas, qty: 2, unit_price: 2000 }] }));
    const c2 = await saveDoc({
      doc_type: "count", counted_at: "2026-08-04T00:00:00+07:00", warehouse_id: prep,
      lines: [{ product_id: peas, qty: 11 }],
    });
    await post(c2);
    await expectError(saveDoc({ id: c1, lines: [{ product_id: peas, qty: 8 }] }), "ERP_DOCUMENT_LOCKED");
    await expectError(reopen(c1, false), "ERP_COUNT_HAS_DEPENDENTS");
    await reopen(c1, true, "wrong fact");
    assert.equal(await value("select status from public.erp_documents where id = $1", [c1]), "draft");
    assert.equal(await value("select status from public.erp_documents where id = $1", [c2]), "draft");
    assert.equal(await stock(peas, prep), 12, "both count adjustments reversed; receipts remain");
    assert.ok(
      n(await value("select count(*) from public.erp_audit_log where entity_id = $1 and action = 'reopen'", [c1]))! >= 1,
    );
    await saveDoc({ id: c1, counted_at: "2026-08-02T00:00:00+07:00", warehouse_id: prep, lines: [{ product_id: peas, qty: 8 }] });
    await post(c1);
    assert.equal(await stock(peas, prep), 10, "8 at T1 plus later receipt 2");
  });

  await test("count: stock and movement report match the posted adjustments", async () => {
    const corn = await saveProduct({ type: "ingredient", name_en: "Count corn", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-09-01", warehouse_id: prep, lines: [{ product_id: corn, qty: 20, unit_price: 4000 }] }));
    await post(await saveDoc({ doc_type: "writeoff", doc_date: "2026-09-02", warehouse_id: prep, reason: "test", lines: [{ product_id: corn, qty: 3 }] }));
    const id = await saveDoc({
      doc_type: "count", doc_date: "2026-09-03", warehouse_id: prep, lines: [{ product_id: corn, qty: 16 }],
    });
    await post(id);
    assert.equal(await stock(corn, prep), 16);
    const rows = await q<Record<string, string>>(
      "select * from public.erp_movement_report('2026-09-01', '2026-09-30', $1) where product_id = $2",
      [prep, corn],
    );
    assert.equal(n(rows[0].closing_qty), 16);
    assert.equal(n(rows[0].in_qty), 20);
    assert.equal(n(rows[0].out_qty), 4);
    const view = await q<{ qty: string }>("select qty from public.erp_stock where product_id = $1 and warehouse_id = $2", [corn, prep]);
    assert.equal(n(view[0].qty), 16);
  });

  await test("receipt list shows the pack supplier when the document header is empty", async () => {
    const mm = await value<string>("select id from public.erp_suppliers where code = 'mm'");
    const other = await value<string>("select public.erp_save_ref('supplier', $1::jsonb, $2)", [JSON.stringify({ name: "Receipt other supplier" }), ACTOR]);
    const foil = await value<string>("select id from public.erp_products where name_en = 'Aluminum Foil (45x285m)'");
    const pack = await value<string>("select id from public.erp_product_packs where product_id = $1 and supplier_id = $2", [foil, mm]);
    const catalog = {
      suppliers: [
        { id: mm, name: "MM" },
        { id: other, name: "Receipt other supplier" },
      ],
      products: [{ id: foil, staff_supplier_id: null }],
      productPacks: [{ id: pack, product_id: foil, supplier_id: mm }],
    };
    const emptyHeader = { doc_type: "receipt" as const, supplier_id: null, lines: [{ product_id: foil, pack_id: pack, qty: 1 }] };
    assert.equal(documentSupplierLabel(catalog, emptyHeader), "MM", "brand MM Pro is not used as the supplier");
    assert.deepEqual(documentSupplierIds(catalog, emptyHeader), [mm]);
    assert.equal(receiptMatchesSupplier(documentSupplierIds(catalog, emptyHeader), new Set([mm])), true);
    assert.equal(receiptMatchesSupplier(documentSupplierIds(catalog, emptyHeader), new Set(["none"])), false);
    assert.equal(applyReceiptSupplier(catalog, emptyHeader).supplier_id, mm);

    const mixed = {
      ...emptyHeader,
      lines: [
        { product_id: foil, pack_id: pack, qty: 1 },
        { product_id: foil, pack_id: "missing", qty: 1 },
      ],
    };
    // Second line has no pack supplier and no unique product supplier besides the pack — still MM.
    assert.equal(documentSupplierLabel(catalog, mixed), "MM");

    const twoSuppliers = {
      suppliers: catalog.suppliers,
      products: [
        { id: foil, staff_supplier_id: null },
        { id: "oil", staff_supplier_id: other },
      ],
      productPacks: catalog.productPacks,
    };
    const several = {
      doc_type: "receipt" as const,
      supplier_id: null,
      lines: [
        { product_id: foil, pack_id: pack, qty: 1 },
        { product_id: "oil", qty: 1 },
      ],
    };
    assert.equal(documentSupplierLabel(twoSuppliers, several), "MM…");
    assert.equal(receiptMatchesSupplier(documentSupplierIds(twoSuppliers, several), new Set([mm])), true);
    assert.equal(applyReceiptSupplier(twoSuppliers, several).supplier_id, null, "do not invent a header when lines disagree");
  });

  await test("saving a receipt without supplier_id takes the pack supplier; posted lots stay untouched", async () => {
    const mm = await value<string>("select id from public.erp_suppliers where code = 'mm'");
    const other = await value<string>("select id from public.erp_suppliers where name = 'Receipt other supplier'");
    const foil = await value<string>("select id from public.erp_products where name_en = 'Aluminum Foil (45x285m)'");
    const pack = await value<string>("select id from public.erp_product_packs where product_id = $1", [foil]);
    const oil = await saveProduct({
      type: "ingredient",
      name_en: "Receipt supplier oil",
      base_unit: "l",
      packs: [{ label: "can", qty_base: 1, is_default: true, supplier_id: other }],
    });

    const draft = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [{ product_id: foil, pack_id: pack, qty: 2, unit_price: 10000 }],
    });
    const saved = await one<{ supplier_id: string; status: string }>("select supplier_id, status from public.erp_documents where id = $1", [draft]);
    assert.deepEqual([saved.supplier_id, saved.status], [mm, "draft"], "header filled from the pack");

    const mixed = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [
        { product_id: foil, pack_id: pack, qty: 1, unit_price: 10000 },
        { product_id: oil, qty: 1, unit_price: 20000 },
      ],
    });
    assert.equal(await value("select supplier_id from public.erp_documents where id = $1", [mixed]), null, "mixed line suppliers stay empty");

    await post(draft);
    const lotsBefore = n(await value("select count(*) from public.erp_lots where source_document_id = $1", [draft]));
    await q("select public.erp_apply_receipt_supplier($1)", [draft]);
    const after = await one<{ supplier_id: string; status: string }>("select supplier_id, status from public.erp_documents where id = $1", [draft]);
    assert.deepEqual([after.supplier_id, after.status], [mm, "posted"]);
    assert.equal(n(await value("select count(*) from public.erp_lots where source_document_id = $1", [draft])), lotsBefore, "apply does not create lots");
    assert.equal(await stock(foil, prep), 2);
  });

  await test("ordering units: shared catalog, maths, snapshots, no stock on create, no name-merge", async () => {
    assert.equal(packToBase(3, 1.284), 3.852);
    assert.equal(basePrice(128400, 1.284), 100000);
    assert.equal(packPrice(100000, 1.284), 128400);
    const xlsx = xlsxBytes("Фасовки", ["№", "Название", "Ед. измерения", "Количество"], [[1, "1.284 KG", "кг", 1.284]]);
    assert.equal(xlsx[0], 0x50);
    assert.equal(xlsx[1], 0x4b);
    const lotsBefore = n(await value("select count(*) from public.erp_lots"));

    const a = await savePack({ name: "1 KG", unit: "kg", qty_base: 1 });
    const b = await savePack({ name: "1 KG", unit: "kg", qty_base: 1 });
    assert.equal(a, b, "same name+unit+qty reuses the live catalog row");
    const dozen = await savePack({ name: "1 ДЕСЯТОК", unit: "pcs", qty_base: 10 });
    const bag = await savePack({ name: "1.284 KG", unit: "kg", qty_base: 1.284 });
    const bottle = await savePack({ name: "1 L", unit: "l", qty_base: 1 });
    await expectError(savePack({ name: "", unit: "kg", qty_base: 1 }), "ERP_INVALID");
    await expectError(savePack({ name: "zero", unit: "kg", qty_base: 0 }), "ERP_INVALID");
    await expectError(savePack({ name: "neg", unit: "kg", qty_base: -1 }), "ERP_INVALID");
    assert.equal(n(await value("select count(*) from public.erp_lots")), lotsBefore, "creating a pack does not touch stock");

    const flour = await saveProduct({ type: "ingredient", name_en: "Pack flour", base_unit: "kg", packs: [{ pack_id: bag, label: "1.284 KG", qty_base: 1.284, is_default: true }] });
    const sugar = await saveProduct({ type: "ingredient", name_en: "Pack sugar", base_unit: "kg", packs: [{ pack_id: bag, label: "1.284 KG", qty_base: 1.284, is_default: true }] });
    const water = await saveProduct({ type: "ingredient", name_en: "Pack water", base_unit: "l" });
    const linked = await q<{ product_id: string }>("select product_id from public.erp_product_packs where pack_id = $1 and archived_at is null order by product_id", [bag]);
    assert.equal(linked.length, 2);
    assert.deepEqual(linked.map((r) => r.product_id).sort(), [flour, sugar].sort());

    const qty = packToBase(3, 1.284);
    const doc = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [{ product_id: flour, pack_id: bag, pack_qty: 3, qty, unit_price: basePrice(128400, 1.284) }],
    });
    const snap = await one<{ pack_name: string; pack_unit: string; pack_qty_base: string; qty: string }>(
      "select pack_name, pack_unit, pack_qty_base, qty from public.erp_document_lines where document_id = $1",
      [doc],
    );
    assert.deepEqual([snap.pack_name, snap.pack_unit, n(snap.pack_qty_base), n(snap.qty)], ["1.284 KG", "kg", 1.284, 3.852]);
    await expectError(
      saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: water, pack_id: bag, pack_qty: 1, qty: 1.284, unit_price: 1 }] }),
      "ERP_PACK_UNIT",
    );
    await post(doc);
    assert.equal(await stock(flour, prep), 3.852);
    const cost = n(await value("select cost_amount from public.erp_document_lines where document_id = $1", [doc]));
    assert.equal(cost, 385200);

    await savePack({ id: bag, name: "1.284 KG edited", unit: "kg", qty_base: 2 });
    const afterEdit = await one<{ pack_name: string; pack_qty_base: string; qty: string }>(
      "select pack_name, pack_qty_base, qty from public.erp_document_lines where document_id = $1",
      [doc],
    );
    assert.deepEqual([afterEdit.pack_name, n(afterEdit.pack_qty_base), n(afterEdit.qty)], ["1.284 KG", 1.284, 3.852], "posted line keeps the snapshot");
    assert.equal(await stock(flour, prep), 3.852);

    await q("select public.erp_set_archived('pack', $1, true, $2)", [dozen, ACTOR]);
    assert.equal(await value("select archived_at is not null from public.erp_packs where id = $1", [dozen]), true);
    const migrated = await one<{ packs: string; links: string; same: boolean }>(
      `select (select count(*) from public.erp_packs) packs,
              (select count(*) from public.erp_product_packs) links,
              (select bool_and(k.pack_id is not null) from public.erp_product_packs k) same`,
    );
    assert.ok(n(migrated.packs)! > 0);
    assert.ok(n(migrated.links)! > 0);
    assert.equal(migrated.same, true);
    const mozzPacks = await q<{ product_id: string; pack_id: string }>(
      "select k.product_id, k.pack_id from public.erp_product_packs k join public.erp_products p on p.id = k.product_id where k.label = 'box 5*2 kg' and p.name_en = 'Cheese - Mozzarella' and k.archived_at is null order by p.brand, k.id",
    );
    const mozzProducts = [...new Set(mozzPacks.map((r) => r.product_id))];
    const mozzCatalog = [...new Set(mozzPacks.map((r) => r.pack_id))];
    assert.ok(mozzProducts.length >= 2, "mozzarella brands stay separate products");
    assert.equal(mozzCatalog.length, 1, "same ordering unit is shared");
    void a;
    void b;
    void bottle;
  });

  await test("exact pack duplicates merge: links, defaults, snapshots, stock, idempotent, no product merge", async () => {
    const canon = "00000000-0000-4000-8000-0000000000a1";
    const dup = "00000000-0000-4000-8000-0000000000a2";
    const pcsKg = "00000000-0000-4000-8000-0000000000a3";
    const flourA = await saveProduct({ type: "ingredient", name_en: "Merge flour A", base_unit: "kg" });
    const flourB = await saveProduct({ type: "ingredient", name_en: "Merge flour B", brand: "Other mill", base_unit: "kg" });
    const yogurt = await saveProduct({ type: "ingredient", name_en: "Merge yogurt", base_unit: "kg" });
    await db.exec("drop index if exists public.erp_packs_live_key_uidx");
    await q("insert into public.erp_packs (id, name, unit, qty_base) values ($1, 'merge-kg 1 kg', 'kg', 1), ($2, 'merge-kg 1 kg', 'kg', 1), ($3, 'merge-pcs 1 kg', 'kg', 1)", [
      canon,
      dup,
      pcsKg,
    ]);
    await q("insert into public.erp_product_packs (product_id, pack_id, label, qty_base, is_default) values ($1, $2, 'merge-kg 1 kg', 1, true), ($3, $4, 'merge-kg 1 kg', 1, true), ($5, $6, 'merge-pcs 1 kg', 1, true)", [
      flourA,
      canon,
      flourB,
      dup,
      yogurt,
      pcsKg,
    ]);
    const posted = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [{ product_id: flourA, pack_id: dup, pack_qty: 2, qty: 2, unit_price: 10000 }],
    });
    await post(posted);
    const postedSnap = await one<{ pack_id: string; pack_name: string; pack_qty_base: string; qty: string }>(
      "select pack_id, pack_name, pack_qty_base, qty from public.erp_document_lines where document_id = $1",
      [posted],
    );
    const draft = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [{ product_id: flourB, pack_id: dup, pack_qty: 1, qty: 1, unit_price: 10000 }],
    });
    const stockBefore = n(await value("select coalesce(sum(qty_left), 0) from public.erp_lots"));
    const valueBefore = n(await value("select coalesce(sum(qty_left * unit_cost), 0) from public.erp_lots"));
    const productsBefore = n(await value("select count(*) from public.erp_products"));

    const first = await value<Record<string, unknown>>("select public.erp_merge_exact_pack_duplicates()");
    assert.ok(n(first.extra)! >= 1);
    const second = await value<Record<string, unknown>>("select public.erp_merge_exact_pack_duplicates()");
    assert.equal(n(second.extra), 0, "second merge is a no-op");

    const links = await q<{ id: string; product_id: string; pack_id: string; is_default: boolean }>(
      "select id, product_id, pack_id, is_default from public.erp_product_packs where product_id in ($1, $2) and archived_at is null order by product_id",
      [flourA, flourB],
    );
    assert.equal(links.length, 2);
    assert.equal(links[0].pack_id, canon);
    assert.equal(links[1].pack_id, canon);
    assert.equal(links[0].is_default, true);
    assert.equal(links[1].is_default, true);
    assert.equal(await value("select archived_at is not null from public.erp_packs where id = $1", [dup]), true);
    assert.equal(await value("select archived_at is null from public.erp_packs where id = $1", [pcsKg]), true);
    assert.equal(n(await value("select count(*) from public.erp_products")), productsBefore, "products are not merged");

    const afterPosted = await one<{ pack_id: string; pack_name: string; pack_qty_base: string; qty: string }>(
      "select pack_id, pack_name, pack_qty_base, qty from public.erp_document_lines where document_id = $1",
      [posted],
    );
    assert.deepEqual(afterPosted, postedSnap, "posted snapshot and pack_id stay");
    assert.equal(await value("select pack_id from public.erp_document_lines where document_id = $1", [draft]), canon);
    assert.equal(n(await value("select coalesce(sum(qty_left), 0) from public.erp_lots")), stockBefore, "stock qty unchanged");
    assert.equal(n(await value("select coalesce(sum(qty_left * unit_cost), 0) from public.erp_lots")), valueBefore, "stock value unchanged");

    const reused = await savePack({ name: "merge-kg 1 kg", unit: "kg", qty_base: 1 });
    assert.equal(reused, canon, "savePack does not resurrect a duplicate");
    const saved = await saveProduct({
      id: flourB,
      type: "ingredient",
      name_en: "Merge flour B",
      brand: "Other mill",
      base_unit: "kg",
      packs: [{ id: links.find((l) => l.product_id === flourB)!.id, pack_id: dup, label: "merge-kg 1 kg", qty_base: 1, is_default: true }],
    });
    assert.equal(saved, flourB);
    assert.equal(await value("select pack_id from public.erp_product_packs where product_id = $1 and archived_at is null", [flourB]), canon);

    const extra = await saveProduct({ type: "ingredient", name_en: "Merge flour C", base_unit: "kg" });
    await q("insert into public.erp_product_packs (product_id, label, qty_base, is_default) values ($1, 'merge-kg 1 kg', 1, true)", [extra]);
    assert.equal(await value("select pack_id from public.erp_product_packs where product_id = $1", [extra]), canon);

    const rolled = await value<Record<string, number>>("select public.erp_rollback_pack_merges()");
    assert.ok(n(rolled.restored)! >= 1);
    assert.equal(await value("select archived_at is null from public.erp_packs where id = $1", [dup]), true);
    assert.equal(await value("select pack_id from public.erp_product_packs where product_id = $1 and archived_at is null", [flourB]), dup);
    await q("select public.erp_merge_exact_pack_duplicates()");
    assert.equal(await value("select pack_id from public.erp_product_packs where product_id = $1 and archived_at is null", [flourB]), canon);
  });

  await test("inventory period: write-off qty is unsigned and is split out of other outbound", async () => {
    const mapped = countFromDocument(
      {
        doc_type: "count",
        warehouse_id: "wh",
        status: "draft",
        lines: [
          {
            product_id: "p",
            qty: 5,
            counted: true,
            in_qty: 10,
            out_qty: 5,
            count_moves: [
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", doc_no: "TR-1", doc_type: "transfer", occurred_at: "2026-10-01T00:00:00Z", qty: -3, direction: "out" },
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", doc_no: "WO-1", doc_type: "writeoff", occurred_at: "2026-10-02T00:00:00Z", qty: -2, direction: "out" },
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", doc_no: "PR-1", doc_type: "production", occurred_at: "2026-10-03T00:00:00Z", qty: 4, direction: "in" },
            ],
          },
        ],
      },
      "counts-api",
      true,
      true,
    );
    const line = mapped.lines[0];
    assert.equal(line.writeoff_qty, 2, "write-off volume is positive");
    assert.equal(line.out_qty, 3, "other outbound excludes write-offs");
    assert.equal(line.in_qty, 10);
    assert.equal(line.movements?.writeoff?.[0].qty, 2);
    assert.equal(line.movements?.writeoff?.[0].href, "/erp/documents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
    assert.equal(line.movements?.out?.[0].qty, 3);
    assert.equal(line.movements?.out?.[0].href, "/erp/documents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    assert.equal(line.movements?.in?.[0].href, "/erp/preps/batch/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3");
    const viaApi = countFromDocument(
      {
        doc_type: "count",
        warehouse_id: "wh",
        status: "draft",
        lines: [
          {
            product_id: "p",
            qty: 5,
            counted: true,
            in_qty: 10,
            out_qty: 5,
            moves: [
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", doc_no: "TR-1", doc_type: "transfer", occurred_at: "2026-10-01T00:00:00Z", qty: -3, direction: "out" },
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", doc_no: "WO-1", doc_type: "writeoff", occurred_at: "2026-10-02T00:00:00Z", qty: -2, direction: "out" },
              { document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", doc_no: "PR-1", doc_type: "production", occurred_at: "2026-10-03T00:00:00Z", qty: 4, direction: "in" },
            ],
          },
        ],
      },
      "counts-api",
      true,
      true,
    );
    assert.equal(viaApi.lines[0].writeoff_qty, 2, "erp_count_get 'moves' is the same period jsonb as count_moves");
    assert.equal(viaApi.lines[0].out_qty, 3);
    assert.equal(viaApi.lines[0].movements?.in?.[0].href, "/erp/preps/batch/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3");
  });

  await test("production posting rejects a missing yield and batches with no ingredients consumed", async () => {
    const mix = await saveProduct({ type: "ingredient", name_en: "Guard mix", base_unit: "kg" });
    const dough = await saveProduct({ type: "semi_finished", name_en: "Guard dough", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: mix, qty: 4, unit_price: 8000 }] }));
    const movesAfterReceipt = n(await value("select count(*) from public.erp_movements"));
    const noYield = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: online,
      output_product_id: dough,
      lines: [{ product_id: mix, qty: 1 }],
    });
    await expectError(post(noYield), "ERP_INVALID");
    assert.equal(await value("select status from public.erp_documents where id = $1", [noYield]), "draft");
    assert.equal(await stock(mix, prep), 4);
    assert.equal(await stock(dough, online), 0);
    const empty = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: online,
      output_product_id: dough,
      output_qty: 2,
      lines: [{ product_id: mix, qty: 0 }],
    });
    await expectError(post(empty), "ERP_EMPTY_DOCUMENT");
    assert.equal(await stock(mix, prep), 4);
    assert.equal(await stock(dough, online), 0);
    assert.equal(n(await value("select count(*) from public.erp_movements")), movesAfterReceipt, "failed production post leaves no partial movements");
    assert.equal(n(await value("select count(*) from public.erp_movements where document_id in ($1, $2)", [noYield, empty])), 0);
  });

  await test("movement report: production ingredients out, output in, leftover after transfer", async () => {
    const w = await value<string>("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ name: "Report production", kind: "other" }), ACTOR]);
    const dest = await value<string>("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [JSON.stringify({ name: "Report dest", kind: "other" }), ACTOR]);
    const flour = await saveProduct({ type: "ingredient", name_en: "Report flour", base_unit: "kg" });
    const dough = await saveProduct({ type: "semi_finished", name_en: "Report dough", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", doc_date: "2026-10-01", warehouse_id: w, lines: [{ product_id: flour, qty: 10, unit_price: 5000 }] }));
    const batch = await saveDoc({
      doc_type: "production",
      doc_date: "2026-10-05",
      warehouse_id: w,
      target_warehouse_id: dest,
      output_product_id: dough,
      output_qty: 8,
      lines: [{ product_id: flour, qty: 9 }],
    });
    const posted = await post(batch);
    assert.equal(n(posted.total_cost), 45000);
    assert.equal(await stock(flour, w), 1);
    assert.equal(await stock(dough, dest), 8);
    assert.equal(await stock(dough, w), 0);
    const report = async (warehouse: string, product: string) =>
      one<Record<string, string | null>>("select * from public.erp_movement_report($1::date, $2::date, $3) where product_id = $4", [
        "2026-10-01",
        "2026-10-31",
        warehouse,
        product,
      ]);
    const flourAtW = await report(w, flour);
    assert.deepEqual([flourAtW.in_qty, flourAtW.in_value, flourAtW.out_qty, flourAtW.out_value, flourAtW.closing_qty, flourAtW.closing_value].map(n), [
      10, 50000, 9, 45000, 1, 5000,
    ]);
    const doughAtDest = await report(dest, dough);
    assert.deepEqual([doughAtDest.in_qty, doughAtDest.in_value, doughAtDest.out_qty, doughAtDest.closing_qty, doughAtDest.closing_value].map(n), [
      8, 45000, 0, 8, 45000,
    ]);
    const doughAtW = await q("select * from public.erp_movement_report('2026-10-01', '2026-10-31', $1) where product_id = $2", [w, dough]);
    assert.equal(doughAtW.length, 0);
    const tr = await saveDoc({
      doc_type: "transfer",
      doc_date: "2026-10-06",
      warehouse_id: dest,
      target_warehouse_id: w,
      lines: [{ product_id: dough, qty: 3 }],
    });
    await post(tr);
    assert.equal(await stock(dough, dest), 5);
    assert.equal(await stock(dough, w), 3);
    const afterTr = await report(dest, dough);
    assert.deepEqual([afterTr.in_qty, afterTr.out_qty, afterTr.closing_qty, afterTr.closing_value].map(n), [8, 3, 5, 28125]);
    const doughBack = await report(w, dough);
    assert.deepEqual([doughBack.in_qty, doughBack.in_value, doughBack.closing_qty].map(n), [3, 16875, 3]);
  });

  await test("write-off with pack consumes base qty, freezes snapshot, leftover follows FIFO", async () => {
    const oil = await saveProduct({ type: "ingredient", name_en: "Pack writeoff oil", base_unit: "l" });
    const pack = await savePack({ name: "WO 2 L", unit: "l", qty_base: 2 });
    await post(
      await saveDoc({
        doc_type: "receipt",
        doc_date: "2026-09-01",
        warehouse_id: prep,
        lines: [{ product_id: oil, qty: 6, unit_price: 100 }],
      }),
    );
    await post(
      await saveDoc({
        doc_type: "receipt",
        doc_date: "2026-09-02",
        warehouse_id: prep,
        lines: [{ product_id: oil, qty: 4, unit_price: 250 }],
      }),
    );
    const wo = await saveDoc({
      doc_type: "writeoff",
      warehouse_id: prep,
      reason: "pack test",
      lines: [{ product_id: oil, pack_id: pack, pack_qty: 3, qty: 6 }],
    });
    const res = await post(wo);
    assert.equal(n(res.total_cost), 600, "FIFO: 6 l of the 100-lot, not pack count or average");
    assert.equal(await stock(oil, prep), 4);
    const snap = await one<{ pack_name: string; pack_qty_base: string; pack_qty: string; qty: string }>(
      "select pack_name, pack_qty_base, pack_qty, qty from public.erp_document_lines where document_id = $1",
      [wo],
    );
    assert.deepEqual([snap.pack_name, n(snap.pack_qty_base), n(snap.pack_qty), n(snap.qty)], ["WO 2 L", 2, 3, 6]);
    await savePack({ id: pack, name: "WO 2 L edited", unit: "l", qty_base: 9 });
    const after = await one<{ pack_name: string; pack_qty_base: string; qty: string }>(
      "select pack_name, pack_qty_base, qty from public.erp_document_lines where document_id = $1",
      [wo],
    );
    assert.deepEqual([after.pack_name, n(after.pack_qty_base), n(after.qty)], ["WO 2 L", 2, 6], "posted write-off keeps pack snapshot");
    assert.equal(await stock(oil, prep), 4);
  });

  await test("FIFO on one receipt follows line order, not lot uuid", async () => {
    const spice = await saveProduct({ type: "ingredient", name_en: "FIFO same-time spice", base_unit: "kg" });
    await post(
      await saveDoc({
        doc_type: "receipt",
        warehouse_id: prep,
        lines: [
          { product_id: spice, qty: 6, unit_price: 250 },
          { product_id: spice, qty: 4, unit_price: 100 },
        ],
      }),
    );
    await post(
      await saveDoc({
        doc_type: "receipt",
        warehouse_id: prep,
        lines: [{ product_id: spice, qty: 5, unit_price: 50 }],
      }),
    );
    const wo = await saveDoc({
      doc_type: "writeoff",
      warehouse_id: prep,
      reason: "same-time fifo",
      lines: [{ product_id: spice, qty: 8 }],
    });
    const res = await post(wo);
    assert.equal(n(res.total_cost), 1700, "expensive first line is consumed before the later cheaper line, not cheapest-first");
    assert.equal(await stock(spice, prep), 7);
    const left = await q<{ unit_cost: string; qty_left: string }>(
      "select unit_cost, qty_left from public.erp_lots where product_id = $1 and qty_left > 0 order by unit_cost desc",
      [spice],
    );
    assert.deepEqual(
      left.map((row) => [n(row.unit_cost), n(row.qty_left)]),
      [
        [100, 2],
        [50, 5],
      ],
    );
  });

  await test("count_moves related docs match ledger document_ids for transfer, write-off and production", async () => {
    const item = await saveProduct({ type: "ingredient", name_en: "Moves link item", base_unit: "kg" });
    const prepOut = await saveProduct({ type: "semi_finished", name_en: "Moves link prep", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: prep, lines: [{ product_id: item, qty: 20, unit_price: 1000 }] }));
    const tr = await saveDoc({ doc_type: "transfer", warehouse_id: prep, target_warehouse_id: online, lines: [{ product_id: item, qty: 4 }] });
    await post(tr);
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, reason: "link", lines: [{ product_id: item, qty: 3 }] });
    await post(wo);
    const pr = await saveDoc({
      doc_type: "production",
      warehouse_id: prep,
      target_warehouse_id: prep,
      output_product_id: prepOut,
      output_qty: 2,
      lines: [{ product_id: item, qty: 5 }],
    });
    await post(pr);
    const book = await one<{ in_qty: string; out_qty: string; moves: ErpCountMove[] }>(
      "select in_qty, out_qty, moves from public.erp_count_book($1, $2, now(), now(), null)",
      [prep, item],
    );
    assert.equal(n(book.in_qty), 20);
    assert.equal(n(book.out_qty), 12);
    const types = new Map(book.moves.map((m) => [m.document_id, m.doc_type]));
    assert.equal(types.get(tr), "transfer");
    assert.equal(types.get(wo), "writeoff");
    assert.equal(types.get(pr), "production");
    const mapped = countFromDocument(
      {
        doc_type: "count",
        warehouse_id: prep,
        status: "draft",
        lines: [{ product_id: item, qty: 8, counted: true, in_qty: n(book.in_qty), out_qty: n(book.out_qty), count_moves: book.moves }],
      },
      "counts-api",
      true,
      true,
    );
    assert.equal(mapped.lines[0].writeoff_qty, 3);
    assert.equal(mapped.lines[0].out_qty, 9);
    assert.equal(mapped.lines[0].movements?.writeoff?.[0].href, `/erp/documents/${wo}`);
    assert.equal(mapped.lines[0].movements?.out?.find((m) => m.doc_id === pr)?.href, `/erp/preps/batch/${pr}`);
    const viaGet = countFromDocument(
      {
        doc_type: "count",
        warehouse_id: prep,
        status: "draft",
        lines: [{ product_id: item, qty: 8, counted: true, in_qty: n(book.in_qty), out_qty: n(book.out_qty), moves: book.moves }],
      },
      "counts-api",
      true,
      true,
    );
    assert.equal(viaGet.lines[0].writeoff_qty, 3);
    assert.equal(viaGet.lines[0].movements?.out?.find((m) => m.doc_id === pr)?.href, `/erp/preps/batch/${pr}`);
  });

  await test("no second ingredients catalog besides erp_products", async () => {
    assert.equal(await value("select to_regclass('public.erp_ingredients')"), null);
    assert.equal(await value("select to_regclass('public.erp_menu_items')"), null);
    const allowed = (await q<{ type: string }>("select distinct type from public.erp_products")).map((row) => row.type);
    for (const type of allowed) {
      assert.ok(["ingredient", "semi_finished", "finished", "packaging", "consumable"].includes(type), type);
    }
  });

  await test("tech-card quotes: last_lot, fifo_remaining, reference; unknown stays null", async () => {
    const kitchen = await wh("prep-kitchen");
    const flour = await saveProduct({ type: "ingredient", name_en: "Quote flour", base_unit: "kg" });
    const quote = async () =>
      one<{ last_lot: string | null; fifo_remaining: string | null; reference: string | null }>(
        "select last_lot, fifo_remaining, reference from public.erp_product_cost_quotes(null) where product_id = $1",
        [flour],
      );
    let row = await quote();
    assert.equal(n(row.last_lot), null);
    assert.equal(n(row.fifo_remaining), null);
    assert.equal(n(row.reference), null);

    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: flour, qty: 10, unit_price: 1000 }] }));
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: flour, qty: 5, unit_price: 4000 }] }));
    row = await quote();
    assert.equal(n(row.last_lot), 4000);
    assert.equal(n(row.reference), 4000);
    assert.ok(Math.abs(n(row.fifo_remaining)! - (10 * 1000 + 5 * 4000) / 15) < 1e-9);

    const mystery = await saveProduct({ type: "ingredient", name_en: "Quote mystery", base_unit: "kg" });
    await post(await saveDoc({ doc_type: "opening", warehouse_id: kitchen, lines: [{ product_id: mystery, qty: 2 }] }));
    const unknown = await one<{ last_lot: string | null; fifo_remaining: string | null; reference: string | null }>(
      "select last_lot, fifo_remaining, reference from public.erp_product_cost_quotes(null) where product_id = $1",
      [mystery],
    );
    assert.equal(n(unknown.last_lot), null);
    assert.equal(n(unknown.fifo_remaining), null);
    assert.equal(n(unknown.reference), null);
    assert.notEqual(n(unknown.last_lot), 0);
    assert.notEqual(n(unknown.fifo_remaining), 0);

    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: mystery, qty: 3, unit_price: 500 }] }));
    const mixed = await one<{ last_lot: string | null; fifo_remaining: string | null; reference: string | null }>(
      "select last_lot, fifo_remaining, reference from public.erp_product_cost_quotes(null) where product_id = $1",
      [mystery],
    );
    assert.equal(n(mixed.last_lot), 500);
    assert.equal(n(mixed.reference), 500);
    assert.equal(n(mixed.fifo_remaining), null, "any remaining unknown lot makes FIFO remaining null");
  });

  await test("preps explode for tech-card and do not add produced lots on top", async () => {
    const kitchen = await wh("prep-kitchen");
    const beef = await saveProduct({ type: "ingredient", name_en: "Quote beef", base_unit: "kg", est_unit_cost: 100 });
    const dough = await saveProduct({ type: "semi_finished", name_en: "Quote dough", base_unit: "kg" });
    const recipe = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: dough, yield_qty: 1, lines: [{ product_id: beef, qty: 2 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [recipe, ACTOR]);
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: beef, qty: 10, unit_price: 1000 }] }));
    await post(
      await saveDoc({
        doc_type: "production",
        warehouse_id: kitchen,
        target_warehouse_id: kitchen,
        recipe_id: recipe,
        output_product_id: dough,
        output_qty: 1,
        lines: [{ product_id: beef, qty: 2 }],
      }),
    );
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: beef, qty: 5, unit_price: 4000 }] }));

    const quotes = await q<{ product_id: string; last_lot: string | null; fifo_remaining: string | null; reference: string | null }>(
      "select product_id, last_lot, fifo_remaining, reference from public.erp_product_cost_quotes(null) where product_id = any($1)",
      [[beef, dough]],
    );
    const products = (await q<Record<string, unknown>>("select * from public.erp_products where id = any($1)", [[beef, dough]])).map((p) => ({
      id: p.id as string,
      type: p.type as CostProduct["type"],
      name_en: p.name_en as string,
      name_vn: p.name_vn as string,
      base_unit: p.base_unit as CostProduct["base_unit"],
      est_unit_cost: n(p.est_unit_cost),
      est_cost_source: p.est_cost_source as CostProduct["est_cost_source"],
    }));
    const recipes = [
      {
        id: recipe,
        product_id: dough,
        status: "active" as const,
        yield_qty: 1,
        lines: [{ product_id: beef, qty: 2 }],
      },
    ];
    const exploded = buildCostContext(products, recipes, { quotes, priceSource: "fifo_remaining" });
    const asSku = buildCostContext(products, recipes, { quotes, priceSource: "fifo_remaining", explodeRecipes: false });
    const recipeCost = costLine(exploded, dough, 1);
    const skuCost = costLine(asSku, dough, 1);
    assert.equal(recipeCost.source, "recipe");
    assert.equal(recipeCost.children?.length, 1);
    assert.ok(Math.abs(recipeCost.cost! - 2 * n(quotes.find((q) => q.product_id === beef)!.fifo_remaining)!) < 1e-6);
    assert.equal(skuCost.source, "fifo_remaining");
    assert.equal(skuCost.children, undefined);
    assert.equal(skuCost.cost, n(quotes.find((q) => q.product_id === dough)!.fifo_remaining));
    assert.notEqual(recipeCost.cost, (recipeCost.cost ?? 0) + (skuCost.cost ?? 0), "engine must not add both");
    assert.ok(recipeCost.cost !== skuCost.cost);

    const nested = await saveProduct({ type: "semi_finished", name_en: "Quote sauce nested", base_unit: "kg" });
    const nestedRecipe = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: nested, yield_qty: 1, lines: [{ product_id: dough, qty: 0.5 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [nestedRecipe, ACTOR]);
    const deep = buildCostContext(
      [
        ...products,
        {
          id: nested,
          type: "semi_finished",
          name_en: "Quote sauce nested",
          name_vn: "",
          base_unit: "kg",
          est_unit_cost: null,
          est_cost_source: null,
        },
      ],
      [...recipes, { id: nestedRecipe, product_id: nested, status: "active", yield_qty: 1, lines: [{ product_id: dough, qty: 0.5 }] }],
      { quotes, priceSource: "reference" },
    );
    const nestedLine = costLine(deep, nested, 1);
    assert.equal(nestedLine.source, "recipe");
    assert.equal(nestedLine.children?.[0].source, "recipe");
    assert.ok(Math.abs(nestedLine.cost! - 0.5 * 2 * 4000) < 1e-6);

    const cycleCtx = buildCostContext(products, [
      { id: "a", product_id: dough, status: "active", yield_qty: 1, lines: [{ product_id: dough, qty: 1 }] },
    ]);
    assert.equal(costLine(cycleCtx, dough, 1).children?.[0].issue, "cycle");
    assert.equal(DEFAULT_MENU_PRICE_SOURCE, "reference");
  });

  await test("card save does not move stock or rewrite posted documents", async () => {
    const kitchen = await wh("prep-kitchen");
    const item = await saveProduct({ type: "ingredient", name_en: "Card stock item", base_unit: "kg" });
    const prep = await saveProduct({ type: "semi_finished", name_en: "Card stock prep", base_unit: "kg" });
    const recipe = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ product_id: prep, yield_qty: 1, lines: [{ product_id: item, qty: 1 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [recipe, ACTOR]);
    await post(await saveDoc({ doc_type: "receipt", warehouse_id: kitchen, lines: [{ product_id: item, qty: 4, unit_price: 50 }] }));
    const batch = await saveDoc({
      doc_type: "production",
      warehouse_id: kitchen,
      target_warehouse_id: kitchen,
      recipe_id: recipe,
      output_product_id: prep,
      output_qty: 1,
      lines: [{ product_id: item, qty: 1 }],
    });
    await post(batch);
    const snap = async () =>
      one<{ lots: string; moves: string; qty: string; recipe_id: string; line_qty: string }>(
        `select
           (select count(*) from public.erp_lots)::text as lots,
           (select count(*) from public.erp_movements)::text as moves,
           (select qty_left from public.erp_lots where source_document_id = $1 and product_id = $2)::text as qty,
           (select recipe_id::text from public.erp_documents where id = $1) as recipe_id,
           (select qty::text from public.erp_document_lines where document_id = $1)::text as line_qty`,
        [batch, prep],
      );
    const before = await snap();
    await saveProduct({ id: item, type: "ingredient", name_en: "Card stock item renamed", base_unit: "kg", product_code: "CS-1" });
    const v2 = await value<string>("select public.erp_save_recipe($1::jsonb, $2)", [
      JSON.stringify({ id: recipe, yield_qty: 2, lines: [{ product_id: item, qty: 3 }] }),
      ACTOR,
    ]);
    await q("select public.erp_activate_recipe($1, $2)", [v2, ACTOR]);
    await value("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({ name_en: "Card stock dish", sale_price: 10, lines: [{ product_id: prep, qty: 1 }] }),
      ACTOR,
    ]);
    const after = await snap();
    assert.deepEqual(after, before);
    assert.equal(after.recipe_id, recipe);
  });

  await test("dish history snapshots; losses cost gross qty; VAT follows settings", async () => {
    const apple = await saveProduct({ type: "ingredient", name_en: "History apple", base_unit: "kg", est_unit_cost: 1000 });
    const dish = await value<string>("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({
        name_en: "History pie",
        sale_price: 20000,
        vat_rate: 8,
        lines: [{ product_id: apple, qty: 1.351, net_qty: 1, methods: ["clean"] }],
      }),
      ACTOR,
    ]);
    await value("select public.erp_save_dish($1::jsonb, $2)", [
      JSON.stringify({
        id: dish,
        name_en: "History pie",
        sale_price: 25000,
        vat_rate: 8,
        lines: [{ product_id: apple, qty: 1.351, net_qty: 1, methods: ["clean"] }],
      }),
      ACTOR,
    ]);
    const revisions = await value<Record<string, unknown>[]>("select public.erp_card_history('dish', $1, 10)", [dish]);
    assert.ok(revisions.length >= 2);
    const prices = revisions.map((row) => Number((row.snapshot as { sale_price: number }).sale_price));
    assert.ok(prices.includes(20000));
    assert.ok(prices.includes(25000));

    const products = [
      {
        id: apple,
        type: "ingredient" as const,
        name_en: "History apple",
        name_vn: "",
        base_unit: "kg" as const,
        est_unit_cost: 1000,
        est_cost_source: "manual" as const,
      },
    ];
    const ctx = menuCostContext({ products, recipes: [] });
    const line = costLine(ctx, apple, 1.351);
    assert.ok(Math.abs(line.cost! - 1351) < 1e-9, "cost uses gross qty, not net");

    const summary = summarize([line]);
    const withVat = channelResult(summary, { id: "d", name: "Direct", commission_pct: 0, price: 10800 }, { output_vat_enabled: true, default_output_vat_rate: 8 }, null);
    assert.ok(Math.abs(withVat.netRevenue! - 10000) < 1e-9);
    const noVat = channelResult(summary, { id: "d", name: "Direct", commission_pct: 0, price: 10800 }, { output_vat_enabled: false, default_output_vat_rate: 8 }, 10);
    assert.equal(noVat.vatRate, null);
    assert.equal(noVat.netRevenue, 10800);

    const dishRow = {
      lines: [{ id: "1", dish_id: dish, line_no: 1, product_id: apple, qty: 1.351, note: null }],
      sale_price: 10800,
      vat_rate: null,
      channel_prices: [] as { channel_id: string; sale_price: number }[],
    };
    const priced = dishCost(ctx, dishRow, { output_vat_enabled: false, default_output_vat_rate: null }, [
      { id: "d", code: "direct", name: "Direct", commission_pct: 0, sort: 0, archived_at: null },
    ]);
    assert.ok(priced.main);
    assert.ok(Math.abs(priced.summary.foodCost! - 1351) < 1e-9);
  });

  await test("sales locations: two seeds, no Gastrobar or Prep Kitchen; CRUD and unused delete", async () => {
    const rows = await q<{ code: string; name: string; is_active: boolean; default_warehouse_id: string | null }>(
      "select code, name, is_active, default_warehouse_id from public.erp_locations order by name",
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      ["Food Truck", "Online Kitchen"],
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.is_active));
    assert.ok(rows.every((r) => r.default_warehouse_id == null));
    assert.equal(
      n(await value("select count(*) from public.erp_locations where name ilike '%gastrobar%' or name ilike '%prep%'")),
      0,
    );
    assert.equal(
      await value("select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'erp_ingredient_categories')"),
      false,
    );
    assert.equal(
      await value("select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'erp_workshops')"),
      false,
    );

    const id = await value<string>("select public.erp_save_location($1::jsonb, $2)", [
      JSON.stringify({ name: "Beach stand", code: "beach-stand", address: "Sand 1", is_active: true, default_warehouse_id: warehouse }),
      ACTOR,
    ]);
    const saved = await one<{ name: string; address: string; is_active: boolean }>(
      "select name, address, is_active from public.erp_locations where id = $1",
      [id],
    );
    assert.deepEqual(saved, { name: "Beach stand", address: "Sand 1", is_active: true });
    await value("select public.erp_save_location($1::jsonb, $2)", [
      JSON.stringify({ id, name: "Beach stand", is_active: false }),
      ACTOR,
    ]);
    assert.equal(await value("select is_active from public.erp_locations where id = $1", [id]), false);

    const product = await saveProduct({ type: "ingredient", name_en: "Location kebab", base_unit: "kg" });
    await q("insert into public.erp_location_products (location_id, product_id, visible) values ($1, $2, true)", [id, product]);
    await expectError(q("select public.erp_delete_location($1, $2)", [id, ACTOR]), "ERP_LOCATION_IN_USE");
    await q("delete from public.erp_location_products where location_id = $1", [id]);
    await value("select public.erp_delete_location($1, $2)", [id, ACTOR]);
    assert.equal(n(await value("select count(*) from public.erp_locations where id = $1", [id])), 0);
    assert.equal(n(await value("select count(*) from public.erp_locations")), 2);
  });

  await test("ingredient categories reuse erp_categories; delete only with zero stock; 14-day trash", async () => {
    const meat = await value<string>("select public.erp_save_ref('category', $1::jsonb, $2)", [
      JSON.stringify({ name: "LOC MEAT" }),
      ACTOR,
    ]);
    const drinks = await value<string>("select public.erp_save_ref('category', $1::jsonb, $2)", [
      JSON.stringify({ name: "LOC SOFT DRINKS" }),
      ACTOR,
    ]);
    const steak = await saveProduct({ type: "ingredient", name_en: "LOC steak", base_unit: "kg", category_id: meat });
    const cola = await saveProduct({ type: "ingredient", name_en: "LOC cola", base_unit: "l", category_id: drinks });
    await post(
      await saveDoc({
        doc_type: "opening",
        warehouse_id: warehouse,
        lines: [{ product_id: steak, qty: 1, unit_price: 48000 }],
      }),
    );
    await expectError(q("select public.erp_delete_category($1, $2)", [meat, ACTOR]), "ERP_CATEGORY_HAS_STOCK");
    assert.equal(await value("select deleted_at from public.erp_categories where id = $1", [meat]), null);
    assert.equal(await stock(steak, warehouse), 1);

    await post(await saveDoc({ doc_type: "writeoff", warehouse_id: warehouse, lines: [{ product_id: steak, qty: 1 }] }));
    assert.equal(await stock(steak, warehouse), 0);
    await value("select public.erp_delete_category($1, $2)", [meat, ACTOR]);
    assert.ok(await value("select deleted_at from public.erp_categories where id = $1", [meat]));
    assert.equal(await value("select category_id from public.erp_products where id = $1", [steak]), meat, "trash keeps the link for restore");

    await value("select public.erp_restore_category($1, $2)", [meat, ACTOR]);
    assert.equal(await value("select deleted_at from public.erp_categories where id = $1", [meat]), null);

    await value("select public.erp_delete_category($1, $2)", [drinks, ACTOR]);
    await q("update public.erp_categories set deleted_at = clock_timestamp() - interval '15 days' where id = $1", [drinks]);
    await expectError(q("select public.erp_restore_category($1, $2)", [drinks, ACTOR]), "ERP_TRASH_EXPIRED");
    assert.equal(n(await value("select public.erp_purge_deleted_categories($1)", [ACTOR])), 1);
    assert.equal(n(await value("select count(*) from public.erp_categories where id = $1", [drinks])), 0);
    assert.equal(await value("select category_id from public.erp_products where id = $1", [cola]), null);

    const unknown = await saveProduct({ type: "ingredient", name_en: "LOC mystery meat", base_unit: "kg", category_id: meat });
    await post(await saveDoc({ doc_type: "opening", warehouse_id: warehouse, lines: [{ product_id: unknown, qty: 2 }] }));
    const stockRows = await q<ErpStockRow>("select product_id, warehouse_id, qty, known_value, cost_known, nearest_expiry from public.erp_stock where product_id = $1", [unknown]);
    assert.equal(stockValue(stockOf(stockByProduct(stockRows, null), unknown)), null, "unknown remaining value is null, not 0");

    const herbs = await value<string>("select public.erp_save_ref('category', $1::jsonb, $2)", [
      JSON.stringify({ name_en: "LOC HERBS", name_vn: "Rau thơm" }),
      ACTOR,
    ]);
    assert.deepEqual(await one<{ name_en: string; name_vn: string }>("select name_en, name_vn from public.erp_categories where id = $1", [herbs]), {
      name_en: "LOC HERBS",
      name_vn: "Rau thơm",
    });
    await value("select public.erp_save_ref('category', $1::jsonb, $2)", [
      JSON.stringify({ id: herbs, name_en: "LOC HERBS", name_vn: "" }),
      ACTOR,
    ]);
    assert.equal(await value("select name_vn from public.erp_categories where id = $1", [herbs]), "");
  });

  await test("supplier categories come from product.category_id; VAT follows settings", async () => {
    const cat = await value<string>("select public.erp_save_ref('category', $1::jsonb, $2)", [JSON.stringify({ name: "LOC PANTRY" }), ACTOR]);
    const supplier = await value<string>("select public.erp_save_ref('supplier', $1::jsonb, $2)", [JSON.stringify({ name: "LOC Farm" }), ACTOR]);
    const rice = await saveProduct({
      type: "ingredient",
      name_en: "LOC rice",
      base_unit: "kg",
      category_id: cat,
      staff: { listed: false, supplier_id: supplier, unit: "kg" },
    });
    await saveProduct({
      id: rice,
      type: "ingredient",
      name_en: "LOC rice",
      base_unit: "kg",
      category_id: cat,
      staff: { listed: false, supplier_id: supplier, unit: "kg" },
    });
    const ids = supplierCategoryIds(
      supplier,
      [{ id: rice, category_id: cat, staff_supplier_id: supplier, archived_at: null }],
      [],
    );
    assert.deepEqual(ids, [cat]);

    assert.equal(withInputVat(null, { input_vat_enabled: true, default_input_vat_rate: 10 }), null);
    assert.equal(withInputVat(1000, { input_vat_enabled: false, default_input_vat_rate: 10 }), 1000);
    assert.equal(withInputVat(1000, { input_vat_enabled: true, default_input_vat_rate: 10 }), 1100);

    const stats = ingredientCategoryStats(
      [
        { id: cat, code: "loc-pantry", name_en: "LOC PANTRY", name_vn: "", sort: 0, archived_at: null },
        { id: "pos", code: "burgers", name_en: "BURGERS", name_vn: "", sort: 1, archived_at: null },
      ],
      [
        { id: rice, code: "rice", type: "ingredient", name_en: "LOC rice", name_vn: "", category_id: cat, base_unit: "kg", archived_at: null } as never,
      ],
      [{ id: "dish", code: "burger", name_en: "Burger", name_vn: "", category_id: "pos", archived_at: null, sale_price: null, vat_rate: null, note: null, lines: [], channel_prices: [] }],
      [],
    );
    assert.ok(stats.some((row) => row.id === cat));
    assert.ok(!stats.some((row) => row.id === "pos"), "POS-only categories stay off the ingredient list");

    const packLinks = [{ product_id: rice, supplier_id: supplier, archived_at: null }];
    assert.deepEqual(packSupplierIds(rice, packLinks), [supplier]);
    assert.equal(packSupplierLabel(rice, packLinks, [{ id: supplier, name: "LOC Farm" }]), "LOC Farm");
    assert.deepEqual(packSupplierIds(rice, []), [], "no invented supplier when packs are empty");
  });

  await test("ingredient list losses and stock stay honest: empty losses are —, unknown cost is null", async () => {
    assert.equal(lossPercentsText({}), "—");
    assert.equal(
      lossPercentsText({ loss_clean_pct: null, loss_boil_pct: null, loss_fry_pct: null, loss_stew_pct: null, loss_bake_pct: null }),
      "—",
    );
    assert.equal(lossPercentsText({ loss_clean_pct: 26 }), "26% 0% 0% 0% 0%");
    assert.equal(
      lossPercentsText({ loss_clean_pct: 13, loss_boil_pct: 0, loss_fry_pct: 0, loss_stew_pct: 0, loss_bake_pct: 0 }),
      "13% 0% 0% 0% 0%",
    );
    assert.match(posterStockQty(0, "pcs"), /0[,.]00/);
    assert.match(posterStockQty(0, "kg"), /0[,.]000/);
    const unknownStock = { qty: 2, knownValue: 0, complete: false as const };
    assert.equal(stockValue(unknownStock), null);
    assert.equal(costNumber(costInfo(unknownStock, { est_unit_cost: 9000 })), null, "incomplete lots do not fall back to 0 or a card price");
    const emptyStock = { qty: 0, knownValue: 0, complete: true as const };
    assert.equal(stockValue(emptyStock), 0);
    assert.equal(costNumber(costInfo(emptyStock, { est_unit_cost: null })), null);
    assert.equal(costNumber(costInfo(emptyStock, { est_unit_cost: 1500 })), 1500);
  });

  await test("tech-card list yield initials and markup match Poster", async () => {
    assert.equal(dishInitials("CHEESEBURGER"), "CHE");
    assert.equal(dishInitials("CHEESE STEAKE DOG"), "CSD");
    assert.match(posterStockQty(0.18, "kg"), /0[,.]180/);
    assert.equal(posterDishMarkup(null, null, 180000), "—");
    assert.equal(posterDishMarkup(0, 0, 180000), "—");
    assert.equal(posterDishMarkup(38577.14, 237.4, 130000), "237%");
    assert.equal(posterDishMarkup(24030, -100, 0), "-100%");
  });

  await test("menu list URL keeps category and other filters; card from only accepts Menu lists", async () => {
    const cat = "pack-uuid";
    const href = menuListHref("/erp/menu/ingredients", {
      q: "foil",
      category: [cat],
      unit: ["pcs"],
      supplier: ["sup-1"],
      archived: true,
      sort: "stock",
      desc: true,
    });
    assert.equal(href, `/erp/menu/ingredients?q=foil&category=${cat}&unit=pcs&supplier=sup-1&archived=1&sort=stock&desc=1`);
    const parsed = parseMenuListSearch(href.split("?")[1]);
    assert.deepEqual(parsed.category, [cat]);
    assert.equal(parsed.q, "foil");
    assert.equal(parsed.archived, true);
    assert.equal(parsed.sort, "stock");
    assert.equal(parsed.desc, true);

    const card = withMenuListReturn(`/erp/products/${cat}`, href);
    assert.match(card, /^\/erp\/products\/pack-uuid\?from=/);
    const from = new URL(card, "https://gastrotruck.local").searchParams.get("from");
    assert.equal(from, href);
    assert.equal(menuListBackHref(from, "/erp/menu/ingredients"), href);
    assert.equal(menuListBackHref(undefined, "/erp/menu/ingredients"), "/erp/menu/ingredients");
    assert.equal(safeMenuListReturn("/erp/products"), null);
    assert.equal(safeMenuListReturn("https://evil.example/erp/menu/ingredients"), null);
    assert.equal(safeMenuListReturn("//evil.example/erp/menu"), null);
    assert.equal(safeMenuListReturn("/erp/menu/ingredients/../../service"), null);
    assert.equal(withMenuListReturn("/erp/products/x", "/erp/products"), "/erp/products/x");
    assert.equal(productEditorReturnHref("/orders/admin", "/erp/menu/ingredients"), "/orders/admin");
    assert.equal(productEditorReturnHref("/erp/products", "/erp/menu/ingredients"), "/erp/menu/ingredients");
  });

  await test("ingredient category names are stored fields: EN on RU/EN, VN on VN", async () => {
    const cat = { name_en: "MEAT & POULTRY", name_vn: "Thịt & gia cầm" };
    try {
      setErpLang("ru");
      assert.equal(categoryLabel(cat), "MEAT & POULTRY");
      assert.ok(!categoryLabel(cat).includes("/"));
      setErpLang("en");
      assert.equal(categoryLabel(cat), "MEAT & POULTRY");
      setErpLang("vn");
      assert.equal(categoryLabel(cat), "Thịt & gia cầm");
      assert.equal(categoryLabel({ name_en: "PANTRY", name_vn: "" }), "PANTRY");
      assert.equal(categoryLabel(undefined), "—");
    } finally {
      setErpLang("ru");
    }
  });

  await test("ingredient names are stored fields, not translations: EN on RU/EN, VN on VN", async () => {
    const foil = { name_en: "Aluminum Foil (45x285m)", name_vn: "Giấy bạc cuộn (45x285m)", brand: null as string | null };
    const englishOnly = { name_en: "Lime", name_vn: "  ", brand: null as string | null };
    try {
      setErpLang("ru");
      assert.equal(productTitle(foil), "Aluminum Foil (45x285m)");
      assert.equal(productTitle({ name_en: "Salt", name_vn: "Muối", brand: "Mlekpol" }), "Salt · Mlekpol");
      assert.ok(!productTitle(foil).includes("/"));
      setErpLang("en");
      assert.equal(productTitle(foil), "Aluminum Foil (45x285m)");
      setErpLang("vn");
      assert.equal(productTitle(foil), "Giấy bạc cuộn (45x285m)");
      assert.equal(productTitle(englishOnly), "Lime");
      assert.equal(productTitle({ name_en: "Salt", name_vn: "Salt" }), "Salt");
      assert.equal(productTitle({ name_en: "Salt", name_vn: "Muối", brand: "Mlekpol" }), "Muối · Mlekpol");
    } finally {
      setErpLang("ru");
    }
  });

  await test("ingredient card label is Характеристики; brand field name is unchanged", async () => {
    assert.equal(productBrandFieldLabel("ingredient"), "Характеристики");
    assert.equal(productBrandFieldLabel("packaging"), "Характеристики");
    assert.equal(productBrandFieldLabel("consumable"), "Характеристики");
    assert.equal(productBrandFieldLabel("finished"), "Бренд");
    assert.equal(productBrandFieldLabel("semi_finished"), "Бренд");
  });

  await test("product code is optional, trimmed, and not unique", async () => {
    assert.equal(productCodeFieldLabel(), "Код товара");
    const a = await saveProduct({ type: "ingredient", name_en: "Article A", base_unit: "kg", product_code: "  ART-1  " });
    const b = await saveProduct({ type: "ingredient", name_en: "Article B", base_unit: "kg", product_code: "ART-1" });
    const empty = await saveProduct({ type: "ingredient", name_en: "Article empty", base_unit: "kg", product_code: "" });
    const rows = await q<{ name_en: string; product_code: string | null }>(
      "select name_en, product_code from public.erp_products where id = any($1) order by name_en",
      [[a, b, empty]],
    );
    assert.deepEqual(rows, [
      { name_en: "Article A", product_code: "ART-1" },
      { name_en: "Article B", product_code: "ART-1" },
      { name_en: "Article empty", product_code: null },
    ]);
    await saveProduct({ id: a, type: "ingredient", name_en: "Article A", base_unit: "kg" });
    assert.equal((await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [a])).product_code, "ART-1");
    await saveProduct({ id: a, type: "ingredient", name_en: "Article A", base_unit: "kg", product_code: "   " });
    assert.equal(
      (await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [a])).product_code,
      "ART-1",
      "empty product_code on save must not wipe the stored kitchen SKU",
    );
  });

  await test("ingredient card save omits product_code and keeps pack SKU", async () => {
    const box = await savePack({ name: "Card-hide-code box", unit: "pcs", qty_base: 1800 });
    const id = await saveProduct({
      type: "ingredient",
      name_en: "Card-hide-code cup",
      base_unit: "pcs",
      product_code: "LEGACY",
      packs: [{ pack_id: box, label: "Card-hide-code box", qty_base: 1800, is_default: true, code: "LNU500" }],
    });
    await saveProduct({
      id,
      type: "ingredient",
      name_en: "Card-hide-code cup",
      base_unit: "pcs",
      packs: [{ pack_id: box, label: "Card-hide-code box", qty_base: 1800, is_default: true, code: "LNU500" }],
    });
    assert.equal((await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [id])).product_code, "LEGACY");
    assert.equal((await one<{ code: string }>("select code from public.erp_product_packs where product_id = $1 and archived_at is null", [id])).code, "LNU500");
  });

  await test("legacy product_code fills empty pack SKUs only", async () => {
    const cup = await savePack({ name: "Backfill cup box", unit: "pcs", qty_base: 1000 });
    const extra = await savePack({ name: "Backfill extra box", unit: "pcs", qty_base: 500 });
    const id = await saveProduct({
      type: "ingredient",
      name_en: "Backfill cup",
      base_unit: "pcs",
      product_code: "LNU500",
      packs: [
        { pack_id: cup, label: "Backfill cup box", qty_base: 1000, is_default: true, code: "KEEP-ME" },
        { pack_id: extra, label: "Backfill extra box", qty_base: 500, is_default: false },
      ],
    });
    await q(
      `update public.erp_product_packs k
       set code = btrim(p.product_code)
       from public.erp_products p
       where k.product_id = p.id
         and (k.code is null or btrim(k.code) = '')
         and p.product_code is not null
         and btrim(p.product_code) <> ''
         and p.id = $1`,
      [id],
    );
    const rows = await q<{ label: string; code: string | null }>(
      "select label, code from public.erp_product_packs where product_id = $1 and archived_at is null order by label",
      [id],
    );
    assert.deepEqual(rows, [
      { label: "Backfill cup box", code: "KEEP-ME" },
      { label: "Backfill extra box", code: "LNU500" },
    ]);
  });

  await test("pack link code is optional, per pack, and independent of product code", async () => {
    assert.equal(productCodeFieldLabel(), "Код товара");
    const kg = await savePack({ name: "Pack-code kg", unit: "kg", qty_base: 1 });
    const bag = await savePack({ name: "Pack-code bag", unit: "kg", qty_base: 2.5 });
    const id = await saveProduct({
      type: "ingredient",
      name_en: "Pack code item",
      name_vn: "Mặt hàng mã quy cách",
      base_unit: "kg",
      product_code: "ING-1",
      packs: [
        { pack_id: kg, label: "Pack-code kg", qty_base: 1, is_default: true, code: "  A  " },
        { pack_id: bag, label: "Pack-code bag", qty_base: 2.5, is_default: false, code: "B" },
      ],
    });
    const rows = await q<{ label: string; code: string | null }>(
      "select label, code from public.erp_product_packs where product_id = $1 and archived_at is null order by label",
      [id],
    );
    assert.deepEqual(rows, [
      { label: "Pack-code bag", code: "B" },
      { label: "Pack-code kg", code: "A" },
    ]);
    assert.equal((await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [id])).product_code, "ING-1");

    const saved = await q<{
      id: string;
      pack_id: string;
      label: string;
      qty_base: string;
      is_default: boolean;
      supplier_id: string | null;
      code: string | null;
    }>("select id, pack_id, label, qty_base, is_default, supplier_id, code from public.erp_product_packs where product_id = $1 and archived_at is null order by label", [id]);
    const payloadOf = (row: (typeof saved)[0], code?: string | null) => ({
      id: row.id,
      pack_id: row.pack_id,
      label: row.label,
      qty_base: Number(row.qty_base),
      is_default: row.is_default,
      supplier_id: row.supplier_id,
      ...(code === undefined ? {} : { code }),
    });
    await saveProduct({
      id,
      type: "ingredient",
      name_en: "Pack code item",
      name_vn: "Mặt hàng mã quy cách",
      base_unit: "kg",
      product_code: "ING-1",
      packs: saved.map((row) => payloadOf(row, row.label === "Pack-code kg" ? "" : row.code)),
    });
    const cleared = await q<{ label: string; code: string | null }>(
      "select label, code from public.erp_product_packs where product_id = $1 and archived_at is null order by label",
      [id],
    );
    assert.deepEqual(cleared, [
      { label: "Pack-code bag", code: "B" },
      { label: "Pack-code kg", code: null },
    ]);
    assert.equal((await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [id])).product_code, "ING-1");

    await saveProduct({
      id,
      type: "ingredient",
      name_en: "Pack code item",
      name_vn: "Mặt hàng mã quy cách",
      base_unit: "kg",
      product_code: "ING-KEEP",
      packs: saved.map((row) => payloadOf(row)),
    });
    const kept = await q<{ label: string; code: string | null; supplier_id: string | null; is_default: boolean }>(
      "select label, code, supplier_id, is_default from public.erp_product_packs where product_id = $1 and archived_at is null order by label",
      [id],
    );
    assert.deepEqual(
      kept.map((row) => ({ label: row.label, code: row.code })),
      [
        { label: "Pack-code bag", code: "B" },
        { label: "Pack-code kg", code: null },
      ],
      "omitting pack code keeps the stored value",
    );
    assert.equal((await one<{ product_code: string }>("select product_code from public.erp_products where id = $1", [id])).product_code, "ING-KEEP");
    assert.ok(kept.every((row) => row.supplier_id === null));
    assert.deepEqual(
      kept.map((row) => row.is_default),
      [false, true],
    );

    const mm = await value<string>("select id from public.erp_suppliers where code = 'mm'");
    await saveProduct({
      id,
      type: "ingredient",
      name_en: "Pack code item",
      name_vn: "Mặt hàng mã quy cách",
      base_unit: "kg",
      product_code: "ING-KEEP",
      packs: saved.map((row) => ({
        ...payloadOf(row, row.label === "Pack-code kg" ? null : "B"),
        supplier_id: mm,
      })),
    });
    const catalog = await value<unknown>("select public.erp_order_supplier_products($1)", [mm]);
    const item = (catalog as { id: string; packs: { code: string | null; label: string }[] }[]).find((row) => row.id === id);
    assert.ok(item);
    const byLabel = Object.fromEntries(item!.packs.map((pack) => [pack.label, pack.code]));
    assert.equal(byLabel["Pack-code bag"], "B");
    assert.equal(byLabel["Pack-code kg"] ?? null, null);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
