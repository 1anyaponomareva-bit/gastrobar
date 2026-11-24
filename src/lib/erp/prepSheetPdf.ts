import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getAssetUrl } from "@/lib/appVersion";
import { erpLang, type ErpLang } from "@/components/erp/i18n";
import { formatVnd } from "./costing";
import type { ErpUnit } from "./costing";
import { formatVietnamDate } from "@/lib/orders/datetime";
import {
  lineNetQty,
  METHOD_LABEL,
  prepKindTitle,
  type PrepPublishInput,
  type PrepPublishLine,
  type PrepPublishProduct,
} from "./prepStaffRecipe";
import { pickContentText } from "./contentLang";
import { stepItemsMap, stepTitleMap, type RecipeStepDraft } from "./recipeCard";
import { formatStorageOptionLine, parseStorageOptions } from "./storageOptions";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 40;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const FONT_SIZE = 9;
const TITLE_SIZE = 16;
const LINE_GAP = 3;
const ROW_PAD_Y = 7;
const STEP_TITLE_SIZE = 12;
const STEP_BODY_SIZE = 10;
const TITLE_PHOTO_GAP = 10;
const PHOTO_TEXT_GAP = 12;
const ITEM_BLOCK_GAP = 9;
const PHOTO_BOX_W = 210;
const PHOTO_BOX_H = 128;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.38, 0.38, 0.38),
  gold: rgb(0.83, 0.66, 0.22),
  goldBar: rgb(0.95, 0.68, 0),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
  white: rgb(1, 1, 1),
  zebra: rgb(0.99, 0.98, 0.96),
};

const COLS = {
  name: 250,
  qty: 62,
  unit: 48,
  note: CONTENT_WIDTH - 250 - 62 - 48,
};

export type PrepSheetLang = "en" | "vn";

export type PrepSheetCopy = {
  composition: string;
  ingredient: string;
  qty: string;
  unit: string;
  note: string;
  cooking: string;
  yield: string;
  cost: string;
  cardNo: string;
  date: string;
  rev: string;
  shelfLife: string;
  days: string;
  step: string;
  piece: string;
  pcs: string;
  g: string;
  kg: string;
  ml: string;
  l: string;
};

const COPY: Record<PrepSheetLang, PrepSheetCopy> = {
  en: {
    composition: "Composition",
    ingredient: "Ingredient",
    qty: "Qty",
    unit: "Unit",
    note: "Note",
    cooking: "Cooking technology",
    yield: "Yield",
    cost: "Cost",
    cardNo: "Card No.",
    date: "Date",
    rev: "Rev.",
    shelfLife: "Shelf life",
    days: "days",
    step: "Step",
    piece: "1 pc",
    pcs: "pcs",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
  },
  vn: {
    composition: "Thành phần",
    ingredient: "Nguyên liệu",
    qty: "SL",
    unit: "ĐVT",
    note: "Ghi chú",
    cooking: "Quy trình chế biến",
    yield: "Khối lượng thành phẩm",
    cost: "Giá vốn",
    cardNo: "Số thẻ",
    date: "Ngày",
    rev: "Sửa đổi",
    shelfLife: "Hạn dùng",
    days: "ngày",
    step: "Bước",
    piece: "1 cái",
    pcs: "cái",
    g: "g",
    kg: "kg",
    ml: "ml",
    l: "l",
  },
};

/** VN UI → Vietnamese sheet; English and Russian UI → English sheet. */
export function prepSheetLang(ui: ErpLang = erpLang()): PrepSheetLang {
  return ui === "vn" ? "vn" : "en";
}

export function prepSheetCopy(lang: PrepSheetLang = prepSheetLang()): PrepSheetCopy {
  return COPY[lang];
}

export function pickSheetText(en: string, vn: string, lang: PrepSheetLang): string {
  const primary = (lang === "vn" ? vn : en).trim();
  const fallback = (lang === "vn" ? en : vn).trim();
  return primary || fallback;
}

/** Never drawn on the tech-card. Page 1 must not print this brand lockup. */
export const PREP_SHEET_BRAND_LOCKUP = "GASTROFOOD";

export type PrepSheetStepLine =
  | { kind: "step"; n: string; text: string }
  | { kind: "sub"; text: string }
  | { kind: "text"; text: string };

export type PrepSheetTrace = {
  texts: { page: number; text: string; x: number; y: number; size: number }[];
  images: { page: number; x: number; y: number; width: number; height: number }[];
};

/** Numbered instructions stay numbered; leading dashes become nested bullets. */
export function parsePrepSheetStepItems(items: string[]): PrepSheetStepLine[] {
  const cleaned = items.map((item) => item.replace(/^[•●]\s+/, "").trim()).filter(Boolean);
  const numbered = cleaned.filter((item) => /^\d+[.)]\s+\S/.test(item)).length;
  const auto = numbered === 0;
  const lines: PrepSheetStepLine[] = [];
  let n = 0;
  for (const item of cleaned) {
    const asNumber = item.match(/^(\d+)[.)]\s+(.*)$/);
    if (asNumber) {
      lines.push({ kind: "step", n: asNumber[1], text: asNumber[2].trim() });
      continue;
    }
    const asSub = item.match(/^[-–—]\s+(.*)$/);
    if (asSub) {
      lines.push({ kind: "sub", text: asSub[1].trim() });
      continue;
    }
    if (auto) {
      n += 1;
      lines.push({ kind: "step", n: String(n), text: item });
    } else {
      lines.push({ kind: "text", text: item });
    }
  }
  return lines;
}

type SheetRow = { name: string; qty: string; unit: string; note: string; main: boolean };

export type PrepSheetModel = {
  lang: PrepSheetLang;
  copy: PrepSheetCopy;
  kind: string;
  name: string;
  cardNo: string;
  date: string;
  revision: string;
  facts: string[];
  rows: SheetRow[];
  yieldLine: string;
  costLine: string;
  steps: { title: string; items: string[]; photo: string }[];
};

function trimNum(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function qtyAndUnit(
  value: number | null | undefined,
  unit: ErpUnit | null,
  copy: PrepSheetCopy,
): { qty: string; unit: string } {
  if (value == null) return { qty: "—", unit: "" };
  if ((unit === "kg" || unit === "l") && value !== 0 && Math.abs(value) < 1) {
    return { qty: trimNum(value * 1000), unit: unit === "kg" ? copy.g : copy.ml };
  }
  if (unit === "kg") return { qty: trimNum(value), unit: copy.kg };
  if (unit === "l") return { qty: trimNum(value), unit: copy.l };
  if (unit === "pcs") return { qty: trimNum(value), unit: copy.pcs };
  return { qty: trimNum(value), unit: copy.g };
}

function catalogOf(input: PrepPublishInput, id: string | null): PrepPublishProduct | undefined {
  return id ? input.catalog.find((row) => row.id === id) : undefined;
}

function lineTitle(
  line: PrepPublishLine,
  product: PrepPublishProduct | undefined,
  lang: PrepSheetLang,
  uiLang: ErpLang,
): string {
  const en = (product?.name_en || line.raw_name?.en || line.raw_name?.ru || "").trim();
  const vn = (product?.name_vn || line.raw_name?.vn || "").trim();
  return pickContentText({ ...(product?.names ?? {}), en, vn }, uiLang) || pickSheetText(en, vn, lang) || "—";
}

function cutsText(line: PrepPublishLine, copy: PrepSheetCopy): string {
  const parts = (line.parts ?? []).filter((part) => part.name.trim() && part.grams != null);
  return parts.map((part) => `${part.name.trim()} ${Math.round((part.grams ?? 0) * 10) / 10} ${copy.g}`).join("; ");
}

function lineNote(line: PrepPublishLine, lang: PrepSheetLang, copy: PrepSheetCopy): string {
  const methods = (line.methods ?? []).map((method) => METHOD_LABEL[method][lang]).filter(Boolean).join(", ");
  const cuts = cutsText(line, copy);
  return [methods, cuts].filter(Boolean).join(" · ");
}

function stepBlock(
  step: RecipeStepDraft,
  lang: PrepSheetLang,
  uiLang: ErpLang,
  index: number,
  copy: PrepSheetCopy,
): {
  title: string;
  items: string[];
  photo: string;
} {
  const title = pickContentText(stepTitleMap(step), uiLang) || pickSheetText(step.titleEn, step.titleVn, lang);
  const itemMaps = stepItemsMap(step);
  const lines = Object.fromEntries(
    Object.entries(itemMaps).map(([code, text]) => [code, text.split(/\r?\n/).map((line) => line.trim())]),
  );
  const count = Math.max(0, ...Object.values(lines).map((row) => row.length));
  const items: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const map: Record<string, string> = {};
    for (const [code, row] of Object.entries(lines)) map[code] = row[i] ?? "";
    const line = pickContentText(map, uiLang) || pickSheetText(map.en ?? "", map.vn ?? "", lang);
    if (line) items.push(line);
  }
  return { title: title || `${copy.step} ${index + 1}`, items, photo: step.photo.trim() };
}

/** All labels, names and step lines that will be drawn — used by tests and the painter. */
export function buildPrepSheetModel(input: PrepPublishInput, uiLang: ErpLang = erpLang()): PrepSheetModel {
  const lang = prepSheetLang(uiLang);
  const copy = prepSheetCopy(lang);
  const date = formatVietnamDate(input.cardDate) || input.cardDate.trim() || "—";
  const name =
    pickContentText(
      { ...(input.product.names ?? {}), en: input.product.name_en, vn: input.product.name_vn ?? "" },
      uiLang,
    ) ||
    pickSheetText(input.product.name_en, input.product.name_vn ?? "", lang) ||
    "—";
  const facts: string[] = [];
  if (input.product.unit_weight_kg && input.product.unit_weight_kg > 0) {
    const piece = qtyAndUnit(input.product.unit_weight_kg, "kg", copy);
    facts.push(`${copy.piece}: ${piece.qty} ${piece.unit}`.trim());
  }
  const storageOptions = parseStorageOptions(input.storageConditions, input.shelfLifeDays).filter(
    (row) => row.conditions.trim() || (row.days != null && row.days > 0),
  );
  for (const row of storageOptions) {
    const line = formatStorageOptionLine(row, copy.days);
    if (line) facts.push(`${copy.shelfLife}: ${line}`);
  }

  const rows = input.lines.flatMap((line) => {
    const product = catalogOf(input, line.product_id);
    if (line.qty == null && !line.raw_name && !line.product_id) return [];
    const unit = product?.base_unit ?? null;
    const net = lineNetQty(line, product);
    const amount = qtyAndUnit(net, unit, copy);
    return [
      {
        name: lineTitle(line, product, lang, uiLang),
        qty: amount.qty,
        unit: amount.unit,
        note: lineNote(line, lang, copy),
        main: Boolean(line.is_main),
      },
    ];
  });

  const yieldAmount = qtyAndUnit(input.yieldQty, input.product.base_unit, copy);
  const yieldExtra =
    input.yieldPieces && input.product.base_unit !== "pcs" ? ` · ${input.yieldPieces} ${copy.pcs}` : "";
  const yieldLine = `${copy.yield}: ${yieldAmount.qty} ${yieldAmount.unit}${yieldExtra}`.replace(/\s+/g, " ").trim();

  return {
    lang,
    copy,
    kind: prepKindTitle(input.kind)[lang],
    name,
    cardNo: input.cardNo.trim() || "—",
    date,
    revision: (input.cardRevision ?? (input.version ? String(input.version).padStart(2, "0") : "01")).trim() || "01",
    facts,
    rows,
    yieldLine,
    costLine: `${copy.cost}: ${formatVnd(input.batchCost ?? null)}`,
    steps: input.steps
      .map((step, index) => stepBlock(step, lang, uiLang, index, copy))
      .filter((step) => step.title || step.items.length),
  };
}

type Fonts = { regular: ArrayBuffer; bold: ArrayBuffer };

let injectedFonts: Fonts | null = null;
let fontBytesPromise: Promise<Fonts> | null = null;

export function setPrepSheetPdfFonts(fonts: Fonts | null): void {
  injectedFonts = fonts;
  fontBytesPromise = fonts ? Promise.resolve(fonts) : null;
}

async function loadFontBytes(): Promise<Fonts> {
  if (injectedFonts) return injectedFonts;
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

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const pushLong = (token: string) => {
    let rest = token;
    while (rest) {
      let take = rest.length;
      while (take > 1 && font.widthOfTextAtSize(rest.slice(0, take), size) > maxWidth) take -= 1;
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
  };
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) current = word;
    else {
      pushLong(word);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type StepGroup = {
  lead: PrepSheetStepLine;
  extras: Extract<PrepSheetStepLine, { kind: "sub" }>[];
};

type DrawState = {
  doc: PDFDocument;
  page: PDFPage;
  pageIndex: number;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  model: PrepSheetModel;
  trace?: PrepSheetTrace;
};

function groupStepLines(lines: PrepSheetStepLine[]): StepGroup[] {
  const groups: StepGroup[] = [];
  for (const line of lines) {
    if (line.kind === "sub") {
      if (groups.length) groups[groups.length - 1].extras.push(line);
      else groups.push({ lead: { kind: "text", text: line.text }, extras: [] });
      continue;
    }
    groups.push({ lead: line, extras: [] });
  }
  return groups;
}

function linesHeight(count: number, size: number, gap = LINE_GAP): number {
  if (count <= 0) return 0;
  return count * size + Math.max(0, count - 1) * gap;
}

function newPage(state: DrawState): void {
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.pageIndex += 1;
  drawRunningHeader(state);
}

function ensure(state: DrawState, height: number): void {
  if (state.y - height < MARGIN_BOTTOM) newPage(state);
}

function baselineFor(topY: number, size: number, pad = ROW_PAD_Y): number {
  return topY - pad - size;
}

function drawTextLine(
  state: DrawState,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
): void {
  if (!value) return;
  const size = opts.size ?? FONT_SIZE;
  state.page.drawText(value, {
    x,
    y,
    size,
    font: opts.bold ? state.bold : state.font,
    color: opts.color ?? COLORS.text,
  });
  state.trace?.texts.push({ page: state.pageIndex, text: value, x, y, size });
}

function wrappedHeight(lines: number, size = FONT_SIZE): number {
  return ROW_PAD_Y * 2 + lines * size + Math.max(0, lines - 1) * LINE_GAP;
}

function drawWrapped(
  state: DrawState,
  lines: string[],
  x: number,
  topY: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
): void {
  const size = opts.size ?? FONT_SIZE;
  let y = baselineFor(topY, size);
  for (const line of lines) {
    drawTextLine(state, line, x, y, opts);
    y -= size + LINE_GAP;
  }
}

function drawLinesFromTop(
  state: DrawState,
  lines: string[],
  x: number,
  topY: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
): number {
  const size = opts.size ?? FONT_SIZE;
  let baseline = topY - size;
  for (const line of lines) {
    drawTextLine(state, line, x, baseline, opts);
    baseline -= size + LINE_GAP;
  }
  return linesHeight(lines.length, size);
}

function section(state: DrawState, title: string): void {
  const height = 22;
  ensure(state, height + 10);
  const top = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: COLORS.section,
  });
  drawTextLine(state, title, MARGIN_X + 10, baselineFor(top, 10, 6), { size: 10, bold: true });
  state.y = top - height - 8;
}

function decodeDataImage(url: string): Uint8Array | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function embedPhoto(doc: PDFDocument, url: string | undefined): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    let bytes: Uint8Array;
    if (url.startsWith("data:image/")) {
      const decoded = decodeDataImage(url);
      if (!decoded) return null;
      bytes = decoded;
    } else {
      const response = await fetch(url);
      if (!response.ok) return null;
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes);
  } catch {
    return null;
  }
  return null;
}

function fitPhoto(image: PDFImage, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  return { w: image.width * scale, h: image.height * scale };
}

function drawRunningHeader(state: DrawState): void {
  const top = PAGE_HEIGHT - 16;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_HEIGHT - 8,
    width: CONTENT_WIDTH,
    height: 3,
    color: COLORS.goldBar,
  });
  const line = `${state.model.name}  ·  ${state.model.copy.cardNo} ${state.model.cardNo}  ·  ${state.model.copy.date} ${state.model.date}`;
  const clipped = wrapText(line, state.font, 8, CONTENT_WIDTH);
  drawTextLine(state, clipped[0] ?? line, MARGIN_X, top - 14, { size: 8, color: COLORS.muted });
  state.page.drawLine({
    start: { x: MARGIN_X, y: top - 22 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: top - 22 },
    thickness: 0.4,
    color: COLORS.line,
  });
  state.y = top - 34;
}

function drawPageOneHeader(state: DrawState): void {
  const model = state.model;
  const copy = model.copy;
  const nameLines = wrapText(model.name, state.bold, TITLE_SIZE, CONTENT_WIDTH);
  const meta = [
    `${copy.cardNo} ${model.cardNo}`,
    `${copy.date} ${model.date}`,
    `${copy.rev} ${model.revision}`,
  ];
  const metaH = 30;
  const headerH = 6 + nameLines.length * (TITLE_SIZE + 3) + 12 + metaH + 10;
  ensure(state, headerH);
  const top = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - 3,
    width: CONTENT_WIDTH,
    height: 3,
    color: COLORS.goldBar,
  });
  let y = top - 12;
  const nameH = drawLinesFromTop(state, nameLines, MARGIN_X, y, { size: TITLE_SIZE, bold: true });
  y -= nameH + 10;
  const cellW = CONTENT_WIDTH / 3;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: y - metaH,
    width: CONTENT_WIDTH,
    height: metaH,
    color: COLORS.goldSoft,
    borderColor: COLORS.line,
    borderWidth: 0.6,
  });
  meta.forEach((label, index) => {
    const x = MARGIN_X + cellW * index;
    if (index > 0) {
      state.page.drawLine({
        start: { x, y: y - 6 },
        end: { x, y: y - metaH + 6 },
        thickness: 0.5,
        color: COLORS.line,
      });
    }
    drawTextLine(state, label, x + 10, y - 19, { size: 9, color: COLORS.muted });
  });
  state.y = y - metaH - 12;
}

function stampFooters(state: DrawState): void {
  const pages = state.doc.getPages();
  const total = pages.length;
  const savedPage = state.page;
  const savedIndex = state.pageIndex;
  pages.forEach((page, index) => {
    state.page = page;
    state.pageIndex = index + 1;
    page.drawLine({
      start: { x: MARGIN_X, y: 34 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 34 },
      thickness: 0.5,
      color: COLORS.line,
    });
    const left = `${state.model.name}  ·  ${state.model.copy.cardNo} ${state.model.cardNo}`;
    const right = `${index + 1} / ${total}`;
    const leftLines = wrapText(left, state.font, 8, CONTENT_WIDTH - 56);
    drawTextLine(state, leftLines[0] ?? left, MARGIN_X, 20, { size: 8, color: COLORS.muted });
    const rightW = state.font.widthOfTextAtSize(right, 8);
    drawTextLine(state, right, PAGE_WIDTH - MARGIN_X - rightW, 20, { size: 8, color: COLORS.muted });
  });
  state.page = savedPage;
  state.pageIndex = savedIndex;
}

function stepLabelWidth(state: DrawState, n: string, size: number): number {
  return Math.max(state.bold.widthOfTextAtSize("00.", size), state.bold.widthOfTextAtSize(`${n}.`, size)) + 6;
}

function groupInnerWidth(width: number, labelW: number, extra = 0): number {
  return Math.max(40, width - 10 - labelW - extra);
}

function measureGroup(state: DrawState, group: StepGroup, width: number): number {
  const size = STEP_BODY_SIZE;
  const labelW = group.lead.kind === "step" ? stepLabelWidth(state, group.lead.n, size) : 0;
  const leadLines = wrapText(group.lead.text, state.font, size, groupInnerWidth(width, labelW));
  let height = 5 + linesHeight(leadLines.length, size);
  for (const extra of group.extras) {
    const subLines = wrapText(extra.text, state.font, size, groupInnerWidth(width, labelW, 16));
    height += 5 + linesHeight(subLines.length, size);
  }
  return height + 4;
}

function drawGroup(state: DrawState, group: StepGroup, x: number, topY: number, width: number): number {
  const size = STEP_BODY_SIZE;
  const height = measureGroup(state, group, width);
  state.page.drawRectangle({
    x,
    y: topY - height,
    width: 2.2,
    height,
    color: COLORS.goldBar,
  });
  const textX = x + 8;
  const labelW = group.lead.kind === "step" ? stepLabelWidth(state, group.lead.n, size) : 0;
  if (group.lead.kind === "step") {
    drawTextLine(state, `${group.lead.n}.`, textX, topY - 5 - size, { size, bold: true });
  }
  const leadLines = wrapText(group.lead.text, state.font, size, groupInnerWidth(width, labelW));
  let y = topY - 5;
  y -= drawLinesFromTop(state, leadLines, textX + labelW, y, { size });
  for (const extra of group.extras) {
    y -= 5;
    const bulletX = textX + labelW;
    drawTextLine(state, "–", bulletX, y - size, { size, color: COLORS.muted });
    const subLines = wrapText(extra.text, state.font, size, groupInnerWidth(width, labelW, 16));
    y -= drawLinesFromTop(state, subLines, bulletX + 12, y, { size, color: COLORS.muted });
  }
  return height;
}

function drawPhotoBox(state: DrawState, image: PDFImage, topY: number): { w: number; h: number } {
  const pad = 4;
  const fitted = fitPhoto(image, PHOTO_BOX_W - pad * 2, PHOTO_BOX_H - pad * 2);
  const boxW = fitted.w + pad * 2;
  const boxH = fitted.h + pad * 2;
  const boxBottom = topY - boxH;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: boxBottom,
    width: boxW,
    height: boxH,
    color: COLORS.white,
    borderColor: COLORS.line,
    borderWidth: 0.7,
  });
  const imgY = boxBottom + pad;
  state.page.drawImage(image, {
    x: MARGIN_X + pad,
    y: imgY,
    width: fitted.w,
    height: fitted.h,
  });
  state.trace?.images.push({
    page: state.pageIndex,
    x: MARGIN_X + pad,
    y: imgY,
    width: fitted.w,
    height: fitted.h,
  });
  return { w: boxW, h: boxH };
}

async function drawCookingStep(
  state: DrawState,
  step: PrepSheetModel["steps"][number],
  index: number,
): Promise<void> {
  const title = `${index + 1}.  ${step.title}`;
  const titleLines = wrapText(title, state.bold, STEP_TITLE_SIZE, CONTENT_WIDTH);
  const titleH = linesHeight(titleLines.length, STEP_TITLE_SIZE);
  const photo = await embedPhoto(state.doc, step.photo || undefined);
  const photoSize = photo ? fitPhoto(photo, PHOTO_BOX_W - 8, PHOTO_BOX_H - 8) : null;
  const photoBoxH = photoSize ? photoSize.h + 8 : 0;
  const photoBoxW = photoSize ? photoSize.w + 8 : 0;
  const minBlock = titleH + TITLE_PHOTO_GAP + (photo ? photoBoxH + 8 : STEP_BODY_SIZE + 8);
  ensure(state, minBlock);

  const titleTop = state.y;
  drawLinesFromTop(state, titleLines, MARGIN_X, titleTop, { size: STEP_TITLE_SIZE, bold: true });
  state.y = titleTop - titleH - 4;
  state.page.drawLine({
    start: { x: MARGIN_X, y: state.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: state.y },
    thickness: 0.4,
    color: COLORS.line,
  });
  state.y -= TITLE_PHOTO_GAP;

  let photoBottom = state.y;
  const photoPage = state.pageIndex;
  if (photo) {
    const box = drawPhotoBox(state, photo, state.y);
    photoBottom = state.y - box.h;
  }

  const groups = groupStepLines(parsePrepSheetStepItems(step.items));
  const sideX = MARGIN_X + photoBoxW + PHOTO_TEXT_GAP;
  const sideW = CONTENT_WIDTH - photoBoxW - PHOTO_TEXT_GAP;
  let y = state.y;
  let beside = Boolean(photo && sideW >= 200);

  const place = (groupH: number): { x: number; width: number; y: number } => {
    if (beside && y - groupH < photoBottom - 1) {
      beside = false;
      y = Math.min(y, photoBottom) - 10;
    }
    if (y - groupH < MARGIN_BOTTOM) {
      newPage(state);
      y = state.y;
      beside = false;
    }
    return beside ? { x: sideX, width: sideW, y } : { x: MARGIN_X, width: CONTENT_WIDTH, y };
  };

  for (const group of groups) {
    let width = beside ? sideW : CONTENT_WIDTH;
    let groupH = measureGroup(state, group, width);
    const spot = place(groupH);
    if (spot.width !== width) {
      width = spot.width;
      groupH = measureGroup(state, group, width);
    }
    if (spot.y - groupH < MARGIN_BOTTOM) {
      newPage(state);
      y = state.y;
      beside = false;
      width = CONTENT_WIDTH;
      groupH = measureGroup(state, group, width);
      drawGroup(state, group, MARGIN_X, y, width);
      y -= groupH + ITEM_BLOCK_GAP;
      continue;
    }
    drawGroup(state, group, spot.x, spot.y, width);
    y = spot.y - groupH - ITEM_BLOCK_GAP;
  }

  const belowPhoto = photo && state.pageIndex === photoPage ? Math.min(y, photoBottom) : y;
  state.y = belowPhoto - 12;
}

function drawTableHeader(state: DrawState, copy: PrepSheetCopy): void {
  const height = 22;
  ensure(state, height);
  const top = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: COLORS.goldSoft,
    borderColor: COLORS.line,
    borderWidth: 0.6,
  });
  const y = baselineFor(top, 8, 7);
  let x = MARGIN_X + 8;
  drawTextLine(state, copy.ingredient, x, y, { size: 8, bold: true });
  x += COLS.name;
  drawTextLine(state, copy.qty, x, y, { size: 8, bold: true });
  x += COLS.qty;
  drawTextLine(state, copy.unit, x, y, { size: 8, bold: true });
  x += COLS.unit;
  drawTextLine(state, copy.note, x, y, { size: 8, bold: true });
  state.y = top - height;
}

function drawTableRow(state: DrawState, row: SheetRow, zebra: boolean, copy: PrepSheetCopy): void {
  const nameLines = wrapText(row.name, row.main ? state.bold : state.font, FONT_SIZE, COLS.name - 12);
  const noteLines = wrapText(row.note || "—", state.font, 8, COLS.note - 10);
  const height = Math.max(wrappedHeight(nameLines.length), wrappedHeight(noteLines.length, 8), 24);
  if (state.y - height < MARGIN_BOTTOM) {
    newPage(state);
    drawTableHeader(state, copy);
  }
  const top = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: zebra ? COLORS.zebra : COLORS.white,
    borderColor: COLORS.line,
    borderWidth: 0.4,
  });
  let x = MARGIN_X + 8;
  drawWrapped(state, nameLines, x, top, { bold: row.main });
  x += COLS.name;
  drawTextLine(state, row.qty, x, baselineFor(top, FONT_SIZE), { size: FONT_SIZE, bold: true });
  x += COLS.qty;
  drawTextLine(state, row.unit, x, baselineFor(top, FONT_SIZE), { size: FONT_SIZE, color: COLORS.muted });
  x += COLS.unit;
  drawWrapped(state, noteLines, x, top, { size: 8, color: COLORS.muted });
  state.y = top - height;
}

export async function makePrepSheetPdf(
  input: PrepPublishInput,
  options?: { lang?: ErpLang; trace?: PrepSheetTrace },
): Promise<Blob> {
  const model = buildPrepSheetModel(input, options?.lang ?? erpLang());
  const { regular, bold } = await loadFontBytes();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const fontBold = await doc.embedFont(bold, { subset: true });
  const state: DrawState = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    pageIndex: 1,
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    bold: fontBold,
    model,
    trace: options?.trace,
  };

  drawPageOneHeader(state);

  if (model.facts.length) {
    const factText = model.facts.join("    ");
    const factLines = wrapText(factText, font, 9, CONTENT_WIDTH);
    const factH = wrappedHeight(factLines.length, 9);
    ensure(state, factH);
    drawWrapped(state, factLines, MARGIN_X, state.y, { size: 9, color: COLORS.muted });
    state.y -= factH + 6;
  }

  section(state, model.copy.composition);
  drawTableHeader(state, model.copy);
  model.rows.forEach((row, index) => drawTableRow(state, row, index % 2 === 1, model.copy));

  const summaryH = 28;
  ensure(state, summaryH + 12);
  state.y -= 8;
  const summaryTop = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: summaryTop - summaryH,
    width: CONTENT_WIDTH,
    height: summaryH,
    color: COLORS.goldSoft,
    borderColor: COLORS.line,
    borderWidth: 0.6,
  });
  drawTextLine(state, `${model.yieldLine}      ${model.costLine}`, MARGIN_X + 10, baselineFor(summaryTop, 10, 8), {
    size: 10,
    bold: true,
  });
  state.y = summaryTop - summaryH - 16;

  if (model.steps.length) {
    section(state, model.copy.cooking);
    for (const [index, step] of model.steps.entries()) {
      await drawCookingStep(state, step, index);
    }
  }

  stampFooters(state);
  const bytes = await doc.save();
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
}
