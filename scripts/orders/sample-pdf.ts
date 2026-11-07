/**
 * Writes 1–2 small sample order PDFs and checks revision metadata.
 * Run from the worktree root: npx tsx scripts/orders/sample-pdf.ts
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  formatOrderPdfQtyCell,
  getOrderPdfFileName,
  makeOrderPdfBlob,
  orderPdfCacheKey,
  orderPdfTitle,
  setOrderPdfFonts,
  type OrderPdfInput,
} from "../../src/lib/orders/orderPdf";

const ROOT = process.cwd();
const SAMPLES = path.join(ROOT, "docs", "orders", "samples");
const FONTS = path.join(ROOT, "public", "fonts");

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const shortOrder = (): OrderPdfInput => ({
  orderNo: "ORD-2026-00012",
  revision: 1,
  orderedAt: "2026-11-07T08:15:00+07:00",
  supplierName: "MM",
  warehouseName: "Prep kitchen",
  comment: "Morning order",
  lines: [
    {
      nameEn: "Butter",
      nameVn: "Bơ",
      brand: "Allowrie Unsalted",
      packLabel: "box 5 kg",
      packCode: "234468",
      unit: "box",
      qty: 2,
    },
    {
      nameEn: "Saigon Beer (330ml)",
      nameVn: "Bia Sài Gòn (330ml)",
      brand: "",
      packLabel: "24 pcs",
      unit: "pack",
      qty: 3,
    },
    {
      nameEn: "Cheese - Cheddar (Sliced)",
      nameVn: "Phô mai Cheddar (lát)",
      brand: "Anchor",
      packLabel: "box 10*1040 g",
      unit: "box",
      qty: 1,
    },
  ],
});

const longOrder = (): OrderPdfInput => ({
  orderNo: "ORD-2026-00018",
  revision: 3,
  orderedAt: "2026-11-07",
  supplierName: "Hisina",
  warehouseName: "Kho lạnh GASTROFOOD",
  comment: "Long names + Vietnamese + enough lines to force a page break",
  lines: Array.from({ length: 28 }, (_, index) => ({
    nameEn: `Cheese - Cheddar Sliced Extra Long Product Name ${index + 1} (for wrapping)`,
    nameVn: `Phô mai Cheddar cắt lát tên rất dài để kiểm tra xuống dòng số ${index + 1}`,
    brand: index % 2 ? "Anchor / Thương hiệu rất dài cho dòng mô tả" : "Oatly Barista",
    packLabel: "box 10*1040 g",
    unit: "box / thùng",
    qty: 1 + (index % 4) * 0.5,
  })),
});

async function writeSample(name: string, input: OrderPdfInput): Promise<{ pages: number; bytes: Uint8Array }> {
  const blob = await makeOrderPdfBlob(input);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  const title = pdf.getTitle() ?? "";
  const subject = pdf.getSubject() ?? "";
  assert.equal(title, orderPdfTitle(input));
  assert.doesNotMatch(title, /\br\d\b|rev /i);
  assert.equal(subject, `revision=${Math.floor(input.revision)}`);
  const file = path.join(SAMPLES, name);
  await writeFile(file, bytes);
  return { pages: pdf.getPageCount(), bytes };
}

async function main() {
  setOrderPdfFonts({
    regular: toArrayBuffer(await readFile(path.join(FONTS, "NotoSans-Regular.ttf"))),
    bold: toArrayBuffer(await readFile(path.join(FONTS, "NotoSans-Bold.ttf"))),
  });
  await mkdir(SAMPLES, { recursive: true });

  const short = shortOrder();
  const long = longOrder();
  assert.equal(formatOrderPdfQtyCell(short.lines[0]), "2");
  assert.equal(formatOrderPdfQtyCell(short.lines[1]), "3");
  assert.equal(formatOrderPdfQtyCell(short.lines[2]), "1");
  assert.equal(getOrderPdfFileName(short), "Order_MM_2026-11-07.pdf");
  assert.equal(getOrderPdfFileName(long), "Order_Hisina_2026-11-07.pdf");
  assert.doesNotMatch(getOrderPdfFileName(short), /_r\d/);
  assert.notEqual(orderPdfCacheKey({ ...short, revision: 1 }), orderPdfCacheKey({ ...short, revision: 2 }));

  const shortOut = await writeSample("order-mm-short.pdf", short);
  const longOut = await writeSample("order-long-vn.pdf", long);
  assert.equal(shortOut.pages, 1, "short sample stays on one page");
  assert.ok(longOut.pages >= 2, `long sample must page-break, got ${longOut.pages}`);

  const rev2 = await makeOrderPdfBlob({ ...short, revision: 2 });
  const rev2Pdf = await PDFDocument.load(await rev2.arrayBuffer());
  assert.equal(rev2Pdf.getSubject(), "revision=2");
  assert.equal(getOrderPdfFileName({ ...short, revision: 1 }), getOrderPdfFileName({ ...short, revision: 2 }));

  const empty = await makeOrderPdfBlob({ ...short, lines: [] });
  const emptyPdf = await PDFDocument.load(await empty.arrayBuffer());
  assert.equal(emptyPdf.getPageCount(), 1);

  console.log(
    JSON.stringify(
      {
        short: { file: "docs/orders/samples/order-mm-short.pdf", pages: shortOut.pages, bytes: shortOut.bytes.byteLength },
        long: { file: "docs/orders/samples/order-long-vn.pdf", pages: longOut.pages, bytes: longOut.bytes.byteLength },
        revisionFilename: getOrderPdfFileName(short),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
