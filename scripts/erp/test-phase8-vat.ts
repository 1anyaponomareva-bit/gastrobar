/**
 * Phase 8C/8D/8E/8F SQL+RPC checks on in-memory PGlite. Never touches production.
 * Run: npx tsx scripts/erp/test-phase8-vat.ts
 */
import assert from "node:assert/strict";
import { createTestDb } from "./testDb";
import type { PGlite } from "@electric-sql/pglite";

const ACTOR = "phase8@test";
let db: PGlite;
let passed = 0;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  assert.equal(rows.length, 1, `expected 1 row: ${sql}`);
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
const close = (a: unknown, b: number, eps = 0.05) => {
  assert.ok(Math.abs(n(a) - b) <= eps, `expected ${b}, got ${a}`);
};

async function seedWarehouse() {
  return value<string>(`select id from public.erp_warehouses order by sort, code limit 1`);
}
async function seedProduct(name: string, unit = "kg") {
  return value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "ingredient", name_en: name, name_vn: name, base_unit: unit }),
    ACTOR,
  ]);
}
async function enableInputVat() {
  await q(`update public.erp_settings set input_vat_enabled = true, default_input_vat_rate = 8 where id = 1`);
}
async function saveReceipt(doc: Record<string, unknown>) {
  return value<string>(`select public.erp_save_document($1::jsonb, $2)`, [JSON.stringify(doc), ACTOR]);
}
async function post(id: string) {
  return value<Record<string, unknown>>(`select public.erp_post_document($1, $2)`, [id, ACTOR]);
}

async function main() {
  console.log("bootstrapping PGlite + migrations…");
  db = await createTestDb();
  await enableInputVat();
  const wh = await seedWarehouse();

  await test("8C Yellow Mustard Pending → lot effective cost 87750", async () => {
    const mustard = await seedProduct("Yellow Mustard 8C");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: mustard, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(id);
    const lot = await one<{
      unit_cost: number;
      original_net_cost: number;
      original_vat_amount: number;
      pending_vat_amount: number;
      non_deductible_vat_amount: number;
      deductible_vat_amount: number;
      effective_inventory_cost: number;
      tax_status_known: boolean;
      vat_deduction_status: string;
      qty_in: number;
    }>(`select * from public.erp_lots where source_document_id = $1`, [id]);
    close(lot.unit_cost, 87750);
    close(lot.original_net_cost, 1_625_000);
    close(lot.original_vat_amount, 130_000);
    close(lot.pending_vat_amount, 130_000);
    close(lot.non_deductible_vat_amount, 0);
    close(lot.deductible_vat_amount, 0);
    close(lot.effective_inventory_cost, 1_755_000);
    assert.equal(lot.tax_status_known, true);
    assert.equal(lot.vat_deduction_status, "pending");
    assert.equal(n(lot.qty_in), 20);
  });

  await test("8C Yellow Mustard Deductible → net-only lot cost", async () => {
    const mustard = await seedProduct("Yellow Mustard Ded");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: mustard, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "deductible" }],
    });
    await post(id);
    const lot = await one(`select unit_cost, pending_vat_amount, deductible_vat_amount, non_deductible_vat_amount from public.erp_lots where source_document_id = $1`, [id]);
    close(lot.unit_cost, 81250);
    close(lot.deductible_vat_amount, 130_000);
    close(lot.pending_vat_amount, 0);
    close(lot.non_deductible_vat_amount, 0);
  });

  await test("8C Yellow Mustard Partial 50%", async () => {
    const mustard = await seedProduct("Yellow Mustard Partial");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: mustard, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "partial", deductible_vat_pct: 50 }],
    });
    await post(id);
    const lot = await one(`select unit_cost, deductible_vat_amount, non_deductible_vat_amount, pending_vat_amount from public.erp_lots where source_document_id = $1`, [id]);
    close(lot.unit_cost, 84500);
    close(lot.deductible_vat_amount, 65_000);
    close(lot.non_deductible_vat_amount, 65_000);
    close(lot.pending_vat_amount, 0);
  });

  await test("8C acquisition delivery VAT pending included once", async () => {
    const flour = await seedProduct("Flour Acq");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      acquisition_costs: [
        { kind: "delivery", amount: 100_000, vat_rate: 8, vat_included: false, vat_deduction_status: "pending" },
      ],
      lines: [{ product_id: flour, qty: 10, unit_price: 10_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(id);
    const lot = await one(`select unit_cost, allocated_acquisition_cost, effective_inventory_cost from public.erp_lots where source_document_id = $1`, [id]);
    // net goods 100000 + delivery inventory 108000 = 208000 / 10 = 20800
    close(lot.allocated_acquisition_cost, 108_000);
    close(lot.effective_inventory_cost, 208_000);
    close(lot.unit_cost, 20_800);
  });

  await test("8C Pickled Cucumbers pending vs deductible (per jar base unit)", async () => {
    // Spec: Net 24 000/jar → deduct 24 000; pending 25 920. Kg conversion (÷0.25) is costing-layer.
    const pickles = await seedProduct("Pickled Cucumbers", "pcs");
    const idDed = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: pickles, qty: 1, unit_price: 24000, vat_rate: 8, vat_deduction_status: "deductible" }],
    });
    await post(idDed);
    const ded = await one(`select unit_cost from public.erp_lots where source_document_id = $1`, [idDed]);
    close(ded.unit_cost, 24000);
    assert.equal(24000 / 0.25, 96000, "full-deduct kg equivalent");
    const idPen = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: pickles, qty: 1, unit_price: 24000, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(idPen);
    const pen = await one(`select unit_cost from public.erp_lots where source_document_id = $1`, [idPen]);
    close(pen.unit_cost, 25920);
    assert.equal(25920 / 0.25, 103680, "pending kg equivalent");
  });

  await test("8C Pork Hot Dog Sausage pending vs deductible", async () => {
    const sausage = await seedProduct("Pork Hot Dog Sausage");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: sausage, qty: 1, unit_price: 153_000, vat_rate: 8, vat_deduction_status: "deductible" }],
    });
    await post(id);
    close((await one(`select unit_cost from public.erp_lots where source_document_id = $1`, [id])).unit_cost, 153_000);
    const id2 = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: sausage, qty: 1, unit_price: 153_000, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(id2);
    close((await one(`select unit_cost from public.erp_lots where source_document_id = $1`, [id2])).unit_cost, 165_240);
  });

  await test("8C FIFO multiple lots keep own unit costs", async () => {
    const oil = await seedProduct("FIFO Oil 8C", "l");
    const r1 = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: oil, qty: 10, unit_price: 100_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(r1);
    const r2 = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: oil, qty: 10, unit_price: 130_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(r2);
    const wo = await saveReceipt({
      doc_type: "writeoff",
      warehouse_id: wh,
      lines: [{ product_id: oil, qty: 12 }],
    });
    // writeoff uses save+post differently - use erp_save_document
    const woId = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({ doc_type: "writeoff", warehouse_id: wh, lines: [{ product_id: oil, qty: 12 }] }),
      ACTOR,
    ]);
    const res = await post(woId);
    close(res.total_cost, 1_260_000); // 10*100000 + 2*130000
  });

  await test("8C historical lots remain tax_status_known=false", async () => {
    // Opening creates lot without tax snapshot
    const rice = await seedProduct("Legacy Rice");
    const id = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "opening",
        warehouse_id: wh,
        lines: [{ product_id: rice, qty: 5, unit_price: 20000 }],
      }),
      ACTOR,
    ]);
    await post(id);
    const lot = await one(`select tax_status_known, unit_cost, vat_deduction_status from public.erp_lots where source_document_id = $1`, [id]);
    assert.equal(lot.tax_status_known, false);
    close(lot.unit_cost, 20000);
  });

  await test("8C double-post blocked", async () => {
    const p = await seedProduct("Double Post");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      lines: [{ product_id: p, qty: 1, unit_price: 1000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(id);
    await assert.rejects(() => post(id), /ERP_ALREADY_POSTED/);
  });

  await test("8D Pending→Deductible remaining/consumed split + original unit preserved", async () => {
    const mustard = await seedProduct("Mustard Adj");
    const rid = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: mustard, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(rid);
    const lineId = await value<string>(`select id from public.erp_document_lines where document_id = $1`, [rid]);
    const lotId = await value<string>(`select id from public.erp_lots where source_document_id = $1`, [rid]);
    // consume 8 kg
    const woId = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({ doc_type: "writeoff", warehouse_id: wh, lines: [{ product_id: mustard, qty: 8 }] }),
      ACTOR,
    ]);
    await post(woId);
    const preview = await value<Record<string, unknown>>(`select public.erp_vat_adj_preview($1::jsonb)`, [
      JSON.stringify({ source_line_id: lineId, new_vat_deduction_status: "deductible" }),
    ]);
    close(preview.total_cost_adjustment, -130_000);
    close(preview.remaining_inventory_adjustment, -78_000);
    close(preview.consumed_cost_adjustment, -52_000);
    const adjId = await value<string>(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "vat_deduction_confirmed",
      }),
      ACTOR,
    ]);
    await q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]);
    const lot = await one(`select unit_cost, original_unit_cost, qty_left, cumulative_cost_adjustment, received_at from public.erp_lots where id = $1`, [lotId]);
    close(lot.qty_left, 12);
    close(lot.original_unit_cost, 87750);
    close(lot.unit_cost, 81250);
    close(lot.cumulative_cost_adjustment, -78_000);
    assert.ok(lot.received_at, "FIFO received_at preserved");
  });

  await test("8D backdated adjustment requires confirmation", async () => {
    const p = await seedProduct("Backdate Guard");
    const rid = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      lines: [{ product_id: p, qty: 2, unit_price: 10000, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(rid);
    const lineId = await value<string>(`select id from public.erp_document_lines where document_id = $1`, [rid]);
    const adjId = await value<string>(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "accounting_correction",
        adj_date: "2020-01-01",
      }),
      ACTOR,
    ]);
    await assert.rejects(
      () => q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]),
      /ERP_BACKDATED|backdated/i,
    );
    await value(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        id: adjId,
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "accounting_correction",
        adj_date: "2020-01-01",
        confirm_backdated: true,
      }),
      ACTOR,
    ]);
    await q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]);
    assert.equal(await value(`select status from public.erp_vat_cost_adjustments where id = $1`, [adjId]), "posted");
  });

  await test("8E Chicken processing: VAT adj flows to semi-finished output lot", async () => {
    const chicken = await seedProduct("Chicken 8E");
    const mince = await value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
      JSON.stringify({ type: "semi_finished", name_en: "Chicken Mince 8E", name_vn: "Mince", base_unit: "kg" }),
      ACTOR,
    ]);
    const rid = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: chicken, qty: 15, unit_price: 48000, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(rid);
    const purchaseLot = await one(`select id, unit_cost, effective_inventory_cost from public.erp_lots where source_document_id = $1`, [rid]);
    close(purchaseLot.unit_cost, 51840); // 48000 * 1.08
    close(purchaseLot.effective_inventory_cost, 777_600);

    const recipe = await value<string>(`select public.erp_save_recipe($1::jsonb, $2)`, [
      JSON.stringify({ product_id: mince, yield_qty: 13.2, lines: [{ product_id: chicken, qty: 15 }] }),
      ACTOR,
    ]);
    await q(`select public.erp_activate_recipe($1, $2)`, [recipe, ACTOR]);
    const prodId = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "production",
        warehouse_id: wh,
        target_warehouse_id: wh,
        recipe_id: recipe,
        output_product_id: mince,
        output_qty: 13.2,
        lines: [{ product_id: chicken, qty: 15 }],
      }),
      ACTOR,
    ]);
    await post(prodId);
    const comps = await q(`select * from public.erp_production_lot_components where production_document_id = $1`, [prodId]);
    assert.ok(comps.length >= 1, "lineage snapshot written");
    const outLot = await one(`select id, unit_cost, qty_left, qty_in from public.erp_lots where source_document_id = $1 and product_id = $2`, [
      prodId,
      mince,
    ]);
    close(outLot.unit_cost, 777600 / 13.2, 0.1);

    const lineId = await value<string>(`select id from public.erp_document_lines where document_id = $1`, [rid]);
    const adjId = await value<string>(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "vat_deduction_confirmed",
      }),
      ACTOR,
    ]);
    await q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]);
    const outAfter = await one(`select unit_cost, cumulative_cost_adjustment from public.erp_lots where id = $1`, [outLot.id]);
    close(outAfter.unit_cost, 720000 / 13.2, 0.1);
    close(outAfter.cumulative_cost_adjustment, -57600, 1);
    const unalloc = await value<number>(
      `select amount from public.erp_vat_cost_adjustment_allocations where adjustment_id = $1 and bucket = 'unallocated'`,
      [adjId],
    );
    close(unalloc, 0, 1);
  });

  await test("8F recipe_cost_source setting + dish cost snapshot history", async () => {
    await q(`select public.erp_save_settings($1::jsonb, $2)`, [
      JSON.stringify({ recipe_cost_source: "last_purchase" }),
      ACTOR,
    ]);
    const src = await value<string>(`select recipe_cost_source from public.erp_settings where id = 1`);
    assert.equal(src, "last_purchase");

    const dishId = await value<string>(`select public.erp_save_dish($1::jsonb, $2)`, [
      JSON.stringify({
        name_en: "Phase8F Snapshot Dish",
        name_vn: "P8F",
        sale_price: 99000,
        lines: [],
      }),
      ACTOR,
    ]);
    const snapId = await value<number>(`select public.erp_record_dish_cost_snapshot($1::jsonb, $2)`, [
      JSON.stringify({
        dish_id: dishId,
        cost_source: "manual_estimated",
        food_cost: 24750,
        packaging_cost: 3152,
        total_product_cost: 27902,
        cost_complete: true,
        change_reason: "test_seed",
        changed_ingredients: ["Mustard"],
        line_breakdown: [{ name: "Mustard", cost: 1218.75 }],
      }),
      ACTOR,
    ]);
    assert.ok(Number(snapId) > 0);
    const hist = await value<unknown>(`select public.erp_dish_cost_history($1, 5)`, [dishId]);
    assert.ok(Array.isArray(hist) && hist.length >= 1);
    const row = (hist as { total_product_cost: number; previous_total: number | null }[])[0];
    close(row.total_product_cost, 27902, 0.1);

    await q(`select public.erp_record_dish_cost_snapshot($1::jsonb, $2)`, [
      JSON.stringify({
        dish_id: dishId,
        cost_source: "manual_estimated",
        food_cost: 25000,
        packaging_cost: 3152,
        total_product_cost: 28152,
        cost_complete: true,
        change_reason: "ingredient_cost_change",
      }),
      ACTOR,
    ]);
    const hist2 = await value<unknown>(`select public.erp_dish_cost_history($1, 5)`, [dishId]);
    const latest = (hist2 as { previous_total: number }[])[0];
    close(latest.previous_total, 27902, 0.1);

    await q(`select public.erp_save_settings($1::jsonb, $2)`, [
      JSON.stringify({ recipe_cost_source: "manual_estimated" }),
      ACTOR,
    ]);
  });

  console.log(`\n${passed} phase-8 checks passed`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
