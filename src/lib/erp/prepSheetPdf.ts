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
import type { RecipeStepDraft } from "./recipeCard";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 40;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const FONT_SIZE = 9;
const TITLE_SIZE = 18;
const LINE_GAP = 3;
const ROW_PAD_Y = 7;

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

function lineTitle(line: PrepPublishLine, product: PrepPublishProduct | undefined, lang: PrepSheetLang): string {
  const en = (product?.name_en || line.raw_name?.en || line.raw_name?.ru || "").trim();
  const vn = (product?.name_vn || line.raw_name?.vn || "").trim();
  return pickSheetText(en, vn, lang) || "—";
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

function stepBlock(step: RecipeStepDraft, lang: PrepSheetLang, index: number, copy: PrepSheetCopy): {
  title: string;
  items: string[];
  photo: string;
} {
  const title = pickSheetText(step.titleEn, step.titleVn, lang);
  const enLines = step.itemsEn.split(/\r?\n/).map((line) => line.trim());
  const vnLines = step.itemsVn.split(/\r?\n/).map((line) => line.trim());
  const count = Math.max(enLines.length, vnLines.length);
  const items: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const line = pickSheetText(enLines[i] ?? "", vnLines[i] ?? "", lang);
    if (line) items.push(line);
  }
  return { title: title || `${copy.step} ${index + 1}`, items, photo: step.photo.trim() };
}

/** All labels, names and step lines that will be drawn — used by tests and the painter. */
export function buildPrepSheetModel(input: PrepPublishInput, uiLang: ErpLang = erpLang()): PrepSheetModel {
  const lang = prepSheetLang(uiLang);
  const copy = prepSheetCopy(lang);
  const date = formatVietnamDate(input.cardDate) || input.cardDate.trim() || "—";
  const name = pickSheetText(input.product.name_en, input.product.name_vn ?? "", lang) || "—";
  const facts: string[] = [];
  if (input.product.unit_weight_kg && input.product.unit_weight_kg > 0) {
    const piece = qtyAndUnit(input.product.unit_weight_kg, "kg", copy);
    facts.push(`${copy.piece}: ${piece.qty} ${piece.unit}`.trim());
  }
  if (input.shelfLifeDays && input.shelfLifeDays > 0) {
    facts.push(`${copy.shelfLife}: ${input.shelfLifeDays} ${copy.days}`);
  }
  if (input.storageConditions.trim()) facts.push(input.storageConditions.trim());

  const rows = input.lines.flatMap((line) => {
    const product = catalogOf(input, line.product_id);
    if (line.qty == null && !line.raw_name && !line.product_id) return [];
    const unit = product?.base_unit ?? null;
    const net = lineNetQty(line, product);
    const amount = qtyAndUnit(net, unit, copy);
    return [
      {
        name: lineTitle(line, product, lang),
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
      .map((step, index) => stepBlock(step, lang, index, copy))
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

type DrawState = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

function newPage(state: DrawState): void {
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.y = PAGE_HEIGHT - MARGIN_TOP;
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
  state.page.drawText(value, {
    x,
    y,
    size: opts.size ?? FONT_SIZE,
    font: opts.bold ? state.bold : state.font,
    color: opts.color ?? COLORS.text,
  });
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

async function embedPhoto(doc: PDFDocument, url: string | undefined): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    let bytes: Uint8Array;
    if (url.startsWith("data:image/")) {
      const comma = url.indexOf(",");
      if (comma < 0) return null;
      const binary = atob(url.slice(comma + 1));
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
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

function drawImage(state: DrawState, image: PDFImage, maxW: number, maxH: number): void {
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  ensure(state, h + 8);
  state.page.drawImage(image, { x: MARGIN_X, y: state.y - h, width: w, height: h });
  state.y -= h + 12;
}

function drawHeader(state: DrawState, model: PrepSheetModel, logo: PDFImage | null): void {
  const copy = model.copy;
  const nameLines = wrapText(model.name, state.bold, TITLE_SIZE, CONTENT_WIDTH - (logo ? 90 : 0));
  const meta = [
    `${copy.cardNo} ${model.cardNo}`,
    `${copy.date} ${model.date}`,
    `${copy.rev} ${model.revision}`,
  ];
  const logoH = logo ? Math.min(36, (36 / logo.width) * logo.height) : 0;
  const headerH = 10 + Math.max(logoH, 14) + 8 + nameLines.length * (TITLE_SIZE + 2) + 18 + 36 + 8;
  ensure(state, headerH);
  const top = state.y;
  state.page.drawRectangle({
    x: MARGIN_X,
    y: top - 4,
    width: CONTENT_WIDTH,
    height: 4,
    color: COLORS.goldBar,
  });
  let y = top - 14;
  if (logo) {
    const w = (logoH / logo.height) * logo.width;
    state.page.drawImage(logo, { x: MARGIN_X, y: y - logoH + 8, width: w, height: logoH });
    drawTextLine(state, "GASTROFOOD", MARGIN_X + w + 10, y - 4, { size: 11, bold: true, color: COLORS.gold });
  } else {
    drawTextLine(state, "GASTROFOOD", MARGIN_X, y - 4, { size: 11, bold: true, color: COLORS.gold });
  }
  y -= Math.max(logoH, 16) + 2;
  drawTextLine(state, model.kind, MARGIN_X, y, { size: 9, color: COLORS.muted });
  y -= 16;
  for (const line of nameLines) {
    drawTextLine(state, line, MARGIN_X, y - TITLE_SIZE + 4, { size: TITLE_SIZE, bold: true });
    y -= TITLE_SIZE + 2;
  }
  y -= 10;
  const cellW = CONTENT_WIDTH / 3;
  const metaH = 32;
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
    drawTextLine(state, label, x + 10, y - 20, { size: 9, color: COLORS.muted });
  });
  state.y = y - metaH - 14;
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
  options?: { lang?: ErpLang },
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
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    bold: fontBold,
  };

  const logo =
    (await embedPhoto(doc, getAssetUrl("/food/menu/GASTROFOOD-line.png"))) ||
    (await embedPhoto(doc, getAssetUrl("/food/menu/GASTROFOOD.png")));
  drawHeader(state, model, logo);

  const hero = await embedPhoto(doc, input.photo.trim() || undefined);
  if (hero) drawImage(state, hero, 220, 130);

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
      const title = `${index + 1}.  ${step.title}`;
      const titleLines = wrapText(title, fontBold, 11, CONTENT_WIDTH - 8);
      const itemBlocks = step.items.map((item) => wrapText(`•  ${item}`, font, 9, CONTENT_WIDTH - 22));
      const blockH =
        wrappedHeight(titleLines.length, 11) +
        itemBlocks.reduce((sum, lines) => sum + lines.length * 12, 0) +
        10;
      ensure(state, blockH);
      drawWrapped(state, titleLines, MARGIN_X, state.y, { size: 11, bold: true });
      state.y -= wrappedHeight(titleLines.length, 11) - ROW_PAD_Y;
      const photo = await embedPhoto(doc, step.photo || undefined);
      if (photo) drawImage(state, photo, 180, 110);
      for (const lines of itemBlocks) {
        drawWrapped(state, lines, MARGIN_X + 14, state.y, { size: 9 });
        state.y -= lines.length * 12 + 2;
      }
      state.y -= 8;
    }
  }

  const bytes = await doc.save();
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
}
