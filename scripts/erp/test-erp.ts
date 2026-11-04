/**
 * ERP database checks on an in-memory Postgres (PGlite). Never touches production.
 * Run: npm run test:erp
 */
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { DEFAULT_STAFF_CATALOG, sanitizeStaffCatalog, type StaffCatalog } from "../../src/data/staffCatalog";
import { RECIPES } from "../../src/data/recipes";
import {
  buildCostContext,
  channelResult,
  costLine,
  summarize,
  type CostProduct,
  type CostRecipe,
} from "../../src/lib/erp/costing";
import { applyMigration, createTestDb } from "./testDb";

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

async function main() {
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

  await test("write-off needs a reason; count posts the difference", async () => {
    const wo = await saveDoc({ doc_type: "writeoff", warehouse_id: prep, lines: [{ product_id: salt, qty: 0.1 }] });
    await expectError(post(wo), "ERP_REASON_REQUIRED");
    await saveDoc({ id: wo, warehouse_id: prep, reason: "spilled", lines: [{ product_id: salt, qty: 0.1 }] });
    await post(wo);
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
    assert.deepEqual(summary.missing, ["Burger box test / Hộp burger"]);
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
    assert.ok(Math.abs(direct.totalCostPct! - ((food + 2000) / net) * 100) < 1e-9);

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

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
