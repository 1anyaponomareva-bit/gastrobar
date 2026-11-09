import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublicOrdersActor, KITCHEN_ORDERS_ACTOR } from "./access";
import { needsPlaceActorName, personLabel, resolvePlaceDisplayName } from "./person";
import { decideErpHostGate, productionErpHostEnv, readErpHostGateConfig } from "../erp/hostGate";
import {
  formatOrderPdfPackLabel,
  formatOrderPdfQtyCell,
  getOrderPdfFileName,
  ORDER_PDF_FINAL_HEADING,
  ORDER_PDF_PRE_HEADING,
  ORDER_PDF_PRE_NOTICE,
  ORDER_PDF_PREP_KITCHEN_ADDRESS,
  ORDER_PDF_PREP_KITCHEN_PHONE,
  ORDER_PDF_WAREHOUSE_ADDRESS,
  orderPdfCompanyHeading,
  orderPdfFooterLines,
  orderPdfHeaderMeta,
  orderPdfLineCode,
  orderPdfPreNoticeParagraphs,
  orderPdfRecipientValue,
  orderPdfTitle,
} from "./orderPdfTypes";
import {
  ALL_CATEGORY_TAB,
  ALL_SUPPLIER_TAB,
  catalogCategories,
  catalogCategoryChips,
  filterByCategory,
  filterBySupplierTab,
  groupProductsByCategory,
  isMarkedQty,
  isProductMarked,
  ORDER_PDF_TAP_STEPS,
  formatOrderLineBaseHint,
  formatOrderLineQty,
  isHistoryDoneStatus,
  orderLineBaseUnit,
  orderPackCaption,
  orderPackUnit,
  orderPdfWarehouseFields,
  orderPdfWarehouseOf,
  orderStatusClass,
  productDetailLine,
  receiveFormLines,
  reducePlaceDialog,
  reorderSubset,
  selectedFirst,
  shouldPlaceAfterDialog,
  sortCatalogProducts,
  sortOrdersForHistory,
  supplierBadgeCounts,
  shouldShowOrderZalo,
  supplierPrintPdfInput,
  supplierTabChips,
  supplierZaloHref,
  UNCATEGORIZED_CATEGORY_TAB,
  type SelectionMap,
} from "./orderList";
import { ORDERS_ADMIN_PATH, productEditorReturnHref } from "../erp/menuListQuery";
import { displayRemainingQty, receiveLineUnits } from "./qty";
import type { OrderProduct, OrderWarehouse } from "./types";

test("orders admin and ERP ingredients open the same product card", () => {
  assert.equal(ORDERS_ADMIN_PATH, "/orders/admin");
  assert.equal(productEditorReturnHref("/orders/admin", "/erp/menu/ingredients"), "/orders/admin");
  assert.equal(productEditorReturnHref("/erp/menu/ingredients", "/erp/menu/ingredients"), "/erp/menu/ingredients");
  assert.equal(productEditorReturnHref("https://evil.example/orders/admin", "/erp/menu/ingredients"), "/erp/menu/ingredients");
});

test("catalog list order is A–Z by name and ignores staff_sort", () => {
  const sorted = sortCatalogProducts([
    { id: "b", sort: 0, nameEn: "Beef" },
    { id: "a", sort: 99, nameEn: "Salt" },
    { id: "c", sort: 0, nameEn: "Apple" },
  ]);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["c", "b", "a"],
  );
});

test("catalog names sort Russian and Latin together", () => {
  const sorted = sortCatalogProducts(
    [
      { id: "3", nameEn: "Яблоко" },
      { id: "2", nameEn: "Banana" },
      { id: "1", nameEn: "Авокадо" },
    ],
    "ru",
  );
  assert.deepEqual(
    sorted.map((row) => row.nameEn),
    ["Авокадо", "Яблоко", "Banana"],
  );
});

test("Vietnamese locale sorts by nameVn", () => {
  const sorted = sortCatalogProducts(
    [
      { id: "beef", nameEn: "Beef", nameVn: "Thịt bò" },
      { id: "salt", nameEn: "Salt", nameVn: "Muối" },
      { id: "apple", nameEn: "Apple", nameVn: "Táo" },
    ],
    "vn",
  );
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["salt", "apple", "beef"],
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

test("category chips follow the language switcher: RU/EN English, VN Vietnamese", () => {
  const products = [
    { id: "butter", categoryId: "dairy", categoryName: "Dairy Products & Eggs", categoryNameVn: "Sữa và trứng" },
    { id: "beer", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "" },
  ];
  assert.deepEqual(
    catalogCategories(products, "ru").map((row) => row.name),
    ["Alcohol", "Dairy Products & Eggs"],
  );
  assert.deepEqual(
    catalogCategories(products, "en").map((row) => row.name),
    ["Alcohol", "Dairy Products & Eggs"],
  );
  assert.deepEqual(
    catalogCategories(products, "vn").map((row) => row.name),
    ["Alcohol", "Sữa và trứng"],
  );
});

test("categories A–Z, items A–Z within category, uncategorized last", () => {
  const products = [
    { id: "salt", nameEn: "Salt", nameVn: "Muối", categoryId: null, categoryName: null },
    { id: "cheese", nameEn: "Cheese", nameVn: "Phô mai", categoryId: "dairy", categoryName: "Dairy", categoryNameVn: "Sữa" },
    { id: "beer", nameEn: "Beer", nameVn: "Bia", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "Rượu" },
    { id: "butter", nameEn: "Butter", nameVn: "Bơ", categoryId: "dairy", categoryName: "Dairy", categoryNameVn: "Sữa" },
    { id: "wine", nameEn: "Wine", nameVn: "Rượu vang", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "Rượu" },
    { id: "ghost", nameEn: "Unknown", nameVn: "", categoryId: null, categoryName: null },
  ];
  const categories = catalogCategories(products, "en");
  assert.deepEqual(
    categories.map((row) => row.name),
    ["Alcohol", "Dairy"],
  );
  const groups = groupProductsByCategory(products, categories, { locale: "en", uncategorizedName: "Uncategorized" });
  assert.deepEqual(
    groups.map((group) => [group.id, group.name, group.products.map((row) => row.id)]),
    [
      ["alc", "Alcohol", ["beer", "wine"]],
      ["dairy", "Dairy", ["butter", "cheese"]],
      ["", "Uncategorized", ["salt", "ghost"]],
    ],
  );
});

test("category chips are All, A–Z names, Uncategorized last; filter isolates one category", () => {
  const products = [
    { id: "salt", nameEn: "Salt", nameVn: "Muối", categoryId: null, categoryName: null },
    { id: "cheese", nameEn: "Cheese", nameVn: "Phô mai", categoryId: "dairy", categoryName: "Dairy", categoryNameVn: "Sữa" },
    { id: "beer", nameEn: "Beer", nameVn: "Bia", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "Rượu" },
    { id: "butter", nameEn: "Butter", nameVn: "Bơ", categoryId: "dairy", categoryName: "Dairy", categoryNameVn: "Sữa" },
    { id: "wine", nameEn: "Wine", nameVn: "Rượu vang", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "Rượu" },
    { id: "ghost", nameEn: "Unknown", nameVn: "", categoryId: null, categoryName: null },
  ];
  const chips = catalogCategoryChips(products, "en", { all: "All", uncategorized: "Uncategorized" });
  assert.deepEqual(
    chips.map((row) => [row.id, row.name]),
    [
      [ALL_CATEGORY_TAB, "All"],
      ["alc", "Alcohol"],
      ["dairy", "Dairy"],
      [UNCATEGORIZED_CATEGORY_TAB, "Uncategorized"],
    ],
  );
  assert.deepEqual(
    catalogCategoryChips(products, "vn", { all: "Tất cả", uncategorized: "Không phân loại" }).map((row) => row.name),
    ["Tất cả", "Rượu", "Sữa", "Không phân loại"],
  );
  assert.deepEqual(
    filterByCategory(products, ALL_CATEGORY_TAB).map((row) => row.id),
    ["salt", "cheese", "beer", "butter", "wine", "ghost"],
  );
  assert.deepEqual(
    sortCatalogProducts(filterByCategory(products, "alc"), "en").map((row) => row.id),
    ["beer", "wine"],
  );
  assert.deepEqual(
    sortCatalogProducts(filterByCategory(products, "dairy"), "en").map((row) => row.id),
    ["butter", "cheese"],
  );
  assert.deepEqual(
    sortCatalogProducts(filterByCategory(products, UNCATEGORIZED_CATEGORY_TAB), "en").map((row) => row.id),
    ["salt", "ghost"],
  );
  assert.equal(
    filterByCategory(products, "dairy").some((row) => row.categoryId !== "dairy"),
    false,
  );
});

test("category chips omit Uncategorized when every item has a category", () => {
  const chips = catalogCategoryChips(
    [
      { categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "Rượu" },
      { categoryId: "dairy", categoryName: "Dairy", categoryNameVn: "Sữa" },
    ],
    "en",
    { all: "All", uncategorized: "Uncategorized" },
  );
  assert.deepEqual(
    chips.map((row) => row.id),
    [ALL_CATEGORY_TAB, "alc", "dairy"],
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

test("ordered 2 boxes of 20 kg displays 2 box, not 40 box", () => {
  const buffalo = {
    orderedQty: 40,
    packQty: 2,
    packQtyBase: 20,
    packLabel: "Box 20 kg",
    unit: "Box",
  };
  assert.equal(formatOrderLineQty(40, buffalo, "ordered"), "2 box");
  assert.equal(formatOrderLineBaseHint(buffalo), "= 40 kg");
  assert.equal(formatOrderLineQty(15.5, buffalo), "15.5 kg");
  assert.equal(formatOrderLineQty(0, buffalo), "0 kg");
  assert.equal(formatOrderLineQty(0, buffalo, "base"), "0 kg");
  const beer = {
    orderedQty: 15.84,
    packQty: 2,
    packQtyBase: 7.92,
    packLabel: "Pack 24*330 ml",
    unit: "l",
  };
  assert.equal(formatOrderLineQty(15.84, beer, "ordered"), "2 pack");
  assert.equal(formatOrderLineQty(5.5, beer), "5.5 l");
  const each = {
    orderedQty: 3,
    packQty: 3,
    packQtyBase: 1,
    packLabel: "1 kg",
    unit: "kg",
  };
  assert.equal(formatOrderLineQty(3, each, "ordered"), "3 kg");
  assert.equal(formatOrderLineBaseHint(each), null);
});

test("ordered qty uses stock unit, never pack SKU or the leading number of 1 kg", () => {
  const cucumber = {
    orderedQty: 3,
    packQty: 3,
    packQtyBase: 1,
    packLabel: "1 kg",
    unit: "1",
    baseUnit: "kg",
  };
  assert.equal(formatOrderLineQty(3, cucumber, "ordered"), "3 kg");
  assert.notEqual(formatOrderLineQty(3, cucumber, "ordered"), "3 1");
  assert.notEqual(formatOrderLineQty(3, cucumber, "ordered"), "3 1 kg");
  assert.equal(formatOrderLineQty(0, cucumber, "base"), "0 kg");
  assert.equal(
    formatOrderLineQty(
      displayRemainingQty({ orderedQty: 3, acceptedQty: 0, postedQty: 0, remainingQty: 3 }),
      cucumber,
      "base",
    ),
    "0 kg",
  );
  assert.equal(orderLineBaseUnit(cucumber), "kg");
  assert.deepEqual(receiveLineUnits(orderLineBaseUnit(cucumber)), ["kg"]);
  const printUnit = orderPackUnit({ label: "1 kg", unit: "1" }, "kg");
  assert.equal(printUnit, "kg");
  assert.equal(`${formatOrderPdfQtyCell({ qty: 3, unit: printUnit })} ${printUnit}`, "3 kg");
  assert.equal(orderPackUnit({ label: "1 kg", unit: "1" }, "1"), "kg");
  assert.equal(orderPackCaption({ label: "1 kg", unit: "1", qty_base: 1 }), null);

  const cucumberNoBase = { ...cucumber, baseUnit: undefined };
  assert.equal(formatOrderLineQty(3, cucumberNoBase, "ordered"), "3 kg");
  assert.equal(orderLineBaseUnit(cucumberNoBase), "kg");

  const halfKg = {
    orderedQty: 1,
    packQty: 2,
    packQtyBase: 0.5,
    packLabel: "0.5 kg",
    unit: "0.5",
    baseUnit: "kg",
  };
  assert.match(formatOrderLineQty(1, halfKg, "ordered"), /\bkg\b/);
  assert.doesNotMatch(formatOrderLineQty(1, halfKg, "ordered"), /0\.5$/);
  assert.notEqual(formatOrderLineQty(1, halfKg, "ordered"), "2 0.5");
  assert.equal(formatOrderLineQty(1, halfKg, "base"), "1 kg");

  const grams = {
    orderedQty: 1,
    packQty: 2,
    packQtyBase: 0.5,
    packLabel: "500 g",
    unit: "500",
    baseUnit: "kg",
  };
  assert.match(formatOrderLineQty(1, grams, "ordered"), /\b(kg|g)\b/);
  assert.doesNotMatch(formatOrderLineQty(1, grams, "ordered"), /\b500\b/);
  assert.notEqual(formatOrderLineQty(1, grams, "ordered"), "2 500");
  assert.equal(formatOrderLineQty(1, grams, "base"), "1 kg");

  const pcsSku = {
    orderedQty: 24,
    packQty: 2,
    packQtyBase: 12,
    packLabel: "12 pcs",
    unit: "99",
    baseUnit: "pcs",
  };
  assert.match(formatOrderLineQty(24, pcsSku, "ordered"), /\bpcs\b/);
  assert.doesNotMatch(formatOrderLineQty(24, pcsSku, "ordered"), /\b99\b/);
  assert.notEqual(formatOrderLineQty(24, pcsSku, "ordered"), "2 99");
  assert.equal(formatOrderLineQty(24, pcsSku, "base"), "24 pcs");
  assert.equal(orderPackUnit({ label: "1 kg", unit: "kg" }, "kg"), "kg");
});

test("accepted, posted and remaining show kg/l, not fractional boxes", () => {
  const wings = {
    orderedQty: 20,
    packQty: 1,
    packQtyBase: 20,
    packLabel: "Box 20 kg",
    unit: "Box",
    baseUnit: "kg",
  };
  assert.equal(formatOrderLineQty(15.5, wings, "base"), "15.5 kg");
  assert.equal(formatOrderLineQty(0, wings, "base"), "0 kg");
  assert.notEqual(formatOrderLineQty(15.5, wings, "base"), "0.775 box");
  const oil = {
    orderedQty: 5,
    packQty: 1,
    packQtyBase: 5,
    packLabel: "Can 5 l",
    unit: "Can",
    baseUnit: "l",
  };
  assert.equal(formatOrderLineQty(4.25, oil, "base"), "4.25 l");
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

test("order PDF tap shares before the draft save", () => {
  assert.deepEqual(ORDER_PDF_TAP_STEPS, ["share", "save-draft"]);
  assert.equal(ORDER_PDF_TAP_STEPS[0], "share");
});

test("Zalo href is the stored group link, never a blank or contacts search", () => {
  const group = "https://zalo.me/g/65gr4g33gucqyijbhtgi";
  assert.equal(supplierZaloHref({ zaloUrl: group }), group);
  assert.equal(supplierZaloHref({ zalo_url: "https://zalo.me/0988631507" }), "https://zalo.me/0988631507");
  assert.equal(supplierZaloHref(group), group);
  assert.equal(supplierZaloHref({ zaloUrl: "  https://zalo.me/g/abc  " }), "https://zalo.me/g/abc");
  assert.equal(supplierZaloHref({ zaloUrl: "https://www.zalo.me/g/abc" }), "https://www.zalo.me/g/abc");
  assert.equal(supplierZaloHref({ zaloUrl: "" }), null);
  assert.equal(supplierZaloHref({ zaloUrl: null }), null);
  assert.equal(supplierZaloHref({ zaloUrl: "https://zalo.me/" }), null);
  assert.equal(supplierZaloHref({ zaloUrl: "http://zalo.me/g/abc" }), null);
  assert.equal(supplierZaloHref({ zaloUrl: "javascript:alert(1)" }), null);
  assert.equal(supplierZaloHref({ zaloUrl: "https://example.com/g/abc" }), null);
  assert.equal(supplierZaloHref({ zaloUrl: "zalo://conversation/abc" }), null);
});

test("Zalo button shows only for placed orders that have a group URL", () => {
  const group = "https://zalo.me/g/65gr4g33gucqyijbhtgi";
  assert.equal(shouldShowOrderZalo("ordered", { zaloUrl: group }), true);
  assert.equal(shouldShowOrderZalo("partial", group), true);
  assert.equal(shouldShowOrderZalo("received", { zalo_url: group }), true);
  assert.equal(shouldShowOrderZalo("closed", group), true);
  assert.equal(shouldShowOrderZalo("draft", group), false);
  assert.equal(shouldShowOrderZalo("ordered", { zaloUrl: "" }), false);
  assert.equal(shouldShowOrderZalo("ordered", { zaloUrl: null }), false);
  assert.equal(shouldShowOrderZalo("ordered", "https://example.com"), false);
  assert.equal(shouldShowOrderZalo("", group), false);
  assert.equal(shouldShowOrderZalo(null, group), false);
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

test("print PDF uses pack SKU then product_code, bilingual names, and no revision in the filename", () => {
  const beer: OrderProduct = {
    id: "beer",
    nameEn: "Beer Lager",
    nameVn: "Bia Lager",
    brand: "Saigon",
    categoryId: null,
    categoryName: null,
    unit: "l",
    itemNo: "STAFF-IGNORE",
    productCode: "PROD-FALLBACK",
    supplierId: "mm",
    sort: 0,
    packs: [
      {
        id: "p1",
        pack_id: "p1",
        label: "Pack 24*330 ml",
        unit: "l",
        qty_base: 7.92,
        is_default: true,
        code: "259043",
      },
    ],
  };
  const salt: OrderProduct = {
    ...beer,
    id: "salt",
    nameEn: "Salt",
    nameVn: "Muối",
    brand: null,
    itemNo: "STAFF-SALT",
    productCode: "SALT-1",
    packs: [{ id: "p2", pack_id: "p2", label: "1 kg", unit: "kg", qty_base: 1, is_default: true, code: null }],
  };
  const butter: OrderProduct = {
    ...beer,
    id: "butter",
    nameEn: "Butter",
    nameVn: "Bơ",
    brand: "Allowrie",
    unit: "kg",
    productCode: "BUTTER-1",
    packs: [{ id: "p3", pack_id: "p3", label: "box 5 kg", unit: "kg", qty_base: 5, is_default: true, code: "234468" }],
  };
  const selection: SelectionMap = {
    beer: { packId: "p1", qty: "2" },
    salt: { packId: "p2", qty: "0" },
  };
  assert.equal(orderPdfLineCode("259043", "PROD-FALLBACK"), "259043");
  assert.equal(orderPdfLineCode("", "SALT-1"), "SALT-1");
  assert.equal(orderPdfLineCode(null, null), "");
  const input = supplierPrintPdfInput([beer, salt], selection, {
    orderNo: "ORD-000005",
    supplierName: "MM",
    orderedAt: "2026-11-07",
  });
  assert.ok(input);
  assert.equal(input!.lines.length, 1);
  assert.deepEqual(input!.lines[0], {
    nameEn: "Beer Lager",
    nameVn: "Bia Lager",
    brand: "Saigon",
    packLabel: "Pack 24*330 ml",
    packCode: "259043",
    unit: "pack",
    qty: 2,
  });
  assert.equal(formatOrderPdfQtyCell(input!.lines[0]), "2");
  assert.equal(formatOrderPdfQtyCell({ qty: 2, unit: beer.unit }), "2");
  assert.doesNotMatch(formatOrderPdfQtyCell(input!.lines[0]), /[a-zA-Z]/);
  assert.equal(formatOrderPdfPackLabel(input!.lines[0].packLabel), "Pack / Gói 24*330 ml");
  assert.equal(formatOrderPdfPackLabel("Pack 1 kg"), "Pack / Gói 1 kg");
  assert.equal(formatOrderPdfPackLabel("box 5 kg"), "Box / Thùng 5 kg");
  assert.equal(formatOrderPdfPackLabel("Can 200 g"), "Can / Lon 200 g");
  assert.equal(formatOrderPdfPackLabel("24 pcs"), "24 Pcs / Cái");
  assert.equal(formatOrderPdfPackLabel("Piece 1"), "Piece / Cái 1");
  assert.equal(formatOrderPdfPackLabel("bag 1 kg"), "bag 1 kg");
  assert.equal(formatOrderPdfPackLabel("box 12*1 L"), "Box / Thùng 12*1 L");
  assert.equal(formatOrderPdfPackLabel("Pack / Gói 1 kg"), "Pack / Gói 1 kg");
  assert.doesNotMatch(formatOrderPdfPackLabel("Pack 1 kg"), /\bkg\b.*Gói|\/ kg/i);
  const saltOnly = supplierPrintPdfInput([salt], { salt: { packId: "p2", qty: "3" } }, {
    orderNo: "ORD-1",
    supplierName: "MM",
    orderedAt: "2026-11-07",
  });
  assert.equal(saltOnly!.lines[0].packCode, "SALT-1");
  assert.equal(saltOnly!.lines[0].nameVn, "Muối");
  assert.equal(saltOnly!.lines[0].unit, "kg");
  assert.equal(formatOrderPdfQtyCell(saltOnly!.lines[0]), "3");
  assert.equal(`${formatOrderPdfQtyCell(saltOnly!.lines[0])} ${saltOnly!.lines[0].unit}`, "3 kg");
  const twoBoxes = supplierPrintPdfInput([butter], { butter: { packId: "p3", qty: "2" } }, {
    orderNo: "ORD-2",
    supplierName: "MM",
    orderedAt: "2026-11-07",
  });
  assert.equal(twoBoxes!.lines[0].qty, 2);
  assert.equal(twoBoxes!.lines[0].unit, "box");
  assert.equal(twoBoxes!.lines[0].packLabel, "box 5 kg");
  assert.equal(formatOrderPdfPackLabel(twoBoxes!.lines[0].packLabel), "Box / Thùng 5 kg");
  assert.equal(formatOrderPdfQtyCell(twoBoxes!.lines[0]), "2");
  assert.notEqual(formatOrderPdfQtyCell({ qty: 2 * 5, unit: "kg" }), "2");
  const fileName = getOrderPdfFileName(input!);
  assert.equal(fileName, "Order_MM_2026-11-07.pdf");
  assert.doesNotMatch(fileName, /rev|_r\d/i);
  assert.doesNotMatch(orderPdfTitle({ ...input!, revision: 2 }), /rev|\br\d\b/i);
  assert.equal(supplierPrintPdfInput([beer], { beer: { packId: "p1", qty: "" } }, { orderNo: "x", supplierName: "MM" }), null);
});

test("pre-order PDF omits warehouse/address; final PDF has one labeled warehouse + address", () => {
  const warehouses: OrderWarehouse[] = [
    {
      id: "prep",
      name: "Prep Kitchen / Bếp sơ chế",
      kind: "prep_kitchen",
      address: ORDER_PDF_PREP_KITCHEN_ADDRESS,
      phone: ORDER_PDF_PREP_KITCHEN_PHONE,
    },
    {
      id: "wh",
      name: "Warehouse / Kho",
      kind: "warehouse",
      address: ORDER_PDF_WAREHOUSE_ADDRESS,
      phone: ORDER_PDF_PREP_KITCHEN_PHONE,
    },
  ];
  const beer: OrderProduct = {
    id: "beer",
    nameEn: "Beer Lager",
    nameVn: "Bia Lager",
    brand: "Saigon",
    categoryId: null,
    categoryName: null,
    unit: "l",
    itemNo: null,
    productCode: "PROD-FALLBACK",
    supplierId: "mm",
    sort: 0,
    packs: [
      {
        id: "p1",
        pack_id: "p1",
        label: "Pack 24*330 ml",
        unit: "l",
        qty_base: 7.92,
        is_default: true,
        code: "259043",
      },
    ],
  };
  const selection: SelectionMap = { beer: { packId: "p1", qty: "2" } };
  const pre = supplierPrintPdfInput([beer], selection, {
    orderNo: "ORD-000004",
    supplierName: "MM",
    orderedAt: "2026-11-07",
    ...orderPdfWarehouseFields(orderPdfWarehouseOf(warehouses, null)),
    kind: "pre",
  });
  assert.ok(pre);
  assert.equal(pre!.kind, "pre");
  assert.equal(pre!.warehouseName, undefined);
  assert.equal(pre!.warehouseAddress, undefined);
  assert.equal(pre!.warehousePhone, undefined);
  assert.equal(getOrderPdfFileName(pre!), "Pre_order_MM_2026-11-07.pdf");
  assert.doesNotMatch(getOrderPdfFileName(pre!), /rev|_r\d/i);
  assert.equal(orderPdfCompanyHeading("pre"), ORDER_PDF_PRE_HEADING);
  assert.equal(orderPdfCompanyHeading("pre"), "GASTROFOOD - PRE-ORDER / ĐƠN ĐẶT TRƯỚC");
  assert.doesNotMatch(orderPdfCompanyHeading("pre"), /PREP KITCHEN|ORDER \/ ĐƠN ĐẶT HÀNG/i);
  assert.equal(orderPdfCompanyHeading("final"), ORDER_PDF_FINAL_HEADING);
  assert.equal(orderPdfCompanyHeading("final"), "GASTROFOOD - ORDER / ĐƠN ĐẶT HÀNG");
  assert.doesNotMatch(orderPdfCompanyHeading("final"), /PREP KITCHEN|PRE-ORDER/i);
  const preMeta = orderPdfHeaderMeta(pre!);
  const notice = orderPdfPreNoticeParagraphs();
  assert.equal(preMeta[0], "Order / Số: ORD-000004");
  assert.equal(preMeta[1], "Date / Ngày: 2026-11-07");
  assert.deepEqual(preMeta.slice(2, 2 + notice.length), notice);
  assert.ok(ORDER_PDF_PRE_NOTICE.includes("Kính gửi Quý Nhà cung cấp,"));
  assert.ok(preMeta.some((line) => line.includes("Kính gửi Quý Nhà cung cấp")));
  assert.ok(preMeta.some((line) => line.includes("đơn đặt hàng dự kiến")));
  assert.equal(
    preMeta.some((line) => /Recipient \/|Delivery address \/|Warehouse \/ Kho:|Address \/ Địa chỉ:|Phone \/|Mường Thanh|152 Lk 77/.test(line)),
    false,
  );
  assert.equal(
    preMeta.some((line) => /ORDER \/ ĐƠN ĐẶT HÀNG/.test(line)),
    false,
  );
  assert.deepEqual(orderPdfFooterLines(), []);
  assert.equal(
    orderPdfFooterLines().some((line) => /GASTROFOOD|Mường Thanh|152 Lk 77/.test(line)),
    false,
  );
  assert.equal(formatOrderPdfQtyCell(pre!.lines[0]), "2");
  assert.doesNotMatch(formatOrderPdfQtyCell(pre!.lines[0]), /[a-zA-Z]/);
  assert.equal(shouldPlaceAfterDialog(reducePlaceDialog("closed", "open")), false);
  assert.equal(shouldPlaceAfterDialog(reducePlaceDialog("open", "submit")), true);

  const finalPdf = supplierPrintPdfInput([beer], selection, {
    orderNo: "ORD-000004",
    supplierName: "MM",
    orderedAt: "2026-11-07",
    ...orderPdfWarehouseFields(orderPdfWarehouseOf(warehouses, "wh")),
    kind: "final",
  });
  assert.ok(finalPdf);
  assert.equal(finalPdf!.kind, "final");
  assert.equal(finalPdf!.warehouseName, "Warehouse / Kho");
  assert.equal(finalPdf!.warehouseAddress, ORDER_PDF_WAREHOUSE_ADDRESS);
  assert.ok(finalPdf!.warehouseAddress?.includes("152 Lk 77 Đường số 51"));
  assert.ok(finalPdf!.warehouseAddress?.includes("Phường Nam Nha Trang, Tỉnh Khánh Hòa"));
  assert.equal(getOrderPdfFileName(finalPdf!), "Order_MM_2026-11-07.pdf");
  const finalMeta = orderPdfHeaderMeta(finalPdf!);
  assert.equal(finalMeta[0].startsWith("Order / Số:"), true);
  assert.equal(finalMeta[1].startsWith("Date / Ngày:"), true);
  assert.equal(
    finalMeta.some((line) => /Kính gửi|đơn đặt hàng dự kiến|chưa phải đơn hàng chính thức/.test(line)),
    false,
  );
  assert.equal(orderPdfRecipientValue("Warehouse / Kho"), "GASTROFOOD Warehouse / Kho");
  assert.equal(orderPdfRecipientValue("Gastrofood"), "GASTROFOOD");
  assert.equal(orderPdfRecipientValue("GASTROFOOD"), "GASTROFOOD");
  assert.equal(orderPdfRecipientValue("GASTROFOOD Warehouse / Kho"), "GASTROFOOD Warehouse / Kho");
  assert.equal(orderPdfRecipientValue("gastrofood Prep Kitchen / Bếp sơ chế"), "GASTROFOOD Prep Kitchen / Bếp sơ chế");
  assert.equal(finalMeta.filter((line) => line.startsWith("Recipient / Người nhận:")).length, 1);
  assert.equal(finalMeta.filter((line) => line.startsWith("Warehouse / Kho:")).length, 0);
  assert.equal(finalMeta.filter((line) => line.startsWith("Delivery address / Địa chỉ giao hàng:")).length, 1);
  assert.equal(finalMeta.filter((line) => line.startsWith("Address / Địa chỉ:")).length, 0);
  assert.ok(finalMeta.some((line) => line === "Recipient / Người nhận: GASTROFOOD Warehouse / Kho"));
  assert.ok(
    finalMeta.some(
      (line) =>
        line.startsWith("Delivery address / Địa chỉ giao hàng:") &&
        line.includes("152 Lk 77 Đường số 51") &&
        line.includes("Phường Nam Nha Trang, Tỉnh Khánh Hòa"),
    ),
  );
  assert.ok(finalMeta.some((line) => line.startsWith("Phone / Điện thoại:") && line.includes(ORDER_PDF_PREP_KITCHEN_PHONE)));
  assert.equal(
    finalMeta.some((line) => /Mường Thanh Viễn Triều|Prep Kitchen/.test(line)),
    false,
  );

  const prepFinal = supplierPrintPdfInput([beer], selection, {
    orderNo: "ORD-000004",
    supplierName: "MM",
    orderedAt: "2026-11-07",
    ...orderPdfWarehouseFields(orderPdfWarehouseOf(warehouses, "prep")),
    kind: "final",
  });
  const prepMeta = orderPdfHeaderMeta(prepFinal!);
  assert.equal(orderPdfRecipientValue("Prep Kitchen / Bếp sơ chế"), "GASTROFOOD Prep Kitchen / Bếp sơ chế");
  assert.equal(prepMeta.filter((line) => line.startsWith("Recipient / Người nhận:")).length, 1);
  assert.equal(prepMeta.filter((line) => line.startsWith("Warehouse / Kho:")).length, 0);
  assert.ok(prepMeta.some((line) => line === "Recipient / Người nhận: GASTROFOOD Prep Kitchen / Bếp sơ chế"));
  assert.ok(prepMeta.some((line) => line.startsWith("Delivery address / Địa chỉ giao hàng:") && line.includes("Mường Thanh Viễn Triều")));
  assert.equal(
    prepMeta.some((line) => /152 Lk 77/.test(line)),
    false,
  );
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

test("public place-order without a name is blocked; named users keep their name", () => {
  assert.equal(needsPlaceActorName({ public: true, email: KITCHEN_ORDERS_ACTOR, name: null }), true);
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "" }), null);
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "kitchen" }), null);
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "Анна" }), "Анна");
  assert.equal(needsPlaceActorName({ public: false, email: "anna@gastrofood", name: "Анна" }), false);
  assert.equal(personLabel("Анна", KITCHEN_ORDERS_ACTOR), "Анна");
  assert.equal(personLabel(null, KITCHEN_ORDERS_ACTOR), "—");
});

test("collapsed history card shows placer name, not kitchen local-part", () => {
  const order = {
    placedByName: "Анна",
    placedBy: KITCHEN_ORDERS_ACTOR,
    createdByName: null,
    createdBy: KITCHEN_ORDERS_ACTOR,
  };
  assert.equal(personLabel(order.placedByName, order.placedBy, order.createdByName, order.createdBy), "Анна");
  assert.equal(personLabel(null, KITCHEN_ORDERS_ACTOR, null, KITCHEN_ORDERS_ACTOR), "—");
});

test("draft save is allowed without gf_orders cookie as the kitchen actor", () => {
  const actor = resolvePublicOrdersActor(null, null);
  assert.equal(actor.email, KITCHEN_ORDERS_ACTOR);
  assert.equal(actor.public, true);
  assert.equal(actor.erpAdmin, false);
  const cfg = readErpHostGateConfig(productionErpHostEnv({}));
  for (const method of ["GET", "PUT", "POST"]) {
    const result = decideErpHostGate(
      {
        hostHeader: "www.gastrofood.vn",
        pathname: "/api/orders/drafts/729e2699-1db3-492b-8a14-e98286c38781",
        search: "",
        method,
      },
      cfg,
    );
    assert.equal(result.action, "allow", `${method} drafts must pass the gastrofood host gate`);
  }
});

test("history list puts received/closed after ordered, newest first in each group", () => {
  const sorted = sortOrdersForHistory([
    { id: "old-received", status: "received", receivedAt: "2026-11-01T10:00:00Z", placedAt: "2026-11-01T09:00:00Z" },
    { id: "new-ordered", status: "ordered", placedAt: "2026-11-09T15:00:00Z" },
    { id: "old-ordered", status: "ordered", placedAt: "2026-11-08T10:00:00Z" },
    { id: "new-received", status: "received", receivedAt: "2026-11-09T12:00:00Z", placedAt: "2026-11-07T10:00:00Z" },
    { id: "closed", status: "closed", receivedAt: "2026-11-08T18:00:00Z", placedAt: "2026-11-08T11:00:00Z" },
    { id: "draft", status: "draft", createdAt: "2026-11-09T16:00:00Z" },
    { id: "partial", status: "partial", placedAt: "2026-11-09T08:00:00Z" },
  ]);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["draft", "new-ordered", "partial", "old-ordered", "new-received", "closed", "old-received"],
  );
  assert.equal(isHistoryDoneStatus("received"), true);
  assert.equal(isHistoryDoneStatus("closed"), true);
  assert.equal(isHistoryDoneStatus("ordered"), false);
  assert.equal(isHistoryDoneStatus("draft"), false);
});

test("ordered status pill is green; received/closed are gray", () => {
  assert.equal(orderStatusClass("ordered"), "orders-status ordered");
  assert.equal(orderStatusClass("received"), "orders-status received");
  assert.equal(orderStatusClass("closed"), "orders-status closed");
  assert.equal(orderStatusClass("draft"), "orders-status draft");
  assert.equal(orderStatusClass("partial"), "orders-status partial");
});

test("receive form lines survive unit 1, missing qty, and as_ordered leftover", () => {
  const waterId = "11111111-1111-4111-8111-111111111111";
  const lineId = "22222222-2222-4222-8222-222222222222";
  const rows = receiveFormLines({
    lines: [
      {
        id: lineId,
        product_id: waterId,
        pack_id: null,
        nameEn: "Water",
        nameVn: "",
        brand: null,
        packLabel: "1",
        unit: "1",
        qty: 1,
        orderedQty: 1,
        acceptedQty: 0,
        postedQty: 0,
        remainingQty: 1,
        packQty: 1,
        packQtyBase: 1,
        baseUnit: "l",
      },
      {
        product_id: waterId,
        pack_id: null,
        nameEn: "Broken",
        nameVn: "",
        brand: null,
        packLabel: "",
        unit: "1",
        qty: 0,
        orderedQty: undefined as unknown as number,
        acceptedQty: 0,
        postedQty: 0,
        remainingQty: undefined as unknown as number,
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orderLineId, lineId);
  assert.equal(rows[0].mode, "as_ordered");
  assert.equal(rows[0].remainingQty, 1);
  assert.notEqual(rows[0].baseUnit, "1");
  assert.doesNotThrow(() => receiveFormLines({ lines: null }));
  assert.deepEqual(receiveFormLines({}), []);
});
