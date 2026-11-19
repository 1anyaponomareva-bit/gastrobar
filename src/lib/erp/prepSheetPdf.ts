import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getAssetUrl } from "@/lib/appVersion";
import { formatVnd } from "./costing";
import { formatVietnamDate } from "@/lib/orders/datetime";
import {
  lineNetQty,
  METHOD_LABEL,
  prepKindTitle,
  sheetQty,
  type PrepPublishInput,
  type PrepPublishLine,
  type PrepPublishProduct,
} from "./prepStaffRecipe";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 36;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const COLORS = {
  text: rgb(0.07, 0.07, 0.07),
  muted: rgb(0.38, 0.38, 0.38),
  gold: rgb(0.83, 0.66, 0.22),
  goldSoft: rgb(1, 0.97, 0.9),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
};

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
  const words = text.split(/\s+/).filter(Boolean);
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

function text(
  state: DrawState,
  value: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; width?: number; x?: number },
): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? state.bold : state.font;
  const color = opts.color ?? COLORS.text;
  const width = opts.width ?? CONTENT_WIDTH;
  const x = opts.x ?? MARGIN_X;
  const lines = wrapText(value, font, size, width);
  for (const line of lines) {
    ensure(state, size + 4);
    state.page.drawText(line, { x, y: state.y, size, font, color });
    state.y -= size + 3;
  }
  if (opts.gap) state.y -= opts.gap;
}

function section(state: DrawState, title: string): void {
  ensure(state, 26);
  state.page.drawRectangle({
    x: MARGIN_X,
    y: state.y - 6,
    width: CONTENT_WIDTH,
    height: 20,
    color: COLORS.section,
  });
  state.page.drawText(title, {
    x: MARGIN_X + 8,
    y: state.y,
    size: 10,
    font: state.bold,
    color: COLORS.text,
  });
  state.y -= 24;
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
  state.y -= h + 10;
}

function catalogOf(input: PrepPublishInput, id: string | null): PrepPublishProduct | undefined {
  return id ? input.catalog.find((row) => row.id === id) : undefined;
}

function lineTitle(line: PrepPublishLine, product: PrepPublishProduct | undefined): { en: string; vn: string } {
  const en = (product?.name_en || line.raw_name?.en || line.raw_name?.ru || "").trim() || "—";
  const vn = (product?.name_vn || line.raw_name?.vn || "").trim();
  return { en, vn };
}

function cutsText(line: PrepPublishLine): string {
  const parts = (line.parts ?? []).filter((part) => part.name.trim() && part.grams != null);
  return parts.map((part) => `${part.name.trim()} ${Math.round((part.grams ?? 0) * 10) / 10} g`).join("; ");
}

function methodsText(line: PrepPublishLine): string {
  if (!line.methods?.length) return "—";
  return line.methods.map((method) => METHOD_LABEL[method].en).join(", ");
}

export async function makePrepSheetPdf(input: PrepPublishInput): Promise<Blob> {
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

  const kind = prepKindTitle(input.kind);
  const date = formatVietnamDate(input.cardDate) || input.cardDate.trim() || "—";
  const nameEn = input.product.name_en.trim() || "Untitled";
  const nameVn = (input.product.name_vn ?? "").trim();

  text(state, "GASTROFOOD", { size: 11, bold: true, color: COLORS.gold, gap: 2 });
  text(state, `${kind.en}  ·  ${kind.ru}  ·  ${kind.vn}`, { size: 9, color: COLORS.muted, gap: 6 });
  text(state, nameEn, { size: 18, bold: true, gap: 2 });
  if (nameVn && nameVn !== nameEn) text(state, nameVn, { size: 12, color: COLORS.muted, gap: 4 });

  const meta = [
    `Card No. ${input.cardNo.trim() || "—"}`,
    `Date ${date}`,
    `Rev. ${(input.cardRevision ?? (input.version ? String(input.version).padStart(2, "0") : "01")).trim()}`,
  ].join("    ");
  text(state, meta, { size: 9, color: COLORS.muted, gap: 8 });

  const hero = await embedPhoto(doc, input.photo.trim() || undefined);
  if (hero) drawImage(state, hero, 220, 140);

  const facts: string[] = [];
  if (input.product.unit_weight_kg && input.product.unit_weight_kg > 0) {
    facts.push(`1 pc: ${sheetQty(input.product.unit_weight_kg, "kg")}`);
  }
  if (input.shelfLifeDays && input.shelfLifeDays > 0) facts.push(`Shelf life: ${input.shelfLifeDays} days`);
  if (input.storageConditions.trim()) facts.push(input.storageConditions.trim());
  if (facts.length) text(state, facts.join("    "), { size: 9, color: COLORS.muted, gap: 8 });

  section(state, "Composition / Состав / Thành phần");
  const cols = { name: 200, proc: 78, gross: 70, net: 70, cuts: 90 };
  const headerY = state.y;
  ensure(state, 16);
  state.page.drawRectangle({ x: MARGIN_X, y: headerY - 4, width: CONTENT_WIDTH, height: 16, color: COLORS.goldSoft });
  let x = MARGIN_X + 4;
  const headers = [
    ["Ingredient", cols.name],
    ["Proc.", cols.proc],
    ["Gross", cols.gross],
    ["Net", cols.net],
    ["Cuts", cols.cuts],
  ] as const;
  for (const [label, width] of headers) {
    state.page.drawText(label, { x, y: headerY, size: 8, font: fontBold, color: COLORS.text });
    x += width;
  }
  state.y -= 18;

  for (const line of input.lines) {
    const product = catalogOf(input, line.product_id);
    const names = lineTitle(line, product);
    const unit = product?.base_unit ?? null;
    const net = lineNetQty(line, product);
    const nameLines = wrapText(names.vn && names.vn !== names.en ? `${names.en} / ${names.vn}` : names.en, font, 8, cols.name - 6);
    const cutLines = wrapText(cutsText(line) || "—", font, 8, cols.cuts - 4);
    const rowH = Math.max(nameLines.length, cutLines.length) * 11 + 6;
    ensure(state, rowH);
    const rowTop = state.y;
    let cx = MARGIN_X + 4;
    nameLines.forEach((row, index) => {
      state.page.drawText(row, { x: cx, y: rowTop - index * 11, size: 8, font: index === 0 && line.is_main ? fontBold : font, color: COLORS.text });
    });
    cx += cols.name;
    state.page.drawText(methodsText(line), { x: cx, y: rowTop, size: 8, font, color: COLORS.text });
    cx += cols.proc;
    state.page.drawText(sheetQty(line.qty, unit), { x: cx, y: rowTop, size: 8, font, color: COLORS.text });
    cx += cols.gross;
    state.page.drawText(sheetQty(net, unit), { x: cx, y: rowTop, size: 8, font, color: COLORS.text });
    cx += cols.net;
    cutLines.forEach((row, index) => {
      state.page.drawText(row, { x: cx, y: rowTop - index * 11, size: 8, font, color: COLORS.muted });
    });
    state.y -= rowH;
    state.page.drawLine({
      start: { x: MARGIN_X, y: state.y + 4 },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: state.y + 4 },
      thickness: 0.4,
      color: COLORS.line,
    });
  }

  const yieldText = `Yield: ${sheetQty(input.yieldQty, input.product.base_unit)}${
    input.yieldPieces && input.product.base_unit !== "pcs" ? ` · ${input.yieldPieces} pcs` : ""
  }`;
  const costText = `Cost: ${formatVnd(input.batchCost ?? null)}`;
  text(state, `${yieldText}    ${costText}`, { size: 10, bold: true, gap: 10 });

  if (input.steps.length) {
    section(state, "Cooking / Технология / Quy trình");
    for (const [index, step] of input.steps.entries()) {
      const title = [step.titleEn.trim(), step.titleVn.trim()].filter(Boolean).join(" / ") || `Step ${index + 1}`;
      text(state, `${index + 1}. ${title}`, { size: 11, bold: true, gap: 2 });
      const photo = await embedPhoto(doc, step.photo.trim() || undefined);
      if (photo) drawImage(state, photo, 180, 110);
      const enLines = step.itemsEn.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const vnLines = step.itemsVn.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const count = Math.max(enLines.length, vnLines.length);
      for (let i = 0; i < count; i += 1) {
        const en = enLines[i] ?? "";
        const vn = vnLines[i] ?? "";
        if (en) text(state, `• ${en}`, { size: 9, gap: 0 });
        if (vn && vn !== en) text(state, `  ${vn}`, { size: 8, color: COLORS.muted, gap: 2 });
        else state.y -= 2;
      }
      state.y -= 6;
    }
  }

  const bytes = await doc.save();
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
}
