import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublicOrdersActor, KITCHEN_ORDERS_ACTOR } from "./access";
import {
  isMarkedQty,
  isProductMarked,
  reducePlaceDialog,
  reorderSubset,
  selectedFirst,
  shouldPlaceAfterDialog,
  sortCatalogProducts,
  supplierBadgeCounts,
  type SelectionMap,
} from "./orderList";

test("catalog list order follows staff_sort then name", () => {
  const sorted = sortCatalogProducts([
    { id: "b", sort: 2, nameEn: "Beef" },
    { id: "a", sort: 0, nameEn: "Salt" },
    { id: "c", sort: 0, nameEn: "Apple" },
  ]);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["c", "a", "b"],
  );
});

test("yellow selection is qty greater than zero", () => {
  assert.equal(isMarkedQty(""), false);
  assert.equal(isMarkedQty("0"), false);
  assert.equal(isMarkedQty("0,0"), false);
  assert.equal(isMarkedQty("1"), true);
  assert.equal(isMarkedQty("0.5"), true);
  assert.equal(isMarkedQty("1,5"), true);
  const selection: SelectionMap = {
    beef: { packId: "p1", qty: "2" },
    salt: { packId: "p2", qty: "" },
  };
  assert.equal(isProductMarked("beef", selection), true);
  assert.equal(isProductMarked("salt", selection), false);
});

test("supplier badge counts selected items of that supplier", () => {
  const products = [
    { id: "beef", supplierId: "mm" },
    { id: "salt", supplierId: "mm" },
    { id: "oil", supplierId: "sat" },
    { id: "ghost", supplierId: null },
  ];
  const selection: SelectionMap = {
    beef: { packId: null, qty: "1" },
    salt: { packId: null, qty: "0" },
    oil: { packId: null, qty: "3" },
  };
  const counts = supplierBadgeCounts(products, selection);
  assert.equal(counts.get("mm"), 1);
  assert.equal(counts.get("sat"), 1);
  assert.equal(counts.has("ghost"), false);
});

test("supplier page puts selected yellow rows first", () => {
  const products = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const selection: SelectionMap = {
    b: { packId: null, qty: "1" },
    a: { packId: null, qty: "" },
    c: { packId: null, qty: "2" },
  };
  assert.deepEqual(
    selectedFirst(products, selection).map((row) => row.id),
    ["b", "c", "a"],
  );
});

test("place happens only after dialog submit, not the button click", () => {
  let phase = reducePlaceDialog("closed", "open");
  assert.equal(phase, "open");
  assert.equal(shouldPlaceAfterDialog(phase), false);
  phase = reducePlaceDialog(phase, "cancel");
  assert.equal(phase, "closed");
  assert.equal(shouldPlaceAfterDialog(phase), false);
  phase = reducePlaceDialog("closed", "submit");
  assert.equal(shouldPlaceAfterDialog(phase), false);
  phase = reducePlaceDialog("open", "submit");
  assert.equal(phase, "submitted");
  assert.equal(shouldPlaceAfterDialog(phase), true);
});

test("admin drag keeps unmoved rows in place", () => {
  assert.deepEqual(reorderSubset(["a", "b", "c", "d"], ["c", "b"]), ["a", "c", "b", "d"]);
});

test("orders list is public; admin cookie is the only catalog editor", () => {
  assert.deepEqual(resolvePublicOrdersActor(null, null), {
    email: KITCHEN_ORDERS_ACTOR,
    erpAdmin: false,
    public: true,
  });
  assert.deepEqual(resolvePublicOrdersActor("owner@gastrofood", null), {
    email: "owner@gastrofood",
    erpAdmin: true,
    public: false,
  });
  assert.equal(resolvePublicOrdersActor(null, "cook@gastrofood").erpAdmin, false);
  assert.equal(resolvePublicOrdersActor(null, "cook@gastrofood").public, false);
});
