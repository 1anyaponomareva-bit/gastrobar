import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  formatOrderLineName,
  formatOrderPdfDate,
  formatOrderPdfQtyCell,
  getOrderPdfFileName,
  orderPdfCacheKey,
  orderPdfLineCode,
  orderPdfLines,
  orderPdfRevisionLabel,
  orderPdfTitle,
  type OrderPdfFonts,
  type OrderPdfInput,
  type OrderPdfLine,
} from "./orderPdfTypes";

export type { OrderPdfFonts, OrderPdfInput, OrderPdfLine } from "./orderPdfTypes";
export {
  asciiFileLabel,
  formatOrderLineName,
  formatOrderPdfDate,
  formatOrderPdfQtyCell,
  formatOrderQty,
  getOrderPdfFileName,
  orderPdfCacheKey,
  orderPdfLineCode,
  orderPdfLines,
  orderPdfRevisionLabel,
  orderPdfTitle,
} from "./orderPdfTypes";

/** Same company block the old Staff supplier PDF printed. Not imported from staff catalog. */
export const ORDER_PDF_COMPANY_FOOTER = [
  "GASTROFOOD",
  "Khối 12A tòa OC3 thuộc dự án Mường Thanh Viễn Triều, Phường Bắc Nha Trang, Khánh Hòa",
  "+84 98 863 15 07",
] as const;

export const ORDER_PDF_EMPTY_MESSAGE =
  "No items marked for order. / Không có mặt hàng nào được chọn để đặt.";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 36;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BLOCK_GAP = 8;
const SECTION_GAP = 16;

const COL_QTY = 320;
const COL_CODE = 460;
const ITEM_WIDTH = COL_QTY - (MARGIN_LEFT + 30) - 8;
const QTY_WIDTH = COL_CODE - COL_QTY - 8;
const CODE_WIDTH = MARGIN_LEFT + CONTENT_WIDTH - COL_CODE - 8;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.38, 0.38, 0.38),
  gold: rgb(0.95, 0.68, 0),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
  white: rgb(1, 1, 1),
};

type PdfContext = {
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  pdfDoc: PDFDocument;
  onNewPage: (() => void) | null;
};

let injectedFonts: OrderPdfFonts | null = null;
let fontBytesPromise: Promise<OrderPdfFonts> | null = null;

/** Tests and `scripts/orders/sample-pdf.ts` inject disk fonts so the module stays browser-safe. */
export function setOrderPdfFonts(fonts: OrderPdfFonts | null): void {
  injectedFonts = fonts;
  fontBytesPromise = fonts ? Promise.resolve(fonts) : null;
}

async function loadFontBytes(): Promise<OrderPdfFonts> {
  if (injectedFonts) return injectedFonts;
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all([
      fetch("/fonts/NotoSans-Regular.ttf").then((response) => {
        if (!response.ok) throw new Error("Failed to load NotoSans-Regular.ttf");
        return response.arrayBuffer();
      }),
      fetch("/fonts/NotoSans-Bold.ttf").then((response) => {
        if (!response.ok) throw new Error("Failed to load NotoSans-Bold.ttf");
        return response.arrayBuffer();
      }),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontBytesPromise;
}

export function preloadOrderPdfFonts(): void {
  void loadFontBytes();
}

function wrapText(text: string, activeFont: PDFFont, fontSize: number, maxWidth: number): string[] {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const fitCount = (token: string) => {
    if (activeFont.widthOfTextAtSize(token, fontSize) <= maxWidth) return token.length;
    let lo = 1;
    let hi = token.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (activeFont.widthOfTextAtSize(token.slice(0, mid), fontSize) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(1, lo);
  };

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  const flushOverflow = (token: string) => {
    let rest = token;
    while (rest && activeFont.widthOfTextAtSize(rest, fontSize) > maxWidth) {
      const take = fitCount(rest);
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    current = rest;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (activeFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (activeFont.widthOfTextAtSize(word, fontSize) <= maxWidth) current = word;
    else flushOverflow(word);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [normalized];
}

function measureWrapped(
  text: string,
  activeFont: PDFFont,
  fontSize: number,
  maxWidth: number,
  lineGap = 3,
): { lines: string[]; height: number } {
  const lines = wrapText(text, activeFont, fontSize, maxWidth);
  const height = lines.length * fontSize + Math.max(0, lines.length - 1) * lineGap;
  return { lines, height };
}

function drawText(
  ctx: PdfContext,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = COLORS.text,
) {
  ctx.page.drawText(text, { x, y, size, font, color });
}

function drawBox(
  ctx: PdfContext,
  x: number,
  topY: number,
  width: number,
  height: number,
  fill: ReturnType<typeof rgb>,
  border = COLORS.line,
) {
  ctx.page.drawRectangle({
    x,
    y: topY - height,
    width,
    height,
    color: fill,
    borderColor: border,
    borderWidth: 0.6,
  });
}

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN_TOP;
  ctx.onNewPage?.();
}

function drawWrappedLines(
  ctx: PdfContext,
  lines: string[],
  topY: number,
  options: {
    x?: number;
    size: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    lineGap?: number;
  },
): number {
  const x = options.x ?? MARGIN_LEFT;
  const font = options.bold ? ctx.fontBold : ctx.font;
  const color = options.color ?? COLORS.text;
  const lineGap = options.lineGap ?? 3;
  const step = options.size + lineGap;
  let baseline = topY - options.size;
  for (const line of lines) {
    drawText(ctx, line, x, baseline, options.size, font, color);
    baseline -= step;
  }
  return lines.length * step - lineGap;
}

function documentHeading(input: OrderPdfInput): string {
  const warehouse = String(input.warehouseName ?? "").trim();
  const place = warehouse ? warehouse.toUpperCase() : "GASTROFOOD";
  return `${place} — ORDER / ĐƠN ĐẶT HÀNG: ${input.supplierName.trim().toUpperCase() || "—"}`;
}

function metaLines(input: OrderPdfInput): string[] {
  const lines = [`Order / Số: ${input.orderNo.trim() || "—"}`, `Date / Ngày: ${formatOrderPdfDate(input.orderedAt)}`];
  const warehouse = String(input.warehouseName ?? "").trim();
  if (warehouse) lines.push(`Warehouse / Kho: ${warehouse}`);
  const comment = String(input.comment ?? "").replace(/\s+/g, " ").trim();
  if (comment) lines.push(`Note / Ghi chú: ${comment}`);
  return lines;
}

function drawHeader(ctx: PdfContext, input: OrderPdfInput) {
  const title = documentHeading(input);
  const titleBlock = measureWrapped(title, ctx.fontBold, 16, CONTENT_WIDTH, 4);
  const meta = metaLines(input);
  const metaBlocks = meta.map((line) => measureWrapped(line, ctx.font, 11, CONTENT_WIDTH - 24, 3));
  const metaPad = 12;
  const metaGap = 5;
  const metaHeight =
    metaPad + metaBlocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, meta.length - 1) * metaGap + 10;
  const headerHeight = 6 + titleBlock.height + 10 + metaHeight + SECTION_GAP;

  ensureSpace(ctx, headerHeight);
  const headerTop = ctx.y;
  drawBox(ctx, MARGIN_LEFT, headerTop, CONTENT_WIDTH, 4, COLORS.gold, COLORS.gold);

  let topY = headerTop - 12;
  drawWrappedLines(ctx, titleBlock.lines, topY, { size: 16, bold: true, lineGap: 4 });
  topY -= titleBlock.height + 10;

  drawBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, metaHeight, COLORS.goldSoft);
  let metaY = topY - metaPad;
  for (const block of metaBlocks) {
    drawWrappedLines(ctx, block.lines, metaY, { x: MARGIN_LEFT + 12, size: 11, lineGap: 3 });
    metaY -= block.height + metaGap;
  }

  ctx.y = headerTop - headerHeight;
}

function drawContinuationBar(ctx: PdfContext, input: OrderPdfInput) {
  const label = `${input.supplierName} · ${input.orderNo}`;
  const block = measureWrapped(label, ctx.fontBold, 10, CONTENT_WIDTH - 16, 3);
  const height = Math.max(22, block.height + 10);
  const topY = ctx.y;
  drawBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, height, COLORS.goldSoft, COLORS.gold);
  drawWrappedLines(ctx, block.lines, topY - 6, {
    x: MARGIN_LEFT + 8,
    size: 10,
    bold: true,
    lineGap: 3,
  });
  ctx.y = topY - height - 8;
}

function drawTableHeader(ctx: PdfContext) {
  const height = 22;
  ensureSpace(ctx, height + 6);
  const topY = ctx.y;
  drawBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, height, COLORS.section);
  const baseline = topY - 15;
  drawText(ctx, "#", MARGIN_LEFT + 8, baseline, 9, ctx.fontBold);
  drawText(ctx, "ITEM / MẶT HÀNG", MARGIN_LEFT + 30, baseline, 9, ctx.fontBold);
  drawText(ctx, "QTY / SỐ LƯỢNG", COL_QTY, baseline, 9, ctx.fontBold);
  drawText(ctx, "ITEM # / MÃ HÀNG", COL_CODE, baseline, 9, ctx.fontBold);
  ctx.y = topY - height - 6;
}

function drawOrderRow(ctx: PdfContext, line: OrderPdfLine, index: number) {
  const nameEn = String(line.nameEn ?? "").replace(/\s+/g, " ").trim();
  const nameVn = String(line.nameVn ?? "").replace(/\s+/g, " ").trim();
  const brand = String(line.brand ?? "").replace(/\s+/g, " ").trim();
  const pack = String(line.packLabel ?? "").replace(/\s+/g, " ").trim();
  const code = orderPdfLineCode(line.packCode);
  const qtyText = formatOrderPdfQtyCell(line);
  const bilingual = formatOrderLineName(line);

  const nameLines = wrapText(nameEn || bilingual, ctx.fontBold, 11, ITEM_WIDTH);
  const vnLines = nameVn && nameVn !== nameEn ? wrapText(nameVn, ctx.font, 9, ITEM_WIDTH) : [];
  const brandLines = brand ? wrapText(brand, ctx.font, 9, ITEM_WIDTH) : [];
  const qtyLines = wrapText(qtyText, ctx.fontBold, 12, QTY_WIDTH);
  const packLines = pack ? wrapText(pack, ctx.font, 9, QTY_WIDTH) : [];
  const codeLines = code ? wrapText(code, ctx.font, 9, CODE_WIDTH) : [];

  const leftHeight = nameLines.length * 14 + vnLines.length * 12 + brandLines.length * 12;
  const rightHeight = qtyLines.length * 15 + packLines.length * 12;
  const codeHeight = codeLines.length * 12;
  const rowHeight = Math.max(28, leftHeight + 12, rightHeight + 12, codeHeight + 12);

  ensureSpace(ctx, rowHeight + 6);
  const rowTop = ctx.y;
  drawBox(ctx, MARGIN_LEFT, rowTop, CONTENT_WIDTH, rowHeight, COLORS.white);

  const baseline = rowTop - 16;
  drawText(ctx, String(index + 1), MARGIN_LEFT + 8, baseline, 10, ctx.font);

  let nameY = baseline;
  for (const row of nameLines) {
    drawText(ctx, row, MARGIN_LEFT + 30, nameY, 11, ctx.fontBold);
    nameY -= 14;
  }
  for (const row of vnLines) {
    drawText(ctx, row, MARGIN_LEFT + 30, nameY + 1, 9, ctx.font);
    nameY -= 12;
  }
  for (const row of brandLines) {
    drawText(ctx, row, MARGIN_LEFT + 30, nameY + 1, 9, ctx.font, COLORS.muted);
    nameY -= 12;
  }

  let qtyY = baseline;
  for (const row of qtyLines) {
    drawText(ctx, row, COL_QTY, qtyY, 12, ctx.fontBold);
    qtyY -= 15;
  }
  for (const row of packLines) {
    drawText(ctx, row, COL_QTY, qtyY + 2, 9, ctx.font, COLORS.muted);
    qtyY -= 12;
  }

  let codeY = baseline;
  for (const row of codeLines) {
    drawText(ctx, row, COL_CODE, codeY, 9, ctx.font);
    codeY -= 12;
  }

  ctx.y = rowTop - rowHeight - 6;
}

function drawEmpty(ctx: PdfContext) {
  const block = measureWrapped(ORDER_PDF_EMPTY_MESSAGE, ctx.fontBold, 13, CONTENT_WIDTH, 4);
  ensureSpace(ctx, block.height + BLOCK_GAP);
  drawWrappedLines(ctx, block.lines, ctx.y, { size: 13, bold: true, lineGap: 4 });
  ctx.y -= block.height + BLOCK_GAP;
}

function drawFooter(ctx: PdfContext) {
  const blocks = ORDER_PDF_COMPANY_FOOTER.map((line, index) =>
    measureWrapped(line, index === 0 ? ctx.fontBold : ctx.font, 10, CONTENT_WIDTH - 24, 3),
  );
  const height = blocks.reduce((sum, block) => sum + block.height, 0) + (blocks.length - 1) * 5 + 20;
  ensureSpace(ctx, height + SECTION_GAP);
  const topY = ctx.y - SECTION_GAP;
  drawBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, height, COLORS.goldSoft);
  let y = topY - 10;
  blocks.forEach((block, index) => {
    y -=
      drawWrappedLines(ctx, block.lines, y, {
        x: MARGIN_LEFT + 12,
        size: 10,
        bold: index === 0,
        lineGap: 3,
      }) + 5;
  });
  ctx.y = topY - height;
}

function stampPageNumbers(pdfDoc: PDFDocument, font: PDFFont) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const label = `${index + 1} / ${pages.length}`;
    const width = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_RIGHT - width,
      y: 22,
      size: 8,
      font,
      color: COLORS.muted,
    });
  });
}

export async function makeOrderPdfBlob(input: OrderPdfInput): Promise<Blob> {
  const fonts = await loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const regularBytes = fonts.regular instanceof Uint8Array ? fonts.regular : new Uint8Array(fonts.regular);
  const boldBytes = fonts.bold instanceof Uint8Array ? fonts.bold : new Uint8Array(fonts.bold);
  const font = await pdfDoc.embedFont(regularBytes);
  const fontBold = await pdfDoc.embedFont(boldBytes);

  const revision = orderPdfRevisionLabel(input.revision);
  pdfDoc.setTitle(orderPdfTitle(input));
  pdfDoc.setSubject(`revision=${revision}`);
  pdfDoc.setKeywords([input.orderNo, input.supplierName].filter(Boolean));
  pdfDoc.setProducer("gastrobar-order-pdf");
  pdfDoc.setCreator("GASTROFOOD orders");

  const ctx: PdfContext = {
    pdfDoc,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    fontBold,
    onNewPage: null,
  };

  drawHeader(ctx, input);

  const lines = orderPdfLines(input);
  if (!lines.length) {
    drawEmpty(ctx);
  } else {
    ctx.onNewPage = () => {
      drawContinuationBar(ctx, input);
      drawTableHeader(ctx);
    };
    drawTableHeader(ctx);
    lines.forEach((line, index) => drawOrderRow(ctx, line, index));
    ctx.onNewPage = null;
  }

  drawFooter(ctx);
  stampPageNumbers(pdfDoc, font);

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
