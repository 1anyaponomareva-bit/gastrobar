/**
 * Phase 8G — Release 2 acceptance controls on in-memory PGlite.
 * Never touches production. Run: npx tsx scripts/erp/test-phase8g-acceptance.ts
 *
 * Covers SQL/RPC paths for Mustard / Pickles / Sausage / FIFO multi-lot /
 * tax modes / VAT adjust / recipe policy — complementary to unit tests.
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createTestDb } from "./testDb";
import type { PGlite } from "@electric-sql/pglite";
import {
  CONTROL_PICKLED_CUCUMBERS,
  CONTROL_PORK_HOT_DOG,
  CONTROL_YELLOW_MUSTARD,
  DANISH_HOT_DOG_LEGACY_FOOD,
  DANISH_HOT_DOG_LEGACY_PACK,
  DANISH_HOT_DOG_LEGACY_TOTAL,
  recipeCostFromKg,
  recipeCostFromUsablePack,
  pieceCostFromKg,
  usablePackMetrics,
} from "../../src/lib/erp/recipeCosting";
import { calculateChannelFinance, danishHotDogInput } from "../../src/lib/erp/financialCalculator";

const ACTOR = "phase8g@test";
let db: PGlite;
let passed = 0;
const results: Record<string, unknown> = { controls: {}, finance: {}, notes: [] as string[] };

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
async function seedProduct(name: string, unit = "kg", extra: Record<string, unknown> = {}) {
  return value<string>(`select public.erp_save_product($1::jsonb, $2)`, [
    JSON.stringify({ type: "ingredient", name_en: name, name_vn: name, base_unit: unit, ...extra }),
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
  console.log("Phase 8G acceptance — PGlite bootstrap…");
  db = await createTestDb();
  await enableInputVat();
  const wh = await seedWarehouse();

  // ---- Schema / migration smoke ----
  await test("8G migrations: R2 objects exist", async () => {
    const cols = await q<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='erp_lots'
         and column_name in ('tax_status_known','pending_vat_amount','effective_inventory_cost','vat_deduction_status')`,
    );
    assert.ok(cols.length >= 4);
    assert.equal(
      await value<number>(`select count(*)::int from information_schema.tables
        where table_schema='public' and table_name in
        ('erp_vat_cost_adjustments','erp_vat_cost_adjustment_allocations','erp_production_lot_components','erp_dish_cost_snapshots')`),
      4,
    );
    assert.ok(
      await value<boolean>(`select exists(select 1 from information_schema.columns
        where table_name='erp_settings' and column_name='recipe_cost_source')`),
    );
  });

  // ---- §9 Yellow Mustard via SQL receipt ----
  await test("8G Mustard 20kg — Pending / Deductible / Partial50 via lots", async () => {
    const pending = await seedProduct("8G Mustard Pending");
    const ded = await seedProduct("8G Mustard Deductible");
    const part = await seedProduct("8G Mustard Partial");

    const idP = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: pending, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(idP);
    const lotP = await one<{ unit_cost: number; effective_inventory_cost: number }>(
      `select unit_cost, effective_inventory_cost from public.erp_lots where source_document_id=$1`,
      [idP],
    );
    close(lotP.unit_cost, 87750);
    close(lotP.effective_inventory_cost, 1_755_000);

    const idD = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: ded, qty: 20, unit_price: 81250, vat_rate: 8, vat_deduction_status: "deductible" }],
    });
    await post(idD);
    const lotD = await one<{ unit_cost: number; effective_inventory_cost: number }>(
      `select unit_cost, effective_inventory_cost from public.erp_lots where source_document_id=$1`,
      [idD],
    );
    close(lotD.unit_cost, 81250);
    close(lotD.effective_inventory_cost, 1_625_000);

    const idPart = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [
        {
          product_id: part,
          qty: 20,
          unit_price: 81250,
          vat_rate: 8,
          vat_deduction_status: "partial",
          deductible_vat_pct: 50,
        },
      ],
    });
    await post(idPart);
    const lotPart = await one<{ unit_cost: number }>(
      `select unit_cost from public.erp_lots where source_document_id=$1`,
      [idPart],
    );
    close(lotPart.unit_cost, 84500);

    results.controls = {
      ...(results.controls as object),
      mustard: {
        pendingPerKg: n(lotP.unit_cost),
        deductiblePerKg: n(lotD.unit_cost),
        partial50PerKg: n(lotPart.unit_cost),
        recipe15g: {
          full: recipeCostFromKg({ unitCostPerKg: 81250, recipeGrams: 15 }),
          pending: recipeCostFromKg({ unitCostPerKg: 87750, recipeGrams: 15 }),
          partial50: recipeCostFromKg({ unitCostPerKg: 84500, recipeGrams: 15 }),
        },
      },
    };
  });

  // ---- Tax rate modes on receipts ----
  await test("8G VAT rates 0/5/8/10 + exempt treatment on receipt lots", async () => {
    for (const rate of [0, 5, 8, 10]) {
      const p = await seedProduct(`8G Rate ${rate}`);
      const id = await saveReceipt({
        doc_type: "receipt",
        warehouse_id: wh,
        prices_include_vat: false,
        lines: [{ product_id: p, qty: 1, unit_price: 100_000, vat_rate: rate, vat_deduction_status: "pending" }],
      });
      await post(id);
      const lot = await one<{ unit_cost: number; original_vat_amount: number }>(
        `select unit_cost, original_vat_amount from public.erp_lots where source_document_id=$1`,
        [id],
      );
      close(lot.original_vat_amount, 100_000 * (rate / 100));
      close(lot.unit_cost, 100_000 + 100_000 * (rate / 100));
    }
    // exempt / not_subject via 0 + deductible (no VAT to inventory)
    const ex = await seedProduct("8G Exempt");
    const idEx = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: ex, qty: 1, unit_price: 50_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(idEx);
    close((await one<{ unit_cost: number }>(`select unit_cost from public.erp_lots where source_document_id=$1`, [idEx])).unit_cost, 50_000);
  });

  // ---- Pickles jar ----
  await test("8G Pickled Cucumbers jar receipt + usable recipe math", async () => {
    const pickles = await seedProduct("8G Pickles", "pcs", {
      unit_weight_kg: 0.515,
      unit_net_weight_kg: 0.25,
    });
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [
        {
          product_id: pickles,
          qty: 10,
          unit_price: 24_000,
          vat_rate: 8,
          vat_deduction_status: "deductible",
        },
      ],
    });
    await post(id);
    const lot = await one<{ unit_cost: number }>(`select unit_cost from public.erp_lots where source_document_id=$1`, [id]);
    close(lot.unit_cost, 24_000);
    const metrics = usablePackMetrics(0.515, 0.25)!;
    close(metrics.lossPercentage, CONTROL_PICKLED_CUCUMBERS.expected.lossPercentage, 1e-6);
    const full = recipeCostFromUsablePack({
      purchaseUnitCost: 24_000,
      netUsableKg: 0.25,
      recipeUsableKg: 0.025,
    });
    close(full.recipeCost!, 2_400);
    const pending = recipeCostFromUsablePack({
      purchaseUnitCost: 25_920,
      netUsableKg: 0.25,
      recipeUsableKg: 0.025,
    });
    close(pending.recipeCost!, 2_592);
    (results.controls as Record<string, unknown>).pickles = {
      lotUnitCost: n(lot.unit_cost),
      lossPct: metrics.lossPercentage,
      recipeFull: full.recipeCost,
      recipePending: pending.recipeCost,
      consumptionJars: full.inventoryConsumptionUnits,
    };
  });

  // ---- Sausage ----
  await test("8G Pork Hot Dog Sausage kg lot → piece cost", async () => {
    const sausage = await seedProduct("8G Pork Hot Dog", "kg");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: sausage, qty: 5, unit_price: 153_000, vat_rate: 8, vat_deduction_status: "deductible" }],
    });
    await post(id);
    const lot = await one<{ unit_cost: number }>(`select unit_cost from public.erp_lots where source_document_id=$1`, [id]);
    close(lot.unit_cost, 153_000);
    close(pieceCostFromKg({ unitCostPerKg: 153_000, weightPerPieceKg: 0.05 })!, 7_650);
    close(pieceCostFromKg({ unitCostPerKg: 165_240, weightPerPieceKg: 0.05 })!, 8_262);
    (results.controls as Record<string, unknown>).sausage = {
      lotUnitCost: n(lot.unit_cost),
      pieceFull: 7_650,
      piecePending: 8_262,
    };
  });

  // ---- FIFO multi-lot 10@80k + 10@90k → consume 12 ----
  await test("8G FIFO multiple lots: consume 12 → cost 980000, remain 8@720000", async () => {
    const sku = await seedProduct("8G FIFO Onion");
    const idA = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      doc_date: "2026-01-01",
      lines: [{ product_id: sku, qty: 10, unit_price: 80_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(idA);
    await q(`update public.erp_lots set received_at = '2026-01-01T00:00:00Z' where source_document_id=$1`, [idA]);

    const idB = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      doc_date: "2026-01-02",
      lines: [{ product_id: sku, qty: 10, unit_price: 90_000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(idB);
    await q(`update public.erp_lots set received_at = '2026-01-02T00:00:00Z' where source_document_id=$1`, [idB]);

    const writeoff = await value<string>(`select public.erp_save_document($1::jsonb, $2)`, [
      JSON.stringify({
        doc_type: "writeoff",
        warehouse_id: wh,
        reason: "8G FIFO control",
        lines: [{ product_id: sku, qty: 12 }],
      }),
      ACTOR,
    ]);
    const posted = await post(writeoff);
    const doc = await one<{ total_cost: number; cost_known: boolean }>(
      `select total_cost, cost_known from public.erp_documents where id=$1`,
      [writeoff],
    );
    close(doc.total_cost, 980_000, 1);
    assert.equal(doc.cost_known, true);

    // Negative movements = consume; amounts are signed
    const mov = await q<{ qty: number; unit_cost: number; amount: number }>(
      `select qty, unit_cost, amount from public.erp_movements
       where document_id=$1 and qty < 0 and reversal_of is null
       order by id`,
      [writeoff],
    );
    assert.ok(mov.length >= 2, "expected multi-lot FIFO movements");
    const consumed = mov.reduce((s, r) => s + Math.abs(n(r.amount)), 0);
    close(consumed, 980_000, 1);

    const remain = await q<{ qty_left: number; unit_cost: number; value: number }>(
      `select qty_left, unit_cost, qty_left * unit_cost as value
       from public.erp_lots where product_id=$1 and qty_left > 0`,
      [sku],
    );
    const remainQty = remain.reduce((s, r) => s + n(r.qty_left), 0);
    const remainVal = remain.reduce((s, r) => s + n(r.value), 0);
    close(remainQty, 8, 0.001);
    close(remainVal, 720_000, 1);

    // WAC of remaining must not have been used for the write-off total
    assert.notEqual(n(doc.total_cost), 12 * 85_000);

    (results.controls as Record<string, unknown>).fifo = {
      consumptionCost: consumed,
      documentTotalCost: n(doc.total_cost),
      remainingQty: remainQty,
      remainingValue: remainVal,
      movements: mov.map((a) => ({ qty: n(a.qty), unit_cost: n(a.unit_cost), amount: n(a.amount) })),
      postResult: posted,
    };
  });

  // ---- Pending → Deductible adjustment on unused lot ----
  await test("8G VAT adj Pending→Deductible preserves qty, changes unit cost", async () => {
    const p = await seedProduct("8G Adj Mustard");
    const rid = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: p, qty: 10, unit_price: 81_250, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(rid);
    const before = await one<{ id: string; unit_cost: number; qty_left: number }>(
      `select id, unit_cost, qty_left from public.erp_lots where source_document_id=$1`,
      [rid],
    );
    close(before.unit_cost, 87_750);
    const lineId = await value<string>(`select id from public.erp_document_lines where document_id=$1`, [rid]);
    const adjId = await value<string>(`select public.erp_vat_adj_save($1::jsonb, $2)`, [
      JSON.stringify({
        source_line_id: lineId,
        new_vat_deduction_status: "deductible",
        reason: "vat_deduction_confirmed",
      }),
      ACTOR,
    ]);
    await q(`select public.erp_vat_adj_post($1, $2, null)`, [adjId, ACTOR]);
    const after = await one<{ unit_cost: number; qty_left: number; qty_in: number }>(
      `select unit_cost, qty_left, qty_in from public.erp_lots where id=$1`,
      [before.id],
    );
    close(after.unit_cost, 81_250);
    close(after.qty_left, before.qty_left);
    close(after.qty_in, 10);
    const unalloc = await value<number>(
      `select coalesce(sum(amount),0) from public.erp_vat_cost_adjustment_allocations
       where adjustment_id=$1 and bucket='unallocated'`,
      [adjId],
    );
    close(unalloc, 0, 1);
  });

  // ---- Recipe cost policy setting ----
  await test("8G recipe_cost_source policies persist via erp_save_settings", async () => {
    for (const src of ["manual_estimated", "last_purchase", "weighted_average", "estimated_fifo"]) {
      await q(`select public.erp_save_settings($1::jsonb, $2)`, [JSON.stringify({ recipe_cost_source: src }), ACTOR]);
      assert.equal(await value(`select recipe_cost_source from public.erp_settings where id=1`), src);
    }
    await q(`select public.erp_save_settings($1::jsonb, $2)`, [
      JSON.stringify({ recipe_cost_source: "manual_estimated" }),
      ACTOR,
    ]);
  });

  // ---- Historical/legacy lots unknown tax ----
  await test("8G legacy lot tax_status_known=false stays without auto deduction", async () => {
    const p = await seedProduct("8G Legacy Lot");
    // Insert lot-like row via receipt then force unknown (simulates pre-8C)
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: p, qty: 1, unit_price: 10_000, vat_rate: 8, vat_deduction_status: "pending" }],
    });
    await post(id);
    await q(
      `update public.erp_lots set tax_status_known=false, vat_deduction_status=null, pending_vat_amount=0
       where source_document_id=$1`,
      [id],
    );
    const lot = await one<{ tax_status_known: boolean; vat_deduction_status: string | null }>(
      `select tax_status_known, vat_deduction_status from public.erp_lots where source_document_id=$1`,
      [id],
    );
    assert.equal(lot.tax_status_known, false);
    assert.equal(lot.vat_deduction_status, null);
  });

  // ---- Double-post blocked ----
  await test("8G double-post of receipt is rejected", async () => {
    const p = await seedProduct("8G Double Post");
    const id = await saveReceipt({
      doc_type: "receipt",
      warehouse_id: wh,
      prices_include_vat: false,
      lines: [{ product_id: p, qty: 1, unit_price: 1000, vat_rate: 0, vat_deduction_status: "deductible" }],
    });
    await post(id);
    let blocked = false;
    try {
      await post(id);
    } catch {
      blocked = true;
    }
    assert.ok(blocked, "second post must fail");
  });

  // ---- Danish Hot Dog finance matrix (calculator; live dish cost needs prod data) ----
  await test("8G Danish Hot Dog finance matrix @ 99/109/119k", async () => {
    const food = DANISH_HOT_DOG_LEGACY_FOOD;
    const pack = DANISH_HOT_DOG_LEGACY_PACK;
    close(food + pack, DANISH_HOT_DOG_LEGACY_TOTAL, 0.1);
    const matrix: Record<string, unknown>[] = [];
    for (const price of [99_000, 109_000, 119_000]) {
      for (const scenario of [
        { name: "Direct", commissionEnabled: false, advertisingEnabled: false, advertisingScenario: "organic" as const },
        { name: "Grab Organic", commissionEnabled: true, advertisingEnabled: true, advertisingScenario: "organic" as const, advertisingRate: 0 },
        { name: "Grab Standard", commissionEnabled: true, advertisingEnabled: true, advertisingScenario: "standard" as const, advertisingRate: 7 },
        { name: "Grab Full", commissionEnabled: true, advertisingEnabled: true, advertisingScenario: "full" as const, advertisingRate: 8 },
      ]) {
        const pending = calculateChannelFinance(
          danishHotDogInput({
            grossSellingPrice: price,
            foodCost: food,
            packagingCost: pack,
            ...scenario,
            commissionVatDeductionStatus: "pending",
            advertisingVatDeductionStatus: "pending",
          }),
        );
        const full = calculateChannelFinance(
          danishHotDogInput({
            grossSellingPrice: price,
            foodCost: food,
            packagingCost: pack,
            ...scenario,
            commissionVatDeductionStatus: "deductible",
            advertisingVatDeductionStatus: "deductible",
            forecastDeduction: "forecast_full",
          }),
        );
        matrix.push({
          price,
          channel: scenario.name,
          pendingCmPct: pending.contributionMarginPct,
          pendingCm: pending.contributionMargin,
          fullCmPct: full.contributionMarginPct,
          fullCm: full.contributionMargin,
          recommendedPending: pending.recommendedSellingPrice,
          recommendedFull: full.recommendedSellingPrice,
        });
      }
    }
    results.finance = { danishHotDogLegacyTotal: DANISH_HOT_DOG_LEGACY_TOTAL, food, pack, matrix };
    assert.ok(matrix.length === 12);
  });

  // ---- Cross-check pure controls ----
  await test("8G pure control constants still match §9", async () => {
    close(CONTROL_YELLOW_MUSTARD.expected.fullDeduction, 1218.75);
    close(CONTROL_YELLOW_MUSTARD.expected.pending, 1316.25);
    close(CONTROL_PORK_HOT_DOG.expected.fullDeductionPerPiece, 7650);
  });

  const outDir = path.join(process.cwd(), "docs", "assets");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "r2-phase8g-acceptance.json");
  writeFileSync(
    outFile,
    JSON.stringify({ passed, generatedAt: new Date().toISOString(), ...results }, null, 2),
    "utf8",
  );
  console.log(`\n${passed} phase-8G acceptance checks passed`);
  console.log(`wrote ${outFile}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
