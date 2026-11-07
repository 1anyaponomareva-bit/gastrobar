import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublicOrdersActor, KITCHEN_ORDERS_ACTOR } from "./access";
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
  ALL_SUPPLIER_TAB,
  catalogCategories,
  filterBySupplierTab,
  groupProductsByCategory,
  isMarkedQty,
  isProductMarked,
  ORDER_PDF_TAP_STEPS,
  formatOrderLineBaseHint,
  formatOrderLineQty,
  orderPackCaption,
  orderPackUnit,
  orderPdfWarehouseFields,
  orderPdfWarehouseOf,
  productDetailLine,
  reducePlaceDialog,
  reorderSubset,
  selectedFirst,
  shouldPlaceAfterDialog,
  sortCatalogProducts,
  supplierBadgeCounts,
  supplierPrintPdfInput,
  supplierTabChips,
  type SelectionMap,
} from "./orderList";
import type { OrderProduct, OrderWarehouse } from "./types";

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

test("category chips follow the language switcher: RU/EN English, VN Vietnamese", () => {
  const products = [
    { id: "butter", categoryId: "dairy", categoryName: "Dairy Products & Eggs", categoryNameVn: "Sữa và trứng" },
    { id: "beer", categoryId: "alc", categoryName: "Alcohol", categoryNameVn: "" },
  ];
  assert.deepEqual(
    catalogCategories(products, "ru").map((row) => row.name),
    ["Dairy Products & Eggs", "Alcohol"],
  );
  assert.deepEqual(
    catalogCategories(products, "en").map((row) => row.name),
    ["Dairy Products & Eggs", "Alcohol"],
  );
  assert.deepEqual(
    catalogCategories(products, "vn").map((row) => row.name),
    ["Sữa và trứng", "Alcohol"],
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
  assert.equal(formatOrderLineQty(0, buffalo), "0 box");
  const beer = {
    orderedQty: 15.84,
    packQty: 2,
    packQtyBase: 7.92,
    packLabel: "Pack 24*330 ml",
    unit: "l",
  };
  assert.equal(formatOrderLineQty(15.84, beer, "ordered"), "2 pack");
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
  assert.equal(formatOrderPdfQtyCell(saltOnly!.lines[0]), "3");
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
