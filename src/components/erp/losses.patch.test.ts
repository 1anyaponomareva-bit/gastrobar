import assert from "node:assert/strict";
import { test } from "node:test";
import type { LossMethod } from "@/lib/erp/costing";
import type { ErpState } from "@/lib/erp/types";
import { grossPatch, netOf, netPatch, type LossLine } from "./losses";

const state = {
  products: [
    {
      id: "meat",
      type: "ingredient",
      name_en: "Meat",
      name_vn: "",
      base_unit: "kg",
      loss_clean_pct: 20,
    },
  ],
} as unknown as ErpState;

test("without processing, editing brutto keeps a typed netto", () => {
  const line: LossLine = { product_id: "meat", qty: 0.005, methods: [], net_qty: 0.002 };
  assert.deepEqual(grossPatch(state, line, 0.006), { qty: 0.006 });
  assert.equal(netOf(state, { ...line, ...grossPatch(state, line, 0.006) }), 0.002);
});

test("without processing, clearing netto makes display follow brutto again", () => {
  const line: LossLine = { product_id: "meat", qty: 0.145, methods: [], net_qty: 0.14 };
  assert.deepEqual(netPatch(state, line, null), { net_qty: null });
  assert.equal(netOf(state, { ...line, net_qty: null }), 0.145);
});

test("with processing, brutto recalculates netto and netto back-calculates brutto", () => {
  const methods: LossMethod[] = ["clean"];
  const line: LossLine = { product_id: "meat", qty: 1, methods, net_qty: 0.8 };
  assert.deepEqual(grossPatch(state, line, 1), { qty: 1, net_qty: 0.8 });
  assert.deepEqual(netPatch(state, line, 0.8), { net_qty: 0.8, qty: 1 });
});

test("typed net 0 does not wipe brutto", () => {
  const methods: LossMethod[] = ["clean"];
  const line: LossLine = { product_id: "meat", qty: 1, methods, net_qty: 0.8 };
  assert.deepEqual(netPatch(state, line, 0), { net_qty: 0 });
});
