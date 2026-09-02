import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFPage, type PDFFont, rgb } from "pdf-lib";
import type { StaffTestOptionKey } from "@/data/staffTestTypes";
import type { StaffTestQuestion } from "@/data/staffTestTypes";
import { getAssetUrl } from "@/lib/appVersion";

export type StaffTestPdfAnswer = {
  question: StaffTestQuestion;
  selected: StaffTestOptionKey | "";
};

export type StaffTestPdfOptions = {
  testTitleRu: string;
  testTitleVn: string;
  testSubtitleRu: string;
  testSubtitleVn: string;
  passingScore: number;
  totalQuestions: number;
  date: string;
  employee: string;
  position: string;
  score: number;
  answers: StaffTestPdfAnswer[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BLOCK_GAP = 10;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.42, 0.42, 0.42),
  gold: rgb(0.95, 0.68, 0),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  pass: rgb(0.1, 0.52, 0.24),
  fail: rgb(0.75, 0.08, 0.08),
  white: rgb(1, 1, 1),
};

type PdfContext = {
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  pdfDoc: PDFDocument;
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
        if (!response.ok) throw new Error("Failed to load NotoSans-Regular.ttf");
        return response.arrayBuffer();
      }),
      fetch(getAssetUrl("/fonts/NotoSans-Bold.ttf")).then((response) => {
        if (!response.ok) throw new Error("Failed to load NotoSans-Bold.ttf");
        return response.arrayBuffer();
      }),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontBytesPromise;
}

export function preloadStaffTestPdfFonts(): void {
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
) {
  ctx.page.drawRectangle({
    x,
    y: topY - height,
    width,
    height,
    color: fill,
    borderColor: COLORS.line,
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
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    gapAfter?: number;
  } = {},
): number {
  const activeFont = options.bold ? ctx.fontBold : ctx.font;
  const { lines, height } = measureWrappedText(text, activeFont, size, CONTENT_WIDTH);
  const gapAfter = options.gapAfter ?? BLOCK_GAP;

  ensureSpace(ctx, height + gapAfter);
  const topY = ctx.y;
  drawWrappedLines(ctx, lines, topY, { ...options, size });
  ctx.y = topY - height - gapAfter;
  return height + gapAfter;
}

function drawHeader(ctx: PdfContext, options: StaffTestPdfOptions) {
  const passed = options.score >= options.passingScore;
  const titleLines = [options.testTitleRu, options.testTitleVn];
  const subtitleLines = [options.testSubtitleRu, options.testSubtitleVn];
  const meta = [
    `Date / Ngày: ${options.date || "-"}`,
    `Name / Họ tên: ${options.employee || "-"}`,
    `Position / Vị trí: ${options.position || "-"}`,
    `Result / Kết quả: ${options.score}/${options.totalQuestions} — ${
      passed ? "PASSED / ĐẠT" : "NOT PASSED / CHƯA ĐẠT"
    }`,
  ];

  const titleHeight = titleLines.length * 18 + 8;
  const subtitleHeight = subtitleLines.length * 13 + 6;
  const metaHeight = meta.length * 14 + 16;
  const headerHeight = 8 + titleHeight + subtitleHeight + metaHeight + 20;

  ensureSpace(ctx, headerHeight);
  const headerTop = ctx.y;

  drawFilledBox(ctx, MARGIN_LEFT, headerTop, CONTENT_WIDTH, 4, COLORS.gold);

  let topY = headerTop - 14;
  titleLines.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT, topY, 14, ctx.fontBold, COLORS.text);
    topY -= 18;
  });

  subtitleLines.forEach((line) => {
    drawTextLine(ctx, line, MARGIN_LEFT, topY, 10, ctx.font, COLORS.muted);
    topY -= 13;
  });

  const metaTop = topY - 6;
  drawFilledBox(ctx, MARGIN_LEFT, metaTop, CONTENT_WIDTH, metaHeight, COLORS.goldSoft);

  let metaBaseline = metaTop - 14;
  meta.forEach((line) => {
    const color =
      line.includes("PASSED") || line.includes("ĐẠT")
        ? COLORS.pass
        : line.includes("NOT PASSED") || line.includes("CHƯA ĐẠT")
          ? COLORS.fail
          : COLORS.text;
    drawTextLine(ctx, line, MARGIN_LEFT + 12, metaBaseline, 10, ctx.font, color);
    metaBaseline -= 14;
  });

  ctx.y = headerTop - headerHeight;
}

function formatAnswerText(
  question: StaffTestQuestion,
  selected: StaffTestOptionKey | "",
): string {
  if (!selected) return "— / —";
  const option = question.options.find((item) => item.key === selected);
  if (!option) return selected;
  return `${selected}. ${option.textRu} / ${option.textVn}`;
}

function drawQuestion(ctx: PdfContext, answer: StaffTestPdfAnswer) {
  const { question, selected } = answer;
  const prompt = `${question.number}. ${question.promptRu} / ${question.promptVn}`;
  const answerLine = `Answer / Đáp án: ${formatAnswerText(question, selected)}`;

  const promptBlock = measureWrappedText(prompt, ctx.fontBold, 9.5, CONTENT_WIDTH);
  const answerBlock = measureWrappedText(answerLine, ctx.font, 9, CONTENT_WIDTH);
  const blockHeight = promptBlock.height + answerBlock.height + 18;

  ensureSpace(ctx, blockHeight);
  const topY = ctx.y;

  drawFilledBox(ctx, MARGIN_LEFT, topY, CONTENT_WIDTH, blockHeight - 6, COLORS.white);
  let baseline = topY - 12;
  drawWrappedLines(ctx, promptBlock.lines, baseline, { size: 9.5, bold: true });
  baseline -= promptBlock.height + 6;
  drawWrappedLines(ctx, answerBlock.lines, baseline, {
    size: 9,
    color: COLORS.muted,
  });

  ctx.y = topY - blockHeight;
}

export function getStaffTestPdfFileName(
  pdfSlug: string,
  date: string,
  employee: string,
): string {
  const safeName = employee.trim().replace(/\s+/g, "_") || "staff";
  return `GASTROFOOD_StaffTest_${pdfSlug}_${safeName}_${date || "test"}.pdf`;
}

export async function makeStaffTestPdfBlob(
  options: StaffTestPdfOptions,
): Promise<Blob> {
  const { regular, bold } = await loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regular);
  const fontBold = await pdfDoc.embedFont(bold);
  const ctx = createPdfContext(pdfDoc, font, fontBold);

  drawHeader(ctx, options);

  drawWrappedBlock(
    ctx,
    "Instruction / Hướng dẫn: one correct answer A, B, C or D was selected per question. / Mỗi câu chọn một đáp án đúng A, B, C hoặc D.",
    8.5,
    { color: COLORS.muted, gapAfter: 14 },
  );

  options.answers.forEach((answer) => drawQuestion(ctx, answer));

  drawWrappedBlock(
    ctx,
    `Passing score / Điểm đạt: ${options.passingScore}/${options.totalQuestions} (${Math.round((options.passingScore / options.totalQuestions) * 100)}%).`,
    9,
    { gapAfter: 8 },
  );
  drawWrappedBlock(
    ctx,
    "Employee signature / Chữ ký nhân viên: ________________________________",
    9,
    { gapAfter: 6 },
  );
  drawWrappedBlock(
    ctx,
    "Manager review / Quản lý chấm: __________________________________",
    9,
    { gapAfter: 0 },
  );

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
