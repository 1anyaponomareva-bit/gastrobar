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
  getOrderPdfFileName,
  makeOrderPdfBlob,
  orderPdfTitle,
  setOrderPdfFonts,
  type OrderPdfInput,
} from "../../src/lib/orders/orderPdf";
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
async function post(id: string) {
  return value<Record<string, unknown>>("select public.erp_post_document($1, $2)", [id, ADMIN]);
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

  await test("PDF download bumps revision, freezes OrderPdfInput, does not place", async () => {
    const first = await j("select public.erp_order_pdf_revision($1, $2)", [draft.id, ACTOR]);
    assert.equal(first.status, "draft");
    assert.equal(n(first.revision), 1);
    assert.equal(first.placed, false);
    const snap = asJson(first.snapshot) as unknown as OrderPdfInput;
    assert.equal(snap.orderNo, draft.orderNo);
    assert.equal(snap.revision, 1);
    assert.equal(snap.supplierName, "Test MM");
    assert.ok(snap.warehouseName);
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
        unit: "kg",
        qty: 10,
      },
    );
    const file1 = getOrderPdfFileName(snap);
    assert.match(file1, /^Order_Test-MM_\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.doesNotMatch(file1, /_r\d/);
    assert.doesNotMatch(orderPdfTitle(snap), /\br\d\b|rev /i);
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
    const again = await j("select public.erp_order_place($1, $2)", [draft.id, ACTOR]);
    assert.equal(n(again.revision), 2, "double place does not bump revision");
  });

  const lineId = asJson(asArr(placed.lines)[0]).id as string;

  await test("partial delivery 10 then 6 then 4 kg: receive does not move stock", async () => {
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
    assert.equal(rec1.status, "partial");
    const qty1 = asJson(asArr(rec1.lines)[0]);
    assert.equal(n(qty1.orderedQty), 10);
    assert.equal(n(qty1.acceptedQty), 6);
    assert.equal(n(qty1.postedQty), 0);
    assert.equal(n(qty1.remainingQty), 4);
    const receipt = asJson(asArr(rec1.receipts)[0]);
    assert.equal(receipt.status, "draft");
    assert.equal(await stock(beef, prep), 0, "receive does not move stock");
    assert.equal(
      n(await value("select count(*) from public.erp_lots where product_id = $1", [beef])),
      0,
    );

    const dup = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placed.id,
      JSON.stringify({
        idempotencyKey: "recv-6",
        lines: [{ orderLineId: lineId, qty: 6 }],
      }),
      ACTOR,
    ]);
    assert.equal(asArr(dup.receipts).length, 1, "retry does not duplicate the receipt");
    assert.equal(n(asJson(asArr(dup.lines)[0]).acceptedQty), 6);

    const docId = asJson(asArr(rec1.receipts)[0]).documentId as string;
    const posted = asJson(await value("select public.erp_order_admin_post($1, $2, $3)", [docId, ADMIN, true]));
    assert.equal(posted.cost_known, false, "unknown price stays unknown");
    assert.equal(await stock(beef, prep), 6, "admin post increases stock once");
    await expectError(post(docId), "ERP_ALREADY_POSTED");
    assert.equal(await stock(beef, prep), 6);

    const rec2 = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      placed.id,
      JSON.stringify({
        idempotencyKey: "recv-4",
        lines: [{ orderLineId: lineId, qty: 4 }],
      }),
      ACTOR,
    ]);
    assert.equal(n(asJson(asArr(rec2.lines)[0]).acceptedQty), 10);
    assert.equal(n(asJson(asArr(rec2.lines)[0]).postedQty), 6);
    assert.equal(n(asJson(asArr(rec2.lines)[0]).remainingQty), 0);
    assert.equal(await stock(beef, prep), 6);
    const doc2 = asJson(asArr(rec2.receipts)[1]).documentId as string;
    await value("select public.erp_order_admin_post($1, $2, $3)", [doc2, ADMIN, true]);
    assert.equal(await stock(beef, prep), 10);
    const closed = await j("select public.erp_order_get($1, $2, false)", [placed.id, ACTOR]);
    assert.equal(closed.status, "closed");
    assert.equal(n(asJson(asArr(closed.lines)[0]).postedQty), 10);
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

  await test("return-to-clarify edits the same receipt; permissions hide foreign orders", async () => {
    await expectError(q("select public.erp_order_get($1, $2, false)", [clarifyOrder.id, ACTOR]), "ERP_FORBIDDEN");
    const rec = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      clarifyOrder.id,
      JSON.stringify({
        idempotencyKey: "clarify-1",
        lines: [{ orderLineId: otherLineId, qty: 5 }],
      }),
      OTHER,
    ]);
    const documentId = asJson(asArr(rec.receipts)[0]).documentId as string;
    await expectError(
      q("select public.erp_order_return_to_clarify($1, $2, $3, false)", [documentId, "wrong photo", OTHER]),
      "ERP_FORBIDDEN",
    );
    const clarified = await j("select public.erp_order_return_to_clarify($1, $2, $3, true)", [
      documentId,
      "qty looks high",
      ADMIN,
    ]);
    assert.equal(asJson(asArr(clarified.receipts)[0]).needsClarify, true);
    const edited = await j("select public.erp_order_receive($1, $2::jsonb, $3)", [
      clarifyOrder.id,
      JSON.stringify({
        idempotencyKey: "clarify-1",
        lines: [{ orderLineId: otherLineId, qty: 3 }],
      }),
      OTHER,
    ]);
    assert.equal(asArr(edited.receipts).length, 1, "same receipt");
    assert.equal(asJson(asArr(edited.receipts)[0]).documentId, documentId);
    assert.equal(asJson(asArr(edited.receipts)[0]).needsClarify, false);
    assert.equal(n(asJson(asArr(edited.lines)[0]).acceptedQty), 3);
    assert.equal(await stock(beef, prep), 10, "clarify edit does not post");
  });

  await test("grant lets a colleague see the order; leftover close keeps posted stock", async () => {
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
    const receipts = asArr(closed.receipts);
    assert.ok(receipts.length >= 1);
    assert.equal(await stock(beef, prep), 10, "posted receipts stay after leftover close");
  });

  await test("over-qty and substitution are discrepancies, not an auto product swap", async () => {
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
    const rline = asJson(asArr(asJson(asArr(rec.receipts)[0]).lines)[0]);
    assert.equal(rline.discrepancy, "substitution");
    assert.equal(rline.product_id, salt);
    assert.equal(asJson(asArr(rec.lines)[0]).product_id, beef, "order line product is not swapped");
    assert.equal(n(asJson(asArr(rec.lines)[0]).acceptedQty), 3);
    assert.equal(n(asJson(asArr(rec.lines)[0]).remainingQty), 0);
  });

  await test("product archived after order still receives; admin post still lands stock", async () => {
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
    const docId = asJson(asArr(rec.receipts)[0]).documentId as string;
    await value("select public.erp_order_admin_post($1, $2, $3)", [docId, ADMIN, true]);
    assert.equal(await stock(lime, prep), 1);
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

  console.log(`\n${passed} passed (PGlite only, no production SQL)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
