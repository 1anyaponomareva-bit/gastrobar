import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublicOrdersActor, KITCHEN_ORDERS_ACTOR } from "./access";
import {
  ALL_SUPPLIER_TAB,
  catalogCategories,
  filterBySupplierTab,
  groupProductsByCategory,
  isMarkedQty,
  isProductMarked,
  orderPackCaption,
  orderPackUnit,
  productDetailLine,
  reducePlaceDialog,
  reorderSubset,
  selectedFirst,
  shouldPlaceAfterDialog,
  sortCatalogProducts,
  supplierBadgeCounts,
  supplierTabChips,
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

test("supplier tab badges count qty>0 items for that supplier, not bottom cards", () => {
  const products = [
    { id: "beer", supplierId: "mm" },
    { id: "butter", supplierId: "mm" },
    { id: "cheese", supplierId: "hisina" },
    { id: "ghost", supplierId: null },
  ];
  const selection: SelectionMap = {
    beer: { packId: null, qty: "5" },
    butter: { packId: null, qty: "2" },
    cheese: { packId: null, qty: "0" },
  };
  const counts = supplierBadgeCounts(products, selection);
  assert.equal(counts.get("mm"), 2);
  assert.equal(counts.has("hisina"), false);
  const tabs = supplierTabChips(
    [
      { id: "mm", name: "MM" },
      { id: "hisina", name: "Hisina" },
      { id: "happy", name: "Happy Papa" },
    ],
    products,
    selection,
  );
  assert.deepEqual(
    tabs.map((tab) => [tab.id, tab.count]),
    [
      ["mm", 2],
      ["hisina", 0],
      ["happy", 0],
    ],
  );
});

test("supplier tab filters catalog to that supplier; All keeps every row", () => {
  const products = [
    { id: "beer", supplierId: "mm" },
    { id: "butter", supplierId: "mm" },
    { id: "cheese", supplierId: "hisina" },
  ];
  assert.deepEqual(
    filterBySupplierTab(products, "mm").map((row) => row.id),
    ["beer", "butter"],
  );
  assert.deepEqual(
    filterBySupplierTab(products, ALL_SUPPLIER_TAB).map((row) => row.id),
    ["beer", "butter", "cheese"],
  );
});

test("All tab groups by category; selected yellow rows stay in their group", () => {
  const products = [
    { id: "beer", categoryId: "alc", categoryName: "Alcohol / Rượu", supplierId: "mm" },
    { id: "butter", categoryId: "dairy", categoryName: "Dairy Products & Eggs / Sữa và trứng", supplierId: "mm" },
    { id: "cheese", categoryId: "dairy", categoryName: "Dairy Products & Eggs / Sữa và trứng", supplierId: "hisina" },
  ];
  const selection: SelectionMap = {
    beer: { packId: null, qty: "5" },
    butter: { packId: null, qty: "2" },
  };
  const categories = catalogCategories(products);
  const groups = groupProductsByCategory(products, categories);
  assert.deepEqual(
    groups.map((group) => [group.id, group.products.map((row) => row.id)]),
    [
      ["alc", ["beer"]],
      ["dairy", ["butter", "cheese"]],
    ],
  );
  assert.equal(isProductMarked("beer", selection), true);
  assert.deepEqual(
    groups[1].products.map((row) => row.id),
    ["butter", "cheese"],
  );
});

test("pack caption and details match Staff cards: 1 pack = N, supplier + pack SKU", () => {
  assert.equal(orderPackCaption({ label: "pack 24 pcs", unit: "pcs", qty_base: 24 }), "1 pack = 24 pcs");
  assert.equal(orderPackCaption({ label: "box 5 kg", unit: "kg", qty_base: 5 }), "1 box = 5 kg");
  assert.equal(orderPackCaption({ label: "24 pcs", unit: "pcs", qty_base: 24 }), "1 pack = 24 pcs");
  assert.equal(orderPackUnit({ label: "pack 24 pcs", unit: "pcs" }, "pcs"), "pack");
  assert.equal(
    productDetailLine({ brand: "Allowrie Unsalted", supplierName: "MM", showSupplier: true, packCode: "234468" }),
    "Allowrie Unsalted · MM · #234468",
  );
  assert.equal(productDetailLine({ brand: null, supplierName: "MM", showSupplier: false, packCode: "259043" }), "#259043");
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
