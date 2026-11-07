/**
 * Supplier-order API checks on in-memory Postgres (PGlite). Never touches production.
 * Run from the orders-api worktree: npx tsx scripts/erp/test-orders.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import {
  formatOrderPdfPackLabel,
  formatOrderPdfQtyCell,
  getOrderPdfFileName,
  makeOrderPdfBlob,
  orderPdfCompanyHeading,
  orderPdfHeaderMeta,
  orderPdfTitle,
  setOrderPdfFonts,
  type OrderPdfInput,
} from "../../src/lib/orders/orderPdf";
import { formatOrderLineQty } from "../../src/lib/orders/orderList";
import { displayRemainingQty } from "../../src/lib/orders/qty";
import { createTestDb } from "./testDb";

const ACTOR = "cook@gastrofood";
const OTHER = "other@gastrofood";
const GRANTEE = "shift@gastrofood";
const ADMIN = "admin@gastrofood";

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
const asJson = (v: unknown): Record<string, unknown> => {
  if (typeof v === "string") return JSON.parse(v) as Record<string, unknown>;
  if (v && typeof v === "object") return v as Record<string, unknown>;
  throw new Error("expected json");
};
const asArr = (v: unknown): unknown[] => {
  if (typeof v === "string") return JSON.parse(v) as unknown[];
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  throw new Error("expected json array");
};

async function j(sql: string, params: unknown[] = []) {
  return asJson(await value(sql, params));
}

async function saveProduct(p: Record<string, unknown>) {
  return value<string>("select public.erp_save_product($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);
}
async function saveDoc(p: Record<string, unknown>) {
  return value<string>("select public.erp_save_document($1::jsonb, $2)", [JSON.stringify(p), ACTOR]);
}
async function stock(product: string, warehouse: string) {
  return n(
    await value("select coalesce(sum(qty_left), 0) from public.erp_lots where product_id = $1 and warehouse_id = $2", [
      product,
      warehouse,
    ]),
  );
}

function injectPdfFonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const toAb = (bytes: Buffer): ArrayBuffer => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  };
  setOrderPdfFonts({
    regular: toAb(readFileSync(path.join(dir, "NotoSans-Regular.ttf"))),
    bold: toAb(readFileSync(path.join(dir, "NotoSans-Bold.ttf"))),
  });
}

async function main() {
  db = await createTestDb();
  injectPdfFonts();

  const prep = await value<string>("select id from public.erp_warehouses where code = 'prep-kitchen'");
  const mainWh = await value<string>("select id from public.erp_warehouses where code = 'warehouse'");
  const supplier = await value<string>(
    "insert into public.erp_suppliers (code, name) values ('test-mm-orders', 'Test MM') returning id",
  );
  const ghost = await value<string>(
    "insert into public.erp_suppliers (code, name) values ('test-no-goods', 'Empty Vendor') returning id",
  );
  const beef = await saveProduct({
    type: "ingredient",
    name_en: "Order beef",
    name_vn: "Thịt bò đơn",
    brand: "TestBrand",
    base_unit: "kg",
  });
  const salt = await saveProduct({
    type: "ingredient",
    name_en: "Order salt",
    name_vn: "Muối đơn",
    base_unit: "kg",
  });
  await q(
    "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default, code) values ($1, $2, 'bag 1 kg', 1, true, 'BEEF-PACK')",
    [beef, supplier],
  );
  await q("update public.erp_products set product_code = 'SALT-FALLBACK' where id = $1", [salt]);
  const heavyPack = await value<string>(
    "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default) values ($1, $2, 'bag 2.5 kg', 2.5, true) returning id",
    [salt, supplier],
  );

  await test("order list catalog is one vertical list ordered by staff_sort", async () => {
    await q("update public.erp_products set staff_sort = 20 where id = $1", [beef]);
    await q("update public.erp_products set staff_sort = 10 where id = $1", [salt]);
    const catalog = asArr(await value("select public.erp_order_catalog_products(false)"));
    const ids = catalog.map((row) => asJson(row).id);
    assert.ok(ids.includes(salt) && ids.includes(beef));
    assert.ok(ids.indexOf(salt) < ids.indexOf(beef), "lower staff_sort comes first");
    const saltRow = catalog.map(asJson).find((row) => row.id === salt);
    assert.equal(saltRow?.supplierId, supplier);
    assert.equal(saltRow?.nameVn, "Muối đơn");
    assert.equal(saltRow?.productCode, "SALT-FALLBACK");
    const beefRow = catalog.map(asJson).find((row) => row.id === beef);
    assert.equal(beefRow?.nameVn, "Thịt bò đơn");
    assert.equal(asJson(asArr(beefRow?.packs)[0]).code, "BEEF-PACK");
    const cat = await value<string>("select public.erp_save_ref('category', $1::jsonb, $2)", [
      JSON.stringify({ name_en: "MEAT & POULTRY", name_vn: "Thịt & gia cầm" }),
      ACTOR,
    ]);
    await q("update public.erp_products set category_id = $1 where id = $2", [cat, beef]);
    const withCat = asArr(await value("select public.erp_order_catalog_products(false)"));
    const beefCat = withCat.map(asJson).find((row) => row.id === beef);
    assert.equal(beefCat?.categoryName, "MEAT & POULTRY");
    assert.equal(beefCat?.categoryNameVn, "Thịt & gia cầm");
    assert.ok(!String(beefCat?.categoryName ?? "").includes("/"));
    await q("select public.erp_order_reorder_products(array[$1::uuid, $2::uuid])", [beef, salt]);
    const reordered = asArr(await value("select public.erp_order_catalog_products(false)"));
    const next = reordered.map((row) => asJson(row).id);
    assert.ok(next.indexOf(beef) < next.indexOf(salt), "admin drag persists staff_sort");
  });

  await test("catalog lists ERP supplier products without Staff JSON import", async () => {
    const suppliers = asArr(await value("select public.erp_order_list_suppliers()"));
    const mm = suppliers.find((row) => asJson(row).id === supplier);
    assert.ok(mm, "supplier with packs appears");
    assert.equal(
      suppliers.some((row) => asJson(row).id === ghost),
      false,
      "supplier with no products is hidden",
    );
    const products = asArr(await value("select public.erp_order_supplier_products($1)", [supplier]));
    assert.equal(products.length, 2);
    const names = products.map((row) => asJson(row).nameEn);
    assert.ok(names.includes("Order beef"));
    assert.ok(names.includes("Order salt"));
  });

  await test("new pack on the supplier appears without a catalog import", async () => {
    const extra = await saveProduct({ type: "packaging", name_en: "Order bags", name_vn: "Túi", base_unit: "pcs" });
    await q(
      "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default) values ($1, $2, 'pcs 1 pcs', 1, true)",
      [extra, supplier],
    );
    const products = asArr(await value("select public.erp_order_supplier_products($1)", [supplier]));
    assert.ok(products.some((row) => asJson(row).id === extra));
  });

  await test("default warehouse is active Prep Kitchen; saved warehouse wins; location is rejected", async () => {
    const empty = await j("select public.erp_order_get_draft($1, $2)", [supplier, ACTOR]);
    assert.equal(empty.warehouseId, prep);
    const saved = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({
        warehouseId: mainWh,
        lines: [{ product_id: beef, qty: 1 }],
      }),
      ACTOR,
    ]);
    assert.equal(saved.warehouseId, mainWh);
    const location = await value<string>(
      "insert into public.erp_locations (code, name) values ('test-sales-point', 'Sales Point') returning id",
    );
    await expectError(
      q("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
        supplier,
        JSON.stringify({ warehouseId: location, lines: [{ product_id: beef, qty: 1 }] }),
        ACTOR,
      ]),
      "ERP_WAREHOUSE_NOT_FOUND",
    );
  });

  const draft = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
    supplier,
    JSON.stringify({
      warehouseId: prep,
      comment: "Morning order",
      lines: [{ product_id: beef, qty: 10, unitPrice: null }],
    }),
    ACTOR,
  ]);

  await test("unknown price is stored as null, not 0, and does not block place", async () => {
    const lines = asArr(draft.lines);
    assert.equal(asJson(lines[0]).unitPrice, null);
    assert.equal(n(asJson(lines[0]).qty), 10);
    assert.match(String(draft.orderNo), /^ORD-/);
    assert.equal(draft.status, "draft");
  });

  await test("draft survives re-login as the same actor", async () => {
    const again = await j("select public.erp_order_get_draft($1, $2)", [supplier, ACTOR]);
    assert.equal(again.id, draft.id);
    assert.equal(asArr(again.lines).length, 1);
    assert.equal(n(asJson(asArr(again.lines)[0]).qty), 10);
  });

  await test("public kitchen actor can save a draft without a login cookie", async () => {
    const kitchen = "kitchen@gastrofood";
    const saved = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: prep, lines: [{ product_id: beef, qty: 1 }] }),
      kitchen,
    ]);
    assert.ok(saved.id);
    assert.equal(saved.status, "draft");
    assert.equal(saved.author, kitchen);
    assert.notEqual(saved.id, draft.id);
    const again = await j("select public.erp_order_get_draft($1, $2)", [supplier, kitchen]);
    assert.equal(again.id, saved.id);
    assert.equal(asArr(again.lines).length, 1);
  });

  await test("PDF download bumps revision, freezes OrderPdfInput, does not place", async () => {
    const first = await j("select public.erp_order_pdf_revision($1, $2)", [draft.id, ACTOR]);
    assert.equal(first.status, "draft");
    assert.equal(n(first.revision), 1);
    assert.equal(first.placed, false);
    const snap = asJson(first.snapshot) as unknown as OrderPdfInput;
    assert.equal(snap.orderNo, draft.orderNo);
    assert.equal(snap.revision, 1);
    assert.equal(snap.supplierName, "Test MM");
    assert.equal(snap.comment, "Morning order");
    assert.equal(snap.lines.length, 1);
    assert.deepEqual(
      {
        nameEn: snap.lines[0].nameEn,
        nameVn: snap.lines[0].nameVn,
        brand: snap.lines[0].brand,
        packLabel: snap.lines[0].packLabel,
        packCode: snap.lines[0].packCode,
        unit: snap.lines[0].unit,
        qty: snap.lines[0].qty,
      },
      {
        nameEn: "Order beef",
        nameVn: "Thịt bò đơn",
        brand: "TestBrand",
        packLabel: "bag 1 kg",
        packCode: "BEEF-PACK",
        unit: "bag",
        qty: 10,
      },
    );
    assert.equal(snap.kind, "pre");
    assert.equal(orderPdfCompanyHeading(snap.kind), "GASTROFOOD - PRE-ORDER / ĐƠN ĐẶT TRƯỚC");
    const preMeta = orderPdfHeaderMeta(snap);
    assert.equal(preMeta[0].startsWith("Order / Số:"), true);
    assert.equal(preMeta[1].startsWith("Date / Ngày:"), true);
    assert.equal(
      preMeta.some((line) => /Recipient \/|Delivery address \/|Warehouse \/ Kho:|Address \/ Địa chỉ:|Phone \/|Mường Thanh|152 Lk 77/.test(line)),
      false,
    );
    const file1 = getOrderPdfFileName(snap);
    assert.match(file1, /^Pre_order_Test-MM_\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.doesNotMatch(file1, /_r\d/);
    assert.doesNotMatch(orderPdfTitle(snap), /\br\d\b|rev /i);
    assert.equal(formatOrderPdfQtyCell(snap.lines[0]), "10");
    assert.doesNotMatch(formatOrderPdfQtyCell(snap.lines[0]), /[a-zA-Z]/);
    const blob = await makeOrderPdfBlob(snap);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    assert.equal(pdf.getSubject(), "revision=1");
    assert.doesNotMatch(pdf.getTitle() ?? "", /\br\d\b/);
    assert.ok(pdf.getPageCount() >= 1);

    const second = await j("select public.erp_order_pdf_revision($1, $2)", [draft.id, ACTOR]);
    assert.equal(second.status, "draft", "PDF does not place");
    assert.equal(n(second.revision), 2);
    const snap2 = asJson(second.snapshot) as unknown as OrderPdfInput;
    assert.equal(getOrderPdfFileName(snap2), file1, "cook-facing filename ignores revision");
  });

  const placed = await j("select public.erp_order_place($1, $2)", [draft.id, ACTOR]);

  await test("place freezes the current revision and still does not move stock", async () => {
    assert.equal(placed.status, "ordered");
    assert.equal(n(placed.revision), 2);
    assert.equal(n(placed.placedRevision), 2);
    assert.equal(await stock(beef, prep), 0);
    const placedLine = asJson(asArr(placed.lines)[0]);
    assert.equal(n(placedLine.orderedQty), 10);
    assert.equal(n(placedLine.acceptedQty), 0);
    assert.equal(n(placedLine.postedQty), 0);
    assert.equal(n(placedLine.remainingQty), 10, "receive still sees the open ordered qty");
    assert.equal(
      displayRemainingQty({
        orderedQty: Number(placedLine.orderedQty),
        acceptedQty: Number(placedLine.acceptedQty),
        postedQty: Number(placedLine.postedQty),
        remainingQty: Number(placedLine.remainingQty),
      }),
      0,
      "table Осталось does not copy ordered qty before receive/post",
    );
    const again = await j("select public.erp_order_place($1, $2)", [draft.id, ACTOR]);
    assert.equal(n(again.revision), 2, "double place does not bump revision");
    const placedSnap = asJson(await value("select public.erp_order_build_pdf_input($1)", [draft.id])) as unknown as OrderPdfInput;
    assert.equal(placedSnap.kind, "final");
    assert.equal(orderPdfCompanyHeading(placedSnap.kind), "GASTROFOOD - ORDER / ĐƠN ĐẶT HÀNG");
    const placedMeta = orderPdfHeaderMeta(placedSnap);
    assert.equal(placedMeta.filter((line) => line.startsWith("Recipient / Người nhận:")).length, 1);
    assert.equal(placedMeta.filter((line) => line.startsWith("Warehouse / Kho:")).length, 0);
    assert.equal(placedMeta.filter((line) => line.startsWith("Delivery address / Địa chỉ giao hàng:")).length, 1);
    assert.ok(placedMeta.some((line) => line.startsWith("Recipient / Người nhận:") && line.includes("GASTROFOOD")));
    assert.match(getOrderPdfFileName(placedSnap), /^Order_Test-MM_\d{4}-\d{2}-\d{2}\.pdf$/);
    await makeOrderPdfBlob(placedSnap);
  });

  const lineId = asJson(asArr(placed.lines)[0]).id as string;

  await test("receive flags the order and does not create a receipt or stock", async () => {
    const rec1 = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placed.id,
      JSON.stringify({
        idempotencyKey: "recv-6",
        comment: "first drop",
        photos: ["https://example.test/photo-6.jpg"],
        lines: [{ orderLineId: lineId, qty: 6 }],
      }),
      ACTOR,
    ]);
    assert.equal(rec1.status, "received");
    assert.ok(rec1.receivedAt);
    const qty1 = asJson(asArr(rec1.lines)[0]);
    assert.equal(n(qty1.orderedQty), 10);
    assert.equal(n(qty1.acceptedQty), 6);
    assert.equal(n(qty1.postedQty), 0);
    assert.equal(n(qty1.remainingQty), 0, "one receive closes leftover so the cook is not asked again");
    assert.equal(
      displayRemainingQty({
        orderedQty: Number(qty1.orderedQty),
        acceptedQty: Number(qty1.acceptedQty),
        postedQty: Number(qty1.postedQty),
        remainingQty: Number(qty1.remainingQty),
      }),
      0,
      "Осталось stays 0 without posts",
    );
    assert.equal(asArr(rec1.receipts).length, 0);
    assert.equal(n(await value("select count(*) from public.erp_order_receipts where order_id = $1", [placed.id])), 0);
    assert.equal(n(await value("select count(*) from public.erp_documents where source_order_id = $1", [placed.id])), 0);
    assert.equal(await stock(beef, prep), 0, "receive does not move stock");
    assert.equal(n(await value("select count(*) from public.erp_lots where product_id = $1", [beef])), 0);

    const dup = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placed.id,
      JSON.stringify({
        idempotencyKey: "recv-6",
        lines: [{ orderLineId: lineId, qty: 6 }],
      }),
      ACTOR,
    ]);
    assert.equal(asArr(dup.receipts).length, 0, "retry does not create a receipt");
    assert.equal(n(asJson(asArr(dup.lines)[0]).acceptedQty), 6);

    const rec2 = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placed.id,
      JSON.stringify({
        idempotencyKey: "recv-4",
        lines: [{ orderLineId: lineId, qty: 4 }],
      }),
      ACTOR,
    ]);
    assert.equal(rec2.status, "received");
    const qty2 = asJson(asArr(rec2.lines)[0]);
    assert.equal(n(qty2.acceptedQty), 6, "second receive is ignored after the first");
    assert.equal(n(qty2.postedQty), 0);
    assert.equal(n(qty2.remainingQty), 0);
    assert.equal(
      displayRemainingQty({
        orderedQty: Number(qty2.orderedQty),
        acceptedQty: Number(qty2.acceptedQty),
        postedQty: Number(qty2.postedQty),
        remainingQty: Number(qty2.remainingQty),
      }),
      0,
    );
    assert.equal(asArr(rec2.receipts).length, 0);
    assert.equal(await stock(beef, prep), 0);
  });

  await test("employee cannot post; /orders access is not ERP admin", async () => {
    const doc = await saveDoc({
      doc_type: "receipt",
      warehouse_id: prep,
      lines: [{ product_id: salt, qty: 1, unit_price: 1000 }],
    });
    await expectError(
      q("select public.erp_order_admin_post($1, $2, $3)", [doc, ACTOR, false]),
      "ERP_FORBIDDEN",
    );
    assert.equal(await stock(salt, prep), 0);
  });

  const fracDraft = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
    supplier,
    JSON.stringify({
      warehouseId: prep,
      lines: [{ product_id: salt, pack_id: heavyPack, packQty: 0.5 }],
    }),
    ACTOR,
  ]);

  await test("fractional packs snapshot typed qty and convert to base", async () => {
    const line = asJson(asArr(fracDraft.lines)[0]);
    assert.equal(n(line.qty), 1.25);
    assert.equal(n(line.packQty), 0.5);
    const pdf = await j("select public.erp_order_pdf_revision($1, $2)", [fracDraft.id, ACTOR]);
    const snap = asJson(pdf.snapshot);
    assert.equal(n(asJson(asArr(snap.lines)[0]).qty), 0.5);
    assert.equal(pdf.status, "draft");
    const placedFrac = await j("select public.erp_order_place($1, $2)", [fracDraft.id, ACTOR]);
    assert.equal(placedFrac.status, "ordered");
    assert.equal(n(pdf.revision), n(placedFrac.revision), "place does not bump PDF revision");
    await j("select public.erp_order_close_remainder($1, $2, $3, $4::jsonb)", [
      fracDraft.id,
      "fractional fixture",
      ACTOR,
      null,
    ]);
  });

  const clarifyOrder = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
    supplier,
    JSON.stringify({ warehouseId: prep, lines: [{ product_id: beef, qty: 8 }] }),
    OTHER,
  ]);
  await j("select public.erp_order_place($1, $2)", [clarifyOrder.id, OTHER]);
  const otherPlaced = await j("select public.erp_order_get($1, $2, false)", [clarifyOrder.id, OTHER]);
  const otherLineId = asJson(asArr(otherPlaced.lines)[0]).id as string;

  await test("receive does not create a receipt; permissions hide foreign orders", async () => {
    await expectError(q("select public.erp_order_get($1, $2, false)", [clarifyOrder.id, ACTOR]), "ERP_FORBIDDEN");
    const rec = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      clarifyOrder.id,
      JSON.stringify({
        idempotencyKey: "clarify-1",
        lines: [{ orderLineId: otherLineId, qty: 5 }],
      }),
      OTHER,
    ]);
    assert.equal(rec.status, "received");
    assert.equal(asArr(rec.receipts).length, 0);
    assert.equal(n(asJson(asArr(rec.lines)[0]).acceptedQty), 5);
    assert.equal(await stock(beef, prep), 0, "receive does not post stock");
  });

  await test("grant lets a colleague see the order; leftover close does not create stock", async () => {
    await q("select public.erp_order_grant($1, $2)", [OTHER, GRANTEE]);
    const seen = await j("select public.erp_order_get($1, $2, false)", [clarifyOrder.id, GRANTEE]);
    assert.equal(seen.id, clarifyOrder.id);
    const closed = await j("select public.erp_order_close_remainder($1, $2, $3, $4::jsonb)", [
      clarifyOrder.id,
      "supplier shorted us",
      OTHER,
      null,
    ]);
    assert.equal(closed.status, "closed");
    assert.equal(n(asJson(asArr(closed.lines)[0]).remainingQty), 0);
    assert.equal(asArr(closed.receipts).length, 0);
    assert.equal(await stock(beef, prep), 0, "leftover close does not create stock");
  });

  await test("over-qty marks received qty and does not swap the order product", async () => {
    const order = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: prep, lines: [{ product_id: beef, qty: 2 }] }),
      ACTOR,
    ]);
    await j("select public.erp_order_place($1, $2)", [order.id, ACTOR]);
    const live = await j("select public.erp_order_get($1, $2, false)", [order.id, ACTOR]);
    const id = asJson(asArr(live.lines)[0]).id as string;
    const rec = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      order.id,
      JSON.stringify({
        idempotencyKey: "over-sub",
        lines: [{ orderLineId: id, qty: 3, product_id: salt }],
      }),
      ACTOR,
    ]);
    assert.equal(asArr(rec.receipts).length, 0);
    assert.equal(asJson(asArr(rec.lines)[0]).product_id, beef, "order line product is not swapped");
    assert.equal(n(asJson(asArr(rec.lines)[0]).acceptedQty), 3);
    assert.equal(n(asJson(asArr(rec.lines)[0]).remainingQty), 0);
    assert.equal(rec.status, "received");
  });

  await test("product archived after order can still be marked received without stock", async () => {
    const lime = await saveProduct({
      type: "ingredient",
      name_en: "Order lime",
      name_vn: "Chanh đơn",
      base_unit: "kg",
    });
    await q(
      "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default) values ($1, $2, 'kg 1 kg', 1, true)",
      [lime, supplier],
    );
    const order = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: prep, lines: [{ product_id: lime, qty: 1 }] }),
      GRANTEE,
    ]);
    await j("select public.erp_order_place($1, $2)", [order.id, GRANTEE]);
    await q("select public.erp_set_archived('product', $1, true, $2)", [lime, ADMIN]);
    const catalog = asArr(await value("select public.erp_order_supplier_products($1)", [supplier]));
    assert.equal(
      catalog.some((row) => asJson(row).id === lime),
      false,
      "archived product leaves the live catalog",
    );
    const live = await j("select public.erp_order_get($1, $2, false)", [order.id, GRANTEE]);
    assert.equal(asJson(asArr(live.lines)[0]).nameEn, "Order lime");
    const line = asJson(asArr(live.lines)[0]).id as string;
    const rec = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      order.id,
      JSON.stringify({ idempotencyKey: "arch-1", lines: [{ orderLineId: line, qty: 1 }] }),
      GRANTEE,
    ]);
    assert.equal(rec.status, "received");
    assert.equal(asArr(rec.receipts).length, 0);
    assert.equal(await stock(lime, prep), 0, "temp receive does not land stock");
  });

  await test("a second order to the same supplier is a new draft, not a rewrite of the placed one", async () => {
    const first = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: prep, lines: [{ product_id: beef, qty: 1 }] }),
      ACTOR,
    ]);
    await j("select public.erp_order_place($1, $2)", [first.id, ACTOR]);
    const second = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: prep, lines: [{ product_id: salt, qty: 2 }] }),
      ACTOR,
    ]);
    assert.notEqual(second.id, first.id);
    assert.equal(second.status, "draft");
    const firstLive = await j("select public.erp_order_get($1, $2, false)", [first.id, ACTOR]);
    assert.equal(asJson(asArr(firstLive.lines)[0]).product_id, beef);
    assert.equal(n(asJson(asArr(firstLive.lines)[0]).qty), 1);
    await j("select public.erp_order_close_remainder($1, $2, $3, $4::jsonb, true)", [first.id, "admin leftover", ADMIN, null]);
    const closed = await j("select public.erp_order_get($1, $2, true)", [first.id, ADMIN]);
    assert.equal(closed.status, "closed");
  });

  await test("ERP warehouse address/phone seed and save; Warehouse PDF differs from Prep Kitchen", async () => {
    const prepRow = await one<{ address: string; phone: string }>(
      "select address, phone from public.erp_warehouses where code = 'prep-kitchen'",
    );
    const whRow = await one<{ address: string; phone: string }>(
      "select address, phone from public.erp_warehouses where code = 'warehouse'",
    );
    assert.match(prepRow.address, /Mường Thanh Viễn Triều/);
    assert.equal(prepRow.phone, "+84 98 863 15 07");
    assert.match(whRow.address, /152 Lk 77 Đường số 51/);
    assert.match(whRow.address, /Phường Nam Nha Trang, Tỉnh Khánh Hòa/);
    assert.equal(whRow.phone, "+84 98 863 15 07");

    const extra = await value<string>("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [
      JSON.stringify({ name: "PDF stand", kind: "other", address: "Stand 1", phone: "+84 11" }),
      ACTOR,
    ]);
    const saved = await one<{ address: string; phone: string }>(
      "select address, phone from public.erp_warehouses where id = $1",
      [extra],
    );
    assert.equal(saved.address, "Stand 1");
    assert.equal(saved.phone, "+84 11");
    await q("select public.erp_save_ref('warehouse', $1::jsonb, $2)", [
      JSON.stringify({ id: extra, name: "PDF stand 2" }),
      ACTOR,
    ]);
    const kept = await one<{ name: string; address: string; phone: string }>(
      "select name, address, phone from public.erp_warehouses where id = $1",
      [extra],
    );
    assert.equal(kept.name, "PDF stand 2");
    assert.equal(kept.address, "Stand 1", "name-only save does not wipe address");

    const whDraft = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({ warehouseId: mainWh, lines: [{ product_id: beef, qty: 1 }] }),
      ACTOR,
    ]);
    const pre = await j("select public.erp_order_pdf_revision($1, $2)", [whDraft.id, ACTOR]);
    assert.equal(pre.status, "draft", "pre-order freeze does not place");
    const preSnap = asJson(pre.snapshot) as unknown as OrderPdfInput;
    assert.equal(preSnap.kind, "pre");
    const preMeta = orderPdfHeaderMeta(preSnap);
    assert.equal(
      preMeta.some((line) => /Recipient \/|Delivery address \/|Warehouse \/ Kho:|Address \/ Địa chỉ:|Phone \/|Mường Thanh|152 Lk 77/.test(line)),
      false,
    );
    await makeOrderPdfBlob(preSnap);
    const placedWh = await j("select public.erp_order_place($1, $2)", [whDraft.id, ACTOR]);
    assert.equal(placedWh.status, "ordered");
    const finalSnap = asJson(await value("select public.erp_order_build_pdf_input($1)", [whDraft.id])) as unknown as OrderPdfInput;
    assert.equal(finalSnap.kind, "final");
    assert.match(String(finalSnap.warehouseAddress ?? ""), /152 Lk 77 Đường số 51/);
    const finalMeta = orderPdfHeaderMeta(finalSnap);
    assert.equal(finalMeta.filter((line) => line.startsWith("Recipient / Người nhận:")).length, 1);
    assert.equal(finalMeta.filter((line) => line.startsWith("Warehouse / Kho:")).length, 0);
    assert.equal(finalMeta.filter((line) => line.startsWith("Delivery address / Địa chỉ giao hàng:")).length, 1);
    assert.ok(finalMeta.some((line) => line === "Recipient / Người nhận: GASTROFOOD Warehouse / Kho"));
    assert.ok(finalMeta.some((line) => line.startsWith("Delivery address / Địa chỉ giao hàng:") && line.includes("152 Lk 77 Đường số 51")));
    assert.equal(
      finalMeta.some((line) => /Mường Thanh/.test(line)),
      false,
    );
    assert.match(getOrderPdfFileName(finalSnap), /^Order_Test-MM_\d{4}-\d{2}-\d{2}\.pdf$/);
    const stored = asJson(await value("select public.erp_order_pdf_input($1)", [whDraft.id])) as unknown as OrderPdfInput;
    assert.equal(stored.kind, "final", "place refreshes snapshot kind to final");
    await makeOrderPdfBlob(finalSnap);
    assert.equal(await stock(beef, mainWh), 0, "place does not move stock");
  });

  await test("PDF qty cell is the pack count only (2), not 24 l or 2 box", async () => {
    const milk = await saveProduct({
      type: "ingredient",
      name_en: "Order oat milk",
      name_vn: "Sữa yến mạch",
      base_unit: "l",
    });
    await q(
      "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default, code) values ($1, $2, 'box 12*1 L', 12, true, 'OAT-BOX')",
      [milk, supplier],
    );
    const milkDraft = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({
        warehouseId: prep,
        lines: [{ product_id: milk, packQty: 2, qty: 2 }],
      }),
      ACTOR,
    ]);
    const pdf = await j("select public.erp_order_pdf_revision($1, $2)", [milkDraft.id, ACTOR]);
    const line = asJson(asArr(asJson(pdf.snapshot).lines)[0]);
    assert.equal(line.packLabel, "box 12*1 L");
    assert.equal(formatOrderPdfPackLabel(String(line.packLabel)), "Box / Thùng 12*1 L");
    assert.equal(line.packCode, "OAT-BOX");
    assert.equal(line.unit, "box");
    assert.equal(n(line.qty), 2);
    assert.equal(formatOrderPdfQtyCell({ qty: Number(line.qty), unit: String(line.unit) }), "2");
    assert.notEqual(n(line.qty), 24);
  });

  await test("2 boxes of 20 kg stay 2 boxes on the order, not 40 boxes", async () => {
    const meat = await saveProduct({
      type: "ingredient",
      name_en: "Buffalo Striploin",
      name_vn: "Thăn ngoại trâu",
      base_unit: "kg",
    });
    await q(
      "insert into public.erp_product_packs (product_id, supplier_id, label, qty_base, is_default) values ($1, $2, 'Box 20 kg', 20, true)",
      [meat, supplier],
    );
    const meatDraft = await j("select public.erp_order_save_draft($1, $2::jsonb, $3)", [
      supplier,
      JSON.stringify({
        warehouseId: prep,
        lines: [{ product_id: meat, packQty: 2, qty: 2 }],
      }),
      ACTOR,
    ]);
    const placedMeat = await j("select public.erp_order_place($1, $2)", [meatDraft.id, ACTOR]);
    const meatLine = asJson(asArr(placedMeat.lines)[0]);
    assert.equal(n(meatLine.packQty), 2, "cook typed 2 boxes");
    assert.equal(n(meatLine.orderedQty), 40, "warehouse qty is 2 × 20 kg");
    assert.equal(n(meatLine.packQtyBase), 20);
    assert.equal(
      formatOrderLineQty(Number(meatLine.orderedQty), {
        orderedQty: Number(meatLine.orderedQty),
        packQty: Number(meatLine.packQty),
        packQtyBase: Number(meatLine.packQtyBase),
        packLabel: String(meatLine.packLabel),
        unit: String(meatLine.unit),
      }, "ordered"),
      "2 box",
      "order card must not show 40 box",
    );
    assert.equal(meatLine.baseUnit, "kg");
    const got = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placedMeat.id,
      JSON.stringify({
        idempotencyKey: "recv-other-kg",
        lines: [{ orderLineId: meatLine.id, qty: 35.5 }],
      }),
      ACTOR,
    ]);
    const gotLine = asJson(asArr(got.lines)[0]);
    assert.equal(n(gotLine.acceptedQty), 35.5, "other qty is kg as typed, not 35.5 boxes × 20");
    assert.equal(n(gotLine.remainingQty), 0, "other qty does not leave an open remainder to receive again");
    assert.equal(got.status, "received");
  });

  console.log(`\n${passed} passed (PGlite only, no production SQL)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
