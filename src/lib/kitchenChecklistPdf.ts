import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import { KITCHEN_ITEMS, KITCHEN_SECTIONS, type KitchenShift } from "@/data/kitchenChecklist";
import { getAssetUrl } from "@/lib/appVersion";
import { deliverPdfFile, type DeliverPdfResult } from "@/lib/deliverPdfFile";
import { formatKitchenDate } from "@/lib/kitchenChecklistStorage";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 40;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const COLORS = {
  text: rgb(0.09, 0.09, 0.09),
  muted: rgb(0.38, 0.38, 0.38),
  line: rgb(0.86, 0.86, 0.86),
  section: rgb(0.95, 0.95, 0.95),
  gold: rgb(0.83, 0.66, 0.22),
};

let fontBytesPromise: Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> | null = null;

function loadFontBytes(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
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

export function preloadKitchenChecklistPdfFonts(): void {
  void loadFontBytes();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
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

export async function makeKitchenChecklistPdf(options: {
  dateIso: string;
  employee: string;
  shift: KitchenShift;
  checked: Record<string, boolean>;
}): Promise<Blob> {
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

  const shiftLabel = options.shift === "evening" ? "Вечерняя" : "Дневная";
  const dateLabel = formatKitchenDate(options.dateIso);
  const done = KITCHEN_ITEMS.filter((item) => options.checked[item.id]).length;

  state.page.drawText("GASTROFOOD", {
    x: MARGIN_X,
    y: state.y,
    size: 11,
    font: fontBold,
    color: COLORS.gold,
  });
  state.y -= 22;
  state.page.drawText("Утренний чек-лист подготовки кухни", {
    x: MARGIN_X,
    y: state.y,
    size: 16,
    font: fontBold,
    color: COLORS.text,
  });
  state.y -= 22;
  const meta = `Дата: ${dateLabel}    Сотрудник: ${options.employee.trim()}    Смена: ${shiftLabel}`;
  for (const line of wrapText(meta, font, 11, CONTENT_WIDTH)) {
    state.page.drawText(line, {
      x: MARGIN_X,
      y: state.y,
      size: 11,
      font,
      color: COLORS.muted,
    });
    state.y -= 15;
  }
  state.page.drawText(`Отмечено: ${done} из ${KITCHEN_ITEMS.length}`, {
    x: MARGIN_X,
    y: state.y,
    size: 11,
    font,
    color: COLORS.text,
  });
  state.y -= 18;

  for (const section of KITCHEN_SECTIONS) {
    const items = KITCHEN_ITEMS.filter((item) => item.sectionId === section.id);
    ensure(state, 28);
    state.page.drawRectangle({
      x: MARGIN_X,
      y: state.y - 6,
      width: CONTENT_WIDTH,
      height: 20,
      color: COLORS.section,
    });
    state.page.drawText(section.title.ru.toUpperCase(), {
      x: MARGIN_X + 8,
      y: state.y,
      size: 10,
      font: fontBold,
      color: COLORS.text,
    });
    state.y -= 24;

    for (const item of items) {
      const mark = options.checked[item.id] ? "✓" : "☐";
      const lines = wrapText(item.label.ru, font, 11, CONTENT_WIDTH - 22);
      ensure(state, lines.length * 14 + 6);
      lines.forEach((line, index) => {
        state.page.drawText(index === 0 ? `${mark}  ${line}` : `     ${line}`, {
          x: MARGIN_X + 4,
          y: state.y,
          size: 11,
          font,
          color: COLORS.text,
        });
        state.y -= 14;
      });
      state.y -= 2;
    }
    state.y -= 8;
  }

  const bytes = await doc.save();
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
}

export function kitchenChecklistPdfFileName(dateIso: string, employee: string): string {
  const safeName = employee.trim().replace(/\s+/g, "_") || "employee";
  return `GASTROFOOD_Kitchen_${formatKitchenDate(dateIso)}_${safeName}.pdf`;
}

export async function deliverKitchenChecklistPdf(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  return deliverPdfFile(blob, fileName);
}
