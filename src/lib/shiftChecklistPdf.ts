type ChecklistPdfSection = {
  title: string;
  items: { label: string; checked: boolean }[];
};

export type ShiftChecklistPdfOptions = {
  venueLabel: string;
  date: string;
  employee: string;
  shiftLabel: string;
  cleaningLabel: string;
  sections: ChecklistPdfSection[];
};

function pdfEscape(value: string): string {
  return String(value)
    .replace(/[\\()]/g, (match) => `\\${match}`)
    .replace(/[^\x20-\x7E]/g, " ");
}

function buildPdfDocument(options: ShiftChecklistPdfOptions): string {
  const objs: string[] = [];
  const add = (object: string) => {
    objs.push(object);
    return objs.length;
  };

  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const text = (x: number, y: number, value: string, size = 10, isBold = false) =>
    `BT /${isBold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET\n`;

  const line = (x1: number, y1: number, x2: number, y2: number, gray = 0.82) =>
    `q ${gray} G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S Q\n`;

  let content = "";
  let y = 800;
  const bottom = 40;

  content += text(35, y, "SHIFT OPEN / CLOSE CHECKLIST", 18, true);
  y -= 22;
  content += text(35, y, `Venue: ${options.venueLabel}`, 11, true);
  y -= 16;
  content += text(
    35,
    y,
    `Date: ${options.date || "-"}    Employee: ${options.employee || "-"}`,
    11,
    false,
  );
  y -= 16;
  content += text(
    35,
    y,
    `Shift: ${options.shiftLabel}    Cleaning: ${options.cleaningLabel}`,
    11,
    false,
  );
  y -= 16;
  content += line(35, y, 560, y, 0.65);
  y -= 18;

  options.sections.forEach((section) => {
    if (y < bottom + 60) return;
    content += text(35, y, section.title.toUpperCase(), 12, true);
    y -= 18;
    section.items.forEach((item) => {
      if (y < bottom + 20) return;
      const mark = item.checked ? "[x]" : "[ ]";
      content += text(43, y, `${mark} ${item.label}`, 10, false);
      y -= 15;
    });
    y -= 8;
  });

  const completed = options.sections.reduce(
    (sum, section) => sum + section.items.filter((item) => item.checked).length,
    0,
  );
  const total = options.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  content += text(35, 28, `Completed: ${completed} / ${total}`, 10, true);

  const contentId = add(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  const pageId = add(
    `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentId} 0 R >>`,
  );
  const pagesId = add(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const linkedObjs = objs.map((object) =>
    object.replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`),
  );
  const catalogId = linkedObjs.length + 1;
  linkedObjs.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const xref: number[] = [0];
  linkedObjs.forEach((object, index) => {
    xref.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${linkedObjs.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${linkedObjs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${start}\n%%EOF`;

  return pdf;
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

export function makeShiftChecklistPdfBlob(
  options: ShiftChecklistPdfOptions,
): Blob {
  return new Blob([new TextEncoder().encode(buildPdfDocument(options))], {
    type: "application/pdf",
  });
}

export function exportShiftChecklistPdf(options: ShiftChecklistPdfOptions): void {
  const blob = makeShiftChecklistPdfBlob(options);
  const fileName = buildPdfFileName(options.venueLabel, options.date);

  if (isMobileDevice()) {
    presentPdfBlob(blob);
    return;
  }

  downloadPdfOnDesktop(blob, fileName);
}
