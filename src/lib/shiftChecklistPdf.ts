import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
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
  date: string;
  employee: string;
  shiftLabel: string;
  cleaningLabel: string;
  sections: ChecklistPdfSection[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 35;
const MARGIN_RIGHT = 35;
const MARGIN_BOTTOM = 42;

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
  font: PDFFont,
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
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
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

export async function makeShiftChecklistPdfBlob(
  options: ShiftChecklistPdfOptions,
): Promise<Blob> {
  const { regular, bold } = await loadFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(regular);
  const fontBold = await pdfDoc.embedFont(bold);
  const maxTextWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 42;

  const ensureSpace = (needed: number) => {
    if (y - needed >= MARGIN_BOTTOM) return;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 42;
  };

  const drawLine = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y },
      thickness: 0.5,
      color: rgb(0.65, 0.65, 0.65),
    });
    y -= 14;
  };

  const drawText = (
    text: string,
    size: number,
    isBold = false,
    indent = 0,
  ) => {
    const activeFont = isBold ? fontBold : font;
    ensureSpace(size + 6);
    page.drawText(text, {
      x: MARGIN_LEFT + indent,
      y,
      size,
      font: activeFont,
      color: rgb(0, 0, 0),
    });
    y -= size + 6;
  };

  const drawWrapped = (
    text: string,
    size: number,
    isBold = false,
    indent = 0,
  ) => {
    const activeFont = isBold ? fontBold : font;
    const lines = wrapText(text, activeFont, size, maxTextWidth - indent);
    lines.forEach((line) => drawText(line, size, isBold, indent));
  };

  drawText("SHIFT OPEN / CLOSE CHECKLIST", 18, true);
  y -= 4;
  drawText(`Venue: ${options.venueLabel}`, 11, true);
  drawText(
    `Date: ${options.date || "-"}    Employee: ${options.employee || "-"}`,
    11,
  );
  drawText(
    `Shift: ${options.shiftLabel}    Cleaning: ${options.cleaningLabel}`,
    11,
  );
  drawLine();

  options.sections.forEach((section) => {
    drawWrapped(section.title.toUpperCase(), 12, true);
    y -= 2;

    section.items.forEach((item) => {
      let mark = "[ ]";
      if (item.status === "done") mark = "[x]";
      if (item.status === "failed") mark = "[!]";

      drawWrapped(`${mark} ${item.label}`, 10, false, 8);

      if (item.status === "failed" && item.comment?.trim()) {
        drawWrapped(`Reason: ${item.comment.trim()}`, 9, false, 16);
      }
    });

    y -= 6;
  });

  const completed = options.sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.status === "done").length,
    0,
  );
  const failed = options.sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.status === "failed").length,
    0,
  );
  const total = options.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  drawLine();
  drawText(`Done: ${completed} / ${total}    Not done: ${failed}`, 10, true);

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
