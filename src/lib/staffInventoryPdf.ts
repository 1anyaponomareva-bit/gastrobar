import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage, type PDFFont, rgb } from "pdf-lib";
import type { StaffInventoryRow } from "@/components/staff/staffInventoryTypes";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverPdfFile,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";

import type { StaffInventoryPdfLabels } from "@/lib/staffInventoryI18n";

export type StaffInventoryPdfOptions = {
  venueLabel: string;
  date: string;
  employee: string;
  rows: StaffInventoryRow[];
  labels: StaffInventoryPdfLabels;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BLOCK_GAP = 10;
const SECTION_GAP = 20;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.42, 0.42, 0.42),
  gold: rgb(0.95, 0.68, 0),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
  white: rgb(1, 1, 1),
};

let fontBytesPromise: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null =
  null;

async function loadFontBytes(): Promise<{
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}> {
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all([
      fetch(getAssetUrl("/fonts/NotoSans-Regular.ttf")).then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load NotoSans-Regular.ttf");
        }
        return response.arrayBuffer();
      }),
      fetch(getAssetUrl("/fonts/NotoSans-Bold.ttf")).then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load NotoSans-Bold.ttf");
        }
        return response.arrayBuffer();
      }),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }

  return fontBytesPromise;
}

export function preloadStaffInventoryPdfFonts(): void {
  void loadFontBytes();
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function groupedRows(rows: StaffInventoryRow[]): Record<string, StaffInventoryRow[]> {
  const groups: Record<string, StaffInventoryRow[]> = {};
  rows.forEach((row) => {
    if (!groups[row.category]) groups[row.category] = [];
    groups[row.category].push(row);
  });
  return groups;
}

function buildPdfFileName(venueLabel: string, date: string): string {
  return `${venueLabel.replace(/\s+/g, "")}_Inventory_${date || "checklist"}.pdf`;
}

export function getStaffInventoryPdfFileName(
  venueLabel: string,
  date: string,
): string {
  return buildPdfFileName(venueLabel, date);
}

type PdfContext = {
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  pdfDoc: PDFDocument;
};

function createPdfContext(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
): PdfContext {
  return {
    pdfDoc,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    fontBold,
  };
}

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN_TOP;
}

function drawFilledBox(
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

function drawTextLine(
  ctx: PdfContext,
  text: string,
  x: number,
  baselineY: number,
  size: number,
  activeFont: PDFFont,
  color = COLORS.text,
) {
  ctx.page.drawText(text, {
    x,
    y: baselineY,
    size,
    font: activeFont,
    color,
  });
}

function wrapText(
  text: string,
  activeFont: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (activeFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.length ? lines : [normalized];
}

function measureWrappedText(
  text: string,
  activeFont: PDFFont,
  fontSize: number,
  maxWidth: number,
  lineGap = 4,
): { lines: string[]; height: number } {
  const lines = wrapText(text, activeFont, fontSize, maxWidth);
  const height = lines.length * fontSize + Math.max(0, lines.length - 1) * lineGap;
  return { lines, height };
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
  const activeFont = options.bold ? ctx.fontBold : ctx.font;
  const color = options.color ?? COLORS.text;
  const lineGap = options.lineGap ?? 4;
  const lineStep = options.size + lineGap;
  let baselineY = topY - options.size;

  lines.forEach((line) => {
    drawTextLine(ctx, line, x, baselineY, options.size, activeFont, color);
    baselineY -= lineStep;
  });

  return lines.length * lineStep - lineGap;
}

function drawWrappedBlock(
  ctx: PdfContext,
  text: string,
  size: number,
  options: {
    x?: number;
    maxWidth?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    lineGap?: number;
    gapAfter?: number;
  } = {},
): number {
  const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
  const activeFont = options.bold ? ctx.fontBold : ctx.font;
  const { lines, height } = measureWrappedText(
    text,
    activeFont,
    size,
    maxWidth,
    options.lineGap,
  );
  const gapAfter = options.gapAfter ?? BLOCK_GAP;

  ensureSpace(ctx, height + gapAfter);
  const topY = ctx.y;
  drawWrappedLines(ctx, lines, topY, { ...options, size });
  ctx.y = topY - height - gapAfter;
  return height + gapAfter;
}

function drawHeader(ctx: PdfContext, options: StaffInventoryPdfOptions, rows: StaffInventoryRow[]) {
  const { labels } = options;
  const title = labels.title;
  const titleBlock = measureWrappedText(title, ctx.fontBold, 20, CONTENT_WIDTH);
  const meta = [labels.dateLine, labels.employeeLine, labels.itemsLine];
  const metaLineHeight = 14;
  const metaHeight = meta.length * metaLineHeight + 16;
  const headerHeight =
    8 +
    titleBlock.height +
    10 +
    metaHeight +
    SECTION_GAP;

  ensureSpace(ctx, headerHeight);
  const headerTop = ctx.y;

  drawFilledBox(ctx, MARGIN_LEFT, headerTop, CONTENT_WIDTH, 4, COLORS.gold, COLORS.gold);

  let topY = headerTop - 12;
  drawWrappedLines(ctx, titleBlock.lines, topY, { size: 20, bold: true });
  topY -= titleBlock.height + 10;

  const metaTop = topY;
  drawFilledBox(ctx, MARGIN_LEFT, metaTop, CONTENT_WIDTH, metaHeight, COLORS.goldSoft);

  let metaBaseline = metaTop - 14;
  meta.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT + 12, metaBaseline, 10, ctx.font, COLORS.text);
    metaBaseline -= metaLineHeight;
  });

  topY = metaTop - metaHeight - 8;
  ctx.y = headerTop - headerHeight;
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  const size = 11;
  const height = 24;
  const total = height + BLOCK_GAP;

  ensureSpace(ctx, total);
  const topY = ctx.y;
  drawFilledBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, height, COLORS.section);
  drawTextLine(
    ctx,
    title.toUpperCase(),
    MARGIN_LEFT + 10,
    topY - 16,
    size,
    ctx.fontBold,
    COLORS.text,
  );
  ctx.y = topY - total;
}

function drawTableHeader(ctx: PdfContext, labels: StaffInventoryPdfLabels) {
  const height = 20;
  const total = height + 6;

  ensureSpace(ctx, total);
  const topY = ctx.y;
  drawFilledBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, height, COLORS.section);

  const baseline = topY - 14;
  drawTextLine(ctx, "#", MARGIN_LEFT + 8, baseline, 8, ctx.fontBold);
  drawTextLine(ctx, labels.colItem, MARGIN_LEFT + 28, baseline, 8, ctx.fontBold);
  drawTextLine(ctx, labels.colLeft, 350, baseline, 8, ctx.fontBold);
  drawTextLine(ctx, labels.colNeeded, 460, baseline, 8, ctx.fontBold);

  ctx.y = topY - total;
}

function formatStockValue(value: number, unit: string, isFilled: boolean): string {
  if (!isFilled) return "";
  return `${money(value)} ${unit}`;
}

function drawTableRow(
  ctx: PdfContext,
  row: StaffInventoryRow,
  index: number,
) {
  const labelSize = 9;
  const labelWidth = 250;
  const lines = wrapText(row.name, ctx.fontBold, labelSize, labelWidth);
  const lineGap = 3;
  const textHeight = lines.length * labelSize + Math.max(0, lines.length - 1) * lineGap;
  const rowHeight = Math.max(textHeight + 12, 22);
  const total = rowHeight + 6;

  ensureSpace(ctx, total);
  const rowTop = ctx.y;
  drawFilledBox(ctx, MARGIN_LEFT, rowTop, CONTENT_WIDTH, rowHeight, COLORS.white);

  const baseline = rowTop - 14;
  drawTextLine(ctx, String(index + 1), MARGIN_LEFT + 8, baseline, 9, ctx.font);
  drawTextLine(
    ctx,
    formatStockValue(row.current, row.leftUnit, row.hasCurrent),
    350,
    baseline,
    9,
    ctx.font,
  );
  drawTextLine(
    ctx,
    formatStockValue(row.needed, row.neededUnit, row.hasNeeded),
    460,
    baseline,
    9,
    ctx.font,
  );

  let labelBaseline = rowTop - 12;
  lines.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT + 28, labelBaseline, labelSize, ctx.fontBold);
    labelBaseline -= labelSize + lineGap;
  });

  ctx.y = rowTop - total;
}

export async function makeStaffInventoryPdfBlob(
  options: StaffInventoryPdfOptions,
): Promise<Blob> {
  const rows = options.rows.filter((row) => row.hasCurrent || row.hasNeeded);
  const { regular, bold } = await loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regular);
  const fontBold = await pdfDoc.embedFont(bold);
  const ctx = createPdfContext(pdfDoc, font, fontBold);

  drawHeader(ctx, options, rows);

  if (!rows.length) {
    drawWrappedBlock(ctx, options.labels.emptyMessage, 14, { bold: true });
  } else {
    const groups = groupedRows(rows);
    Object.keys(groups).forEach((category) => {
      drawSectionTitle(ctx, options.labels.categoryLabel(category));
      drawTableHeader(ctx, options.labels);
      groups[category].forEach((row, index) => drawTableRow(ctx, row, index));
      ctx.y -= 4;
    });
  }

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export async function exportStaffInventoryPdf(
  options: StaffInventoryPdfOptions,
): Promise<DeliverPdfResult> {
  const blob = await makeStaffInventoryPdfBlob(options);
  const fileName = buildPdfFileName(options.venueLabel, options.date);
  return deliverPdfFile(blob, fileName);
}
