import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage, type PDFFont, rgb } from "pdf-lib";
import { getAssetUrl } from "@/lib/appVersion";

type ChecklistPdfItem = {
  label: string;
  status: "none" | "done" | "failed";
  comment?: string;
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
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

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
  summary: (done: number, total: number, failed: number) => string;
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
      summary: (done, total, failed) =>
        `Выполнено: ${done} из ${total}   Не выполнено: ${failed}`,
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
    summary: (done, total, failed) =>
      `Done: ${done} / ${total}   Not done: ${failed}`,
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

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function presentPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);

  if (isAndroidDevice()) {
    window.location.assign(url);
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function downloadPdfOnDesktop(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
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
    y: PAGE_HEIGHT - 44,
    font,
    fontBold,
  };
}

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - 44;
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
  const bottomY = topY - height;
  ctx.page.drawRectangle({
    x,
    y: bottomY,
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
  y: number,
  size: number,
  activeFont: PDFFont,
  color = COLORS.text,
) {
  ctx.page.drawText(text, {
    x,
    y,
    size,
    font: activeFont,
    color,
  });
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
  } = {},
): number {
  const x = options.x ?? MARGIN_LEFT;
  const maxWidth = options.maxWidth ?? CONTENT_WIDTH;
  const activeFont = options.bold ? ctx.fontBold : ctx.font;
  const color = options.color ?? COLORS.text;
  const lineGap = options.lineGap ?? 4;
  const lines = wrapText(text, activeFont, size, maxWidth);
  const blockHeight = lines.length * (size + lineGap);

  ensureSpace(ctx, blockHeight);
  lines.forEach((line) => {
    drawTextLine(ctx, line, x, ctx.y, size, activeFont, color);
    ctx.y -= size + lineGap;
  });

  return blockHeight;
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  const size = 11;
  const height = 24;
  ensureSpace(ctx, height + 10);
  drawFilledBox(ctx, MARGIN_LEFT, ctx.y + 4, CONTENT_WIDTH, height, COLORS.section);
  drawTextLine(
    ctx,
    title.toUpperCase(),
    MARGIN_LEFT + 10,
    ctx.y - 14,
    size,
    ctx.fontBold,
    COLORS.text,
  );
  ctx.y -= height + 8;
}

function drawStatusBadge(
  ctx: PdfContext,
  status: ChecklistPdfItem["status"],
  labels: PdfLabels,
  anchorY: number,
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
  const padY = 4;
  const badgeWidth = textWidth + padX * 2;
  const badgeHeight = size + padY * 2;
  const x = PAGE_WIDTH - MARGIN_RIGHT - badgeWidth;
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

  drawFilledBox(ctx, x, anchorY + 2, badgeWidth, badgeHeight, fill, border);
  drawTextLine(ctx, text, x + padX, anchorY - badgeHeight + padY + 1, size, activeFont, color);
}

function drawChecklistItem(
  ctx: PdfContext,
  item: ChecklistPdfItem,
  labels: PdfLabels,
) {
  const labelSize = 10;
  const labelX = MARGIN_LEFT + 12;
  const badgeReserve = 92;
  const labelWidth = CONTENT_WIDTH - 24 - badgeReserve;
  const lines = wrapText(item.label, ctx.font, labelSize, labelWidth);
  const rowHeight = Math.max(lines.length * (labelSize + 4) + 18, 30);

  ensureSpace(ctx, rowHeight + 6);
  const rowTop = ctx.y + 2;
  const fill =
    item.status === "done"
      ? COLORS.doneBg
      : item.status === "failed"
        ? COLORS.failedBg
        : COLORS.white;

  drawFilledBox(ctx, MARGIN_LEFT, rowTop, CONTENT_WIDTH, rowHeight, fill);
  drawStatusBadge(ctx, item.status, labels, rowTop);

  let lineY = rowTop - 14;
  lines.forEach((line) => {
    drawTextLine(ctx, line, labelX, lineY, labelSize, ctx.font, COLORS.text);
    lineY -= labelSize + 4;
  });

  ctx.y -= rowHeight + 6;
}

function drawFailedSummary(
  ctx: PdfContext,
  failedItems: Array<{ label: string; comment?: string }>,
  labels: PdfLabels,
) {
  drawWrappedBlock(ctx, labels.failedTitle, 12, { bold: true });
  ctx.y -= 4;

  if (!failedItems.length) {
    drawWrappedBlock(ctx, labels.noFailed, 10, { color: COLORS.muted });
    ctx.y -= 8;
    return;
  }

  failedItems.forEach((item) => {
    const reason = item.comment?.trim();
    const reasonLines = reason
      ? wrapText(
          `${labels.reason}: ${reason}`,
          ctx.font,
          9,
          CONTENT_WIDTH - 28,
        )
      : [];
    const blockHeight = 28 + reasonLines.length * 13;

    ensureSpace(ctx, blockHeight + 8);
    const boxTop = ctx.y + 2;
    drawFilledBox(
      ctx,
      MARGIN_LEFT,
      boxTop,
      CONTENT_WIDTH,
      blockHeight,
      COLORS.failedBg,
      COLORS.failed,
    );

    drawTextLine(
      ctx,
      item.label,
      MARGIN_LEFT + 12,
      boxTop - 16,
      10,
      ctx.fontBold,
      COLORS.failed,
    );

    let reasonY = boxTop - 30;
    reasonLines.forEach((line) => {
      drawTextLine(ctx, line, MARGIN_LEFT + 12, reasonY, 9, ctx.font, COLORS.text);
      reasonY -= 13;
    });

    ctx.y -= blockHeight + 8;
  });
}

function drawHeader(ctx: PdfContext, options: ShiftChecklistPdfOptions, labels: PdfLabels) {
  drawFilledBox(ctx, MARGIN_LEFT, ctx.y + 8, CONTENT_WIDTH, 4, COLORS.gold, COLORS.gold);
  ctx.y -= 10;

  drawWrappedBlock(ctx, labels.title, 20, { bold: true });
  drawWrappedBlock(ctx, options.venueLabel, 13, { bold: true, color: COLORS.muted });
  ctx.y -= 6;

  const meta = [
    `${labels.date}: ${options.date || "-"}`,
    `${labels.employee}: ${options.employee || "-"}`,
    `${labels.shift}: ${options.shiftLabel}`,
    `${labels.cleaning}: ${options.cleaningLabel}`,
  ];

  drawFilledBox(ctx, MARGIN_LEFT, ctx.y + 2, CONTENT_WIDTH, 54, COLORS.goldSoft);
  let metaY = ctx.y - 16;
  meta.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT + 12, metaY, 10, ctx.font, COLORS.text);
    metaY -= 14;
  });
  ctx.y -= 64;
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
        label: item.label,
        comment: item.comment,
      })),
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

  drawWrappedBlock(ctx, labels.fullChecklist, 12, { bold: true });
  ctx.y -= 4;

  options.sections.forEach((section) => {
    drawSectionTitle(ctx, section.title);
    section.items.forEach((item) => drawChecklistItem(ctx, item, labels));
    ctx.y -= 4;
  });

  ensureSpace(ctx, 28);
  drawFilledBox(ctx, MARGIN_LEFT, ctx.y + 2, CONTENT_WIDTH, 24, COLORS.section);
  drawTextLine(
    ctx,
    labels.summary(completed, total, failed),
    MARGIN_LEFT + 10,
    ctx.y - 16,
    9.5,
    ctx.fontBold,
    COLORS.text,
  );

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export async function exportShiftChecklistPdf(
  options: ShiftChecklistPdfOptions,
): Promise<void> {
  const blob = await makeShiftChecklistPdfBlob(options);
  const fileName = buildPdfFileName(options.venueLabel, options.date);

  if (isMobileDevice()) {
    presentPdfBlob(blob);
    return;
  }

  downloadPdfOnDesktop(blob, fileName);
}
