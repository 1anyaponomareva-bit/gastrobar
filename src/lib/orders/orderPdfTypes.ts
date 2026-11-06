/**
 * Frozen supplier-order snapshot shared by the PDF module (agent 1) and storage (agent 3).
 * Do not add Staff catalog fields (itemNo, employee, prep-stock counts).
 */
export type OrderPdfLine = {
  nameEn: string;
  nameVn: string;
  brand: string;
  packLabel: string;
  unit: string;
  qty: number;
};

export type OrderPdfInput = {
  orderNo: string;
  revision: number;
  orderedAt: string;
  supplierName: string;
  warehouseName?: string;
  comment?: string;
  lines: OrderPdfLine[];
};

export type OrderPdfFonts = {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
};

const ASCII_FILE = /[^A-Za-z0-9-]+/g;

export function asciiFileLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(ASCII_FILE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function formatOrderLineName(line: Pick<OrderPdfLine, "nameEn" | "nameVn">): string {
  const en = String(line.nameEn ?? "").replace(/\s+/g, " ").trim();
  const vn = String(line.nameVn ?? "").replace(/\s+/g, " ").trim();
  if (en && vn && vn !== en) return `${en} / ${vn}`;
  return en || vn;
}

export function formatOrderPdfDate(orderedAt: string): string {
  const raw = String(orderedAt ?? "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : raw || "-";
}

export function formatOrderQty(qty: number): string {
  if (!Number.isFinite(qty)) return "0";
  const rounded = Math.round(qty * 1000) / 1000;
  return String(rounded);
}

export function orderPdfLines(input: OrderPdfInput): OrderPdfLine[] {
  return (input.lines ?? []).filter((line) => Number(line.qty) > 0);
}

/** Filename changes when revision changes, so an older PDF is a different file. */
export function getOrderPdfFileName(
  input: Pick<OrderPdfInput, "orderNo" | "revision" | "supplierName" | "orderedAt">,
): string {
  const supplier = asciiFileLabel(input.supplierName) || "Supplier";
  const orderNo = asciiFileLabel(input.orderNo) || "Draft";
  const date = formatOrderPdfDate(input.orderedAt).replace(/[^\d-]/g, "") || "order";
  const revision = Number.isFinite(input.revision) ? Math.max(0, Math.floor(input.revision)) : 0;
  return `Order_${supplier}_${orderNo}_r${revision}_${date}.pdf`;
}

export function orderPdfTitle(input: Pick<OrderPdfInput, "orderNo" | "revision" | "supplierName">): string {
  const revision = Number.isFinite(input.revision) ? Math.floor(input.revision) : 0;
  return `${input.supplierName} — Order ${input.orderNo} r${revision}`;
}

export function orderPdfRevisionLabel(revision: number): string {
  const value = Number.isFinite(revision) ? Math.floor(revision) : 0;
  return String(value);
}

/**
 * Identity of a snapshot. Agent 2 must drop a prepared blob when this string changes
 * (new revision, edited lines, comment, warehouse, …).
 */
export function orderPdfCacheKey(input: OrderPdfInput): string {
  const lines = orderPdfLines(input).map((line) => ({
    nameEn: line.nameEn,
    nameVn: line.nameVn,
    brand: line.brand,
    packLabel: line.packLabel,
    unit: line.unit,
    qty: Number(line.qty),
  }));
  return JSON.stringify({
    orderNo: input.orderNo,
    revision: input.revision,
    orderedAt: input.orderedAt,
    supplierName: input.supplierName,
    warehouseName: input.warehouseName ?? "",
    comment: input.comment ?? "",
    lines,
  });
}
