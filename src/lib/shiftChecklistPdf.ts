import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage, type PDFFont, rgb } from "pdf-lib";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverPdfFile,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";

type ChecklistPdfItem = {
  label: string;
  status: "none" | "done" | "failed";
  comment?: string;
  penaltyPoints?: number;
};

type ChecklistPdfSection = {
  title: string;
  items: ChecklistPdfItem[];
};

export type ShiftChecklistPdfOptions = {
  venueLabel: string;
  locale?: "ru" | "en";
  date: string;
  employee: string;
  shiftLabel: string;
  cleaningLabel: string;
  sections: ChecklistPdfSection[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BLOCK_GAP = 10;
const SECTION_GAP = 28;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.42, 0.42, 0.42),
  gold: rgb(0.95, 0.68, 0),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
  done: rgb(0.1, 0.52, 0.24),
  doneBg: rgb(0.94, 0.98, 0.95),
  failed: rgb(0.75, 0.08, 0.08),
  failedBg: rgb(1, 0.96, 0.96),
  white: rgb(1, 1, 1),
};

type PdfLabels = {
  title: string;
  failedTitle: string;
  noFailed: string;
  reason: string;
  fullChecklist: string;
  date: string;
  employee: string;
  shift: string;
  cleaning: string;
  statusDone: string;
  statusFailed: string;
  statusNone: string;
  summary: (done: number, total: number, failed: number, penaltyTotal?: number) => string;
  penaltyPointsLabel: (points: number) => string;
};

function getLabels(locale: "ru" | "en"): PdfLabels {
  if (locale === "ru") {
    return {
      title: "Чек-лист смены",
      failedTitle: "Не выполненные задачи",
      noFailed: "Невыполненных задач нет.",
      reason: "Причина",
      fullChecklist: "Полный чек-лист",
      date: "Дата",
      employee: "Сотрудник",
      shift: "Смена",
      cleaning: "Уборка",
      statusDone: "Выполнено",
      statusFailed: "Не выполнено",
      statusNone: "Не отмечено",
      summary: (done, total, failed, penaltyTotal) => {
        const base = `Выполнено: ${done} из ${total}   Не выполнено: ${failed}`;
        if (!penaltyTotal) return base;
        return `${base}   Штрафные баллы: ${penaltyTotal}`;
      },
      penaltyPointsLabel: (points) => `Штрафные баллы: ${points}`,
    };
  }

  return {
    title: "Shift Checklist",
    failedTitle: "Incomplete Tasks",
    noFailed: "No incomplete tasks.",
    reason: "Reason",
    fullChecklist: "Full Checklist",
    date: "Date",
    employee: "Employee",
    shift: "Shift",
    cleaning: "Cleaning",
    statusDone: "Done",
    statusFailed: "Not done",
    statusNone: "Not marked",
    summary: (done, total, failed, penaltyTotal) => {
      const base = `Done: ${done} / ${total}   Not done: ${failed}`;
      if (!penaltyTotal) return base;
      return `${base}   Penalty points: ${penaltyTotal}`;
    },
    penaltyPointsLabel: (points) => `Penalty points: ${points}`,
  };
}

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

export function preloadShiftChecklistPdfFonts(): void {
  void loadFontBytes();
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

function buildPdfFileName(venueLabel: string, date: string): string {
  return `${venueLabel.replace(/\s+/g, "")}_ShiftChecklist_${date || "checklist"}.pdf`;
}

export function getShiftChecklistPdfFileName(
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

function drawStatusBadge(
  ctx: PdfContext,
  status: ChecklistPdfItem["status"],
  labels: PdfLabels,
  rowTop: number,
  rowHeight: number,
) {
  const text =
    status === "done"
      ? labels.statusDone
      : status === "failed"
        ? labels.statusFailed
        : labels.statusNone;
  const size = 8.5;
  const activeFont = ctx.fontBold;
  const textWidth = activeFont.widthOfTextAtSize(text, size);
  const padX = 8;
  const padY = 5;
  const badgeWidth = textWidth + padX * 2;
  const badgeHeight = size + padY * 2;
  const badgeTop = rowTop - (rowHeight - badgeHeight) / 2;
  const x = PAGE_WIDTH - MARGIN_RIGHT - badgeWidth - 10;
  const fill =
    status === "done"
      ? COLORS.doneBg
      : status === "failed"
        ? COLORS.failedBg
        : COLORS.white;
  const border =
    status === "done"
      ? COLORS.done
      : status === "failed"
        ? COLORS.failed
        : COLORS.line;
  const color =
    status === "done"
      ? COLORS.done
      : status === "failed"
        ? COLORS.failed
        : COLORS.muted;

  drawFilledBox(ctx, x, badgeTop, badgeWidth, badgeHeight, fill, border);
  drawTextLine(
    ctx,
    text,
    x + padX,
    badgeTop - padY - size,
    size,
    activeFont,
    color,
  );
}

function drawChecklistItem(
  ctx: PdfContext,
  item: ChecklistPdfItem,
  labels: PdfLabels,
) {
  const labelSize = 10;
  const labelX = MARGIN_LEFT + 12;
  const badgeReserve = 104;
  const pointsText =
    item.penaltyPoints != null ? `${item.penaltyPoints} б.` : "";
  const pointsWidth = pointsText
    ? ctx.fontBold.widthOfTextAtSize(pointsText, 8.5) + 16
    : 0;
  const labelWidth = CONTENT_WIDTH - 24 - badgeReserve - pointsWidth;
  const lineGap = 4;
  const padY = 12;
  const lines = wrapText(item.label, ctx.font, labelSize, labelWidth);
  const textHeight = lines.length * labelSize + Math.max(0, lines.length - 1) * lineGap;
  const rowHeight = Math.max(textHeight + padY * 2, 34);
  const total = rowHeight + BLOCK_GAP;

  ensureSpace(ctx, total);
  const rowTop = ctx.y;
  const fill =
    item.status === "done"
      ? COLORS.doneBg
      : item.status === "failed"
        ? COLORS.failedBg
        : COLORS.white;

  drawFilledBox(ctx, MARGIN_LEFT, rowTop, CONTENT_WIDTH, rowHeight, fill);
  drawStatusBadge(ctx, item.status, labels, rowTop, rowHeight);

  let baselineY = rowTop - padY - labelSize;
  lines.forEach((line) => {
    drawTextLine(ctx, line, labelX, baselineY, labelSize, ctx.font, COLORS.text);
    baselineY -= labelSize + lineGap;
  });

  if (pointsText) {
    const pointsColor =
      item.status === "failed" ? COLORS.failed : COLORS.muted;
    const pointsX =
      PAGE_WIDTH - MARGIN_RIGHT - 10 - 104 - pointsWidth + 8;
    drawTextLine(
      ctx,
      pointsText,
      pointsX,
      rowTop - rowHeight / 2 - 3,
      8.5,
      ctx.fontBold,
      pointsColor,
    );
  }

  ctx.y = rowTop - total;
}

function drawFailedSummary(
  ctx: PdfContext,
  failedItems: Array<{ label: string; comment?: string }>,
  labels: PdfLabels,
) {
  drawWrappedBlock(ctx, labels.failedTitle, 12, { bold: true, gapAfter: 12 });

  if (!failedItems.length) {
    drawWrappedBlock(ctx, labels.noFailed, 10, {
      color: COLORS.muted,
      gapAfter: SECTION_GAP,
    });
    return;
  }

  failedItems.forEach((item, index) => {
    const reason = item.comment?.trim();
    const labelLines = wrapText(
      item.label,
      ctx.fontBold,
      10,
      CONTENT_WIDTH - 24,
    );
    const reasonLines = reason
      ? wrapText(
          `${labels.reason}: ${reason}`,
          ctx.font,
          9,
          CONTENT_WIDTH - 24,
        )
      : [];
    const labelHeight =
      labelLines.length * 10 + Math.max(0, labelLines.length - 1) * 4;
    const reasonHeight =
      reasonLines.length * 9 + Math.max(0, reasonLines.length - 1) * 4;
    const blockHeight = 12 + labelHeight + (reasonLines.length ? 6 + reasonHeight : 0) + 12;
    const gapAfter = index === failedItems.length - 1 ? SECTION_GAP : BLOCK_GAP;

    ensureSpace(ctx, blockHeight + gapAfter);
    const topY = ctx.y;
    drawFilledBox(
      ctx,
      MARGIN_LEFT,
      topY,
      CONTENT_WIDTH,
      blockHeight,
      COLORS.failedBg,
      COLORS.failed,
    );

    drawWrappedLines(ctx, labelLines, topY - 12, {
      x: MARGIN_LEFT + 12,
      size: 10,
      bold: true,
      color: COLORS.failed,
    });

    if (reasonLines.length) {
      drawWrappedLines(ctx, reasonLines, topY - 12 - labelHeight - 6, {
        x: MARGIN_LEFT + 12,
        size: 9,
        color: COLORS.text,
        lineGap: 4,
      });
    }

    ctx.y = topY - blockHeight - gapAfter;
  });
}

function drawHeader(
  ctx: PdfContext,
  options: ShiftChecklistPdfOptions,
  labels: PdfLabels,
) {
  const titleBlock = measureWrappedText(labels.title, ctx.fontBold, 20, CONTENT_WIDTH);
  const venueBlock = measureWrappedText(
    options.venueLabel,
    ctx.fontBold,
    13,
    CONTENT_WIDTH,
  );
  const meta = [
    `${labels.date}: ${options.date || "-"}`,
    `${labels.employee}: ${options.employee || "-"}`,
    `${labels.shift}: ${options.shiftLabel}`,
    `${labels.cleaning}: ${options.cleaningLabel}`,
  ];
  const metaLineHeight = 14;
  const metaHeight = meta.length * metaLineHeight + 16;
  const headerHeight =
    8 + titleBlock.height + 8 + venueBlock.height + 10 + metaHeight + SECTION_GAP;

  ensureSpace(ctx, headerHeight);
  const headerTop = ctx.y;

  drawFilledBox(ctx, MARGIN_LEFT, headerTop, CONTENT_WIDTH, 4, COLORS.gold, COLORS.gold);

  let topY = headerTop - 12;
  drawWrappedLines(ctx, titleBlock.lines, topY, { size: 20, bold: true });
  topY -= titleBlock.height + 8;

  drawWrappedLines(ctx, venueBlock.lines, topY, {
    size: 13,
    bold: true,
    color: COLORS.muted,
  });
  topY -= venueBlock.height + 10;

  const metaTop = topY;
  drawFilledBox(ctx, MARGIN_LEFT, metaTop, CONTENT_WIDTH, metaHeight, COLORS.goldSoft);

  let metaBaseline = metaTop - 14;
  meta.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT + 12, metaBaseline, 10, ctx.font, COLORS.text);
    metaBaseline -= metaLineHeight;
  });

  ctx.y = headerTop - headerHeight;
}

export async function makeShiftChecklistPdfBlob(
  options: ShiftChecklistPdfOptions,
): Promise<Blob> {
  const { regular, bold } = await loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regular);
  const fontBold = await pdfDoc.embedFont(bold);
  const locale = options.locale ?? "en";
  const labels = getLabels(locale);
  const ctx = createPdfContext(pdfDoc, font, fontBold);

  const failedItems = options.sections.flatMap((section) =>
    section.items
      .filter((item) => item.status === "failed")
      .map((item) => ({
        label:
          item.penaltyPoints != null
            ? `${item.label} (${item.penaltyPoints} б.)`
            : item.label,
        comment: item.comment,
      })),
  );

  const penaltyTotal = options.sections.reduce(
    (sum, section) =>
      sum +
      section.items.reduce((itemSum, item) => {
        if (item.status !== "failed" || item.penaltyPoints == null) {
          return itemSum;
        }
        return itemSum + item.penaltyPoints;
      }, 0),
    0,
  );

  const completed = options.sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.status === "done").length,
    0,
  );
  const failed = failedItems.length;
  const total = options.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  drawHeader(ctx, options, labels);
  drawFailedSummary(ctx, failedItems, labels);

  drawWrappedBlock(ctx, labels.fullChecklist, 12, { bold: true, gapAfter: 12 });

  options.sections.forEach((section) => {
    drawSectionTitle(ctx, section.title);
    section.items.forEach((item) => drawChecklistItem(ctx, item, labels));
    ctx.y -= 4;
  });

  const summaryHeight = 24 + BLOCK_GAP;
  ensureSpace(ctx, summaryHeight);
  const summaryTop = ctx.y;
  drawFilledBox(ctx, MARGIN_LEFT, summaryTop, CONTENT_WIDTH, 24, COLORS.section);
  drawTextLine(
    ctx,
    labels.summary(completed, total, failed, penaltyTotal),
    MARGIN_LEFT + 10,
    summaryTop - 16,
    9.5,
    ctx.fontBold,
    COLORS.text,
  );

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export async function exportShiftChecklistPdf(
  options: ShiftChecklistPdfOptions,
): Promise<DeliverPdfResult> {
  const blob = await makeShiftChecklistPdfBlob(options);
  const fileName = buildPdfFileName(options.venueLabel, options.date);
  return deliverPdfFile(blob, fileName);
}
