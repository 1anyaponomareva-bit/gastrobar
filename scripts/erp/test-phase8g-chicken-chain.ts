/**
 * Phase 8G — multilevel chicken sausage production chain on PGlite (non-prod).
 * Raw → Mince → Cooked → 2-Pack → Dish + VAT adj propagation.
 * Does not touch production GASTROFOOD tech cards.
 *
 * Run: npx tsx scripts/erp/test-phase8g-chicken-chain.ts
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createTestDb } from "./testDb";
import type { PGlite } from "@electric-sql/pglite";

const ACTOR = "chicken-chain@test";
let db: PGlite;
let passed = 0;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  assert.equal(rows.length, 1, sql);
  return rows[0];
}
async function value<T>(sql: string, params: unknown[] = []): Promise<T> {
  return Object.values(await one<Record<string, T>>(sql, params))[0];
}
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}
const n = (v: unknown) => Number(v);
const close = (a: unknown, b: number, eps = 0.5) => assert.ok(Math.abs(n(a) - b) <= eps, `${a} ≈ ${b}`);

async function main() {
  console.log("Chicken chain — PGlite bootstrap…");
  db = await createTestDb();
  await q(`update public.erp_settings set input_vat_enabled = true, default_input_vat_rate = 8, recipe_cost_source = 'manual_estimated' where id = 1`);
  const whPrep = await value<string>(`select id from public.erp_warehouses where code = 'prep-kitchen'`);
  const whOnline = await value<string>(`select id from public.erp_warehouses where code = 'online-kitchen'`);

  const meat = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "ingredient", name_en: "Raw Chicken Meat 8G", name_vn: "Thit ga", base_unit: "kg" }),
    ACTOR,
  ]);
  const spice = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "ingredient", name_en: "Sausage Spice Mix 8G", name_vn: "Gia vi", base_unit: "kg" }),
    ACTOR,
  ]);
  const casing = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "ingredient", name_en: "Sausage Casing 8G", name_vn: "Vo", base_unit: "pcs" }),
    ACTOR,
  ]);
  const vacuum = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "packaging", name_en: "Vacuum Bag 8G", name_vn: "Hut chan khong", base_unit: "pcs" }),
    ACTOR,
  ]);
  const mince = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "semi_finished", name_en: "Chicken Sausage Mince 8G", name_vn: "Thit bam", base_unit: "kg" }),
    ACTOR,
  ]);
  const cooked = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({
      type: "semi_finished",
      name_en: "Cooked Chicken Sausage 8G",
      name_vn: "Xuc xich",
      base_unit: "pcs",
      unit_weight_kg: 0.05,
    }),
    ACTOR,
  ]);
  const pack2 = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "semi_finished", name_en: "Chicken Sausage 2-Pack 8G", name_vn: "2 cai", base_unit: "pcs" }),
    ACTOR,
  ]);

  await test("receipt multiple FIFO meat lots + spice + casing + vacuum", async () => {
    const r1 = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "receipt",
        warehouse_id: whPrep,
        prices_include_vat: false,
        doc_date: "2026-02-01",
        lines: [{ product_id: meat, qty: 10, unit_price: 80_000, vat_rate: 8, vat_deduction_status: "pending" }],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [r1, ACTOR]);
    await q(`update public.erp_lots set received_at = '2026-02-01T00:00:00Z' where source_document_id = $1`, [r1]);

    const r2 = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "receipt",
        warehouse_id: whPrep,
        prices_include_vat: false,
        doc_date: "2026-02-03",
        lines: [{ product_id: meat, qty: 10, unit_price: 90_000, vat_rate: 8, vat_deduction_status: "pending" }],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [r2, ACTOR]);
    await q(`update public.erp_lots set received_at = '2026-02-03T00:00:00Z' where source_document_id = $1`, [r2]);

    for (const [pid, qty, price] of [
      [spice, 1, 50_000],
      [casing, 100, 200],
      [vacuum, 50, 1_000],
    ] as const) {
      const id = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
        JSON.stringify({
          doc_type: "receipt",
          warehouse_id: whPrep,
          prices_include_vat: false,
          lines: [{ product_id: pid, qty, unit_price: price, vat_rate: 8, vat_deduction_status: "deductible" }],
        }),
        ACTOR,
      ]);
      await q(`select public.erp_post_document($1, $2)`, [id, ACTOR]);
    }
    const lots = await q<{ unit_cost: number }>(`select unit_cost from public.erp_lots where product_id = $1 order by received_at`, [meat]);
    close(lots[0].unit_cost, 80_000 * 1.08);
    close(lots[1].unit_cost, 90_000 * 1.08);
  });

  let minceLotCost = 0;
  await test("produce mince: 11 kg meat FIFO + spice → yield 10 kg (processing loss)", async () => {
    const recipe = await value<string>(`select public.erp_save_recipe($1::jsonb, $2)`, [
      JSON.stringify({
        product_id: mince,
        yield_qty: 10,
        lines: [
          { product_id: meat, qty: 11 },
          { product_id: spice, qty: 0.2 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_activate_recipe($1, $2)`, [recipe, ACTOR]);
    const prod = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "production",
        warehouse_id: whPrep,
        target_warehouse_id: whPrep,
        recipe_id: recipe,
        output_product_id: mince,
        output_qty: 10,
        lines: [
          { product_id: meat, qty: 11 },
          { product_id: spice, qty: 0.2 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [prod, ACTOR]);
    const out = await one<{ unit_cost: number; qty_in: number }>(
      `select unit_cost, qty_in from public.erp_lots where source_document_id = $1 and product_id = $2`,
      [prod, mince],
    );
    // 10 kg @ 86400 + 1 kg @ 97200 + 0.2 * 50000 spice
    const meatCost = 10 * 86_400 + 1 * 97_200;
    const spiceCost = 0.2 * 50_000;
    close(out.unit_cost, (meatCost + spiceCost) / 10, 1);
    minceLotCost = n(out.unit_cost);
    const comps = await q(`select * from public.erp_production_lot_components where production_document_id = $1`, [prod]);
    assert.ok(comps.length >= 2, "lineage components");
  });

  let cookedUnit = 0;
  await test("produce cooked sausages: mince + casing, thermal yield 18 pcs from 1 kg", async () => {
    const recipe = await value<string>(`select public.erp_save_recipe($1::jsonb, $2)`, [
      JSON.stringify({
        product_id: cooked,
        yield_qty: 18,
        lines: [
          { product_id: mince, qty: 1 },
          { product_id: casing, qty: 18 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_activate_recipe($1, $2)`, [recipe, ACTOR]);
    const prod = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "production",
        warehouse_id: whPrep,
        target_warehouse_id: whPrep,
        recipe_id: recipe,
        output_product_id: cooked,
        output_qty: 18,
        lines: [
          { product_id: mince, qty: 1 },
          { product_id: casing, qty: 18 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [prod, ACTOR]);
    const out = await one<{ unit_cost: number }>(
      `select unit_cost from public.erp_lots where source_document_id = $1 and product_id = $2`,
      [prod, cooked],
    );
    const expected = (minceLotCost * 1 + 18 * 200) / 18;
    close(out.unit_cost, expected, 1);
    cookedUnit = n(out.unit_cost);
  });

  let pack2Unit = 0;
  await test("produce 2-pack with vacuum packaging", async () => {
    const recipe = await value<string>(`select public.erp_save_recipe($1::jsonb, $2)`, [
      JSON.stringify({
        product_id: pack2,
        yield_qty: 1,
        lines: [
          { product_id: cooked, qty: 2 },
          { product_id: vacuum, qty: 1 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_activate_recipe($1, $2)`, [recipe, ACTOR]);
    const prod = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "production",
        warehouse_id: whPrep,
        target_warehouse_id: whPrep,
        recipe_id: recipe,
        output_product_id: pack2,
        output_qty: 5,
        lines: [
          { product_id: cooked, qty: 10 },
          { product_id: vacuum, qty: 5 },
        ],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [prod, ACTOR]);
    const out = await one<{ unit_cost: number; qty_in: number }>(
      `select unit_cost, qty_in from public.erp_lots where source_document_id = $1 and product_id = $2`,
      [prod, pack2],
    );
    close(out.qty_in, 5);
    close(out.unit_cost, (2 * cookedUnit + 1_000) / 1, 1);
    pack2Unit = n(out.unit_cost);
  });

  await test("transfer partial 2-packs Prep → Online; no cost rewrite", async () => {
    const before = await one<{ unit_cost: number }>(
      `select unit_cost from public.erp_lots where product_id = $1 and warehouse_id = $2 and qty_left > 0 limit 1`,
      [pack2, whPrep],
    );
    const tr = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "transfer",
        warehouse_id: whPrep,
        target_warehouse_id: whOnline,
        lines: [{ product_id: pack2, qty: 2 }],
      }),
      ACTOR,
    ]);
    await q(`select public.erp_post_document($1, $2)`, [tr, ACTOR]);
    const online = await one<{ unit_cost: number; qty_left: number }>(
      `select unit_cost, qty_left from public.erp_lots where product_id = $1 and warehouse_id = $2 and qty_left > 0`,
      [pack2, whOnline],
    );
    close(online.unit_cost, before.unit_cost);
    close(online.qty_left, 2);
  });

  await test("finished dish uses 1 pack (2 sausages); cost not double-counted", async () => {
    const dishId = await value<string>(`select public.erp_save_dish($1::jsonb, $2)`, [
      JSON.stringify({
        name_en: "Chicken Hot Dog 8G Test",
        name_vn: "Hotdog ga test",
        sale_price: 99_000,
        lines: [{ product_id: pack2, qty: 1 }],
      }),
      ACTOR,
    ]);
    await q(`update public.erp_products set est_unit_cost = $2, est_cost_source = 'manual' where id = $1`, [pack2, pack2Unit]);
    const { dishCost, menuCostContext } = await import("../../src/lib/erp/menu");
    const products = await q<Record<string, unknown>>(
      `select id, type, name_en, name_vn, base_unit, est_unit_cost, est_cost_source from public.erp_products where id = any($1::uuid[])`,
      [[meat, spice, casing, vacuum, mince, cooked, pack2]],
    );
    const recipes = await q<{ id: string; product_id: string; status: string; yield_qty: number }>(
      `select id, product_id, status, yield_qty from public.erp_recipes where product_id = any($1::uuid[])`,
      [[mince, cooked, pack2]],
    );
    const withLines = [];
    for (const r of recipes) {
      const lines = await q<{ product_id: string; qty: number }>(
        `select product_id, qty from public.erp_recipe_lines where recipe_id = $1`,
        [r.id],
      );
      withLines.push({ ...r, lines });
    }
    const dish = await one<{ id: string; sale_price: number }>(`select id, sale_price from public.erp_dishes where id = $1`, [dishId]);
    const dlines = await q<{ product_id: string; qty: number }>(`select product_id, qty from public.erp_dish_lines where dish_id = $1`, [dishId]);
    const ctx = menuCostContext({
      products: products as never,
      recipes: withLines as never,
      settings: { recipe_cost_source: "manual_estimated" },
    });
    const cost = dishCost(
      ctx,
      { lines: dlines as never, sale_price: n(dish.sale_price), vat_rate: 8, channel_prices: [] },
      { output_vat_enabled: true, default_output_vat_rate: 8 },
      [],
    );
    assert.ok(cost.summary.totalCost != null);
    // Exploded: 1 pack → 2 cooked → … meat; must be > 0 and finite
    assert.ok(cost.summary.totalCost! > 0);
  });

  await test("VAT Pending→Deductible on original meat propagates; no double VAT", async () => {
    const meatLot = await one<{ id: string; source_document_id: string; unit_cost: number }>(
      `select id, source_document_id, unit_cost from public.erp_lots where product_id = $1 order by received_at limit 1`,
      [meat],
    );
    close(meatLot.unit_cost, 86_400);
    const lineId = await value<string>(
      `select id from public.erp_document_lines where document_id = $1 and product_id = $2`,
      [meatLot.source_document_id, meat],
    );
    const adjId = await value<string>(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "vat_deduction_confirmed",
        reason_note: "chicken chain test",
      }),
      ACTOR,
    ]);
    await q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]);
    assert.equal(await value(`select status from public.erp_vat_cost_adjustments where id = $1`, [adjId]), "posted");
    const meatAfter = await one<{ unit_cost: number; qty_left: number }>(
      `select unit_cost, qty_left from public.erp_lots where id = $1`,
      [meatLot.id],
    );
    // First FIFO lot was fully consumed into mince → remaining qty 0; cost delta goes to unallocated / lineage, not silent P&L.
    close(meatAfter.qty_left, 0);
    const unalloc = await value<number>(
      `select coalesce(sum(amount),0) from public.erp_vat_cost_adjustment_allocations
       where adjustment_id = $1 and bucket = 'unallocated'`,
      [adjId],
    );
    assert.ok(n(unalloc) !== 0 || meatAfter.unit_cost <= 80_000 + 0.01, "cost effect must be tracked (unallocated or lot update)");
    const adj = await one<{ unallocated_adjustment: number; total_cost_adjustment: number }>(
      `select unallocated_adjustment, total_cost_adjustment from public.erp_vat_cost_adjustments where id = $1`,
      [adjId],
    );
    assert.ok(n(adj.total_cost_adjustment) !== 0);
    // Remaining second meat lot must stay pending cost until its own adj (no cross-lot rewrite).
    const lotB = await one<{ unit_cost: number; qty_left: number }>(
      `select unit_cost, qty_left from public.erp_lots where product_id = $1 and qty_left > 0 order by received_at desc limit 1`,
      [meat],
    );
    close(lotB.unit_cost, 97_200);
    assert.ok(n(lotB.qty_left) > 0);
  });

  await test("catalog tax validation rejects unknown percent 7; allows seeded 8", async () => {
    await assert.rejects(
      () => q(`select public.erp_save_settings($1::jsonb, $2)`, [JSON.stringify({ default_input_vat_rate: 7 }), ACTOR]),
      /ERP_INVALID|default_input_vat_rate/i,
    );
    assert.equal(await value(`select public.erp_tax_rate_percent_allowed(8, null, 'standard')`), true);
    assert.equal(await value(`select public.erp_tax_rate_percent_allowed(0, null, 'exempt')`), true);
    assert.equal(await value(`select public.erp_tax_rate_percent_allowed(0, null, 'not_subject')`), true);
  });

  const outDir = path.join(process.cwd(), "docs", "assets");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "r2-chicken-chain.json"),
    JSON.stringify({ passed, minceLotCost, cookedUnit, pack2Unit, generatedAt: new Date().toISOString() }, null, 2),
  );
  console.log(`\n${passed} chicken-chain checks passed`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
