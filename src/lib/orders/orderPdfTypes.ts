/**
 * Frozen supplier-order snapshot shared by the PDF module (agent 1) and storage (agent 3).
 * Do not add Staff catalog fields (itemNo, employee, prep-stock counts).
 */
export type OrderPdfLine = {
  nameEn: string;
  nameVn: string;
  brand: string;
  packLabel: string;
  /** Supplier pack SKU; omitted when the catalog has none. */
  packCode?: string;
  unit: string;
  qty: number;
};

export type OrderPdfKind = "pre" | "final";

export type OrderPdfInput = {
  orderNo: string;
  revision: number;
  orderedAt: string;
  supplierName: string;
  warehouseName?: string;
  warehouseAddress?: string;
  warehousePhone?: string;
  /** Cook-facing file: Pre_order_* before place, Order_* after Submit. */
  kind?: OrderPdfKind;
  comment?: string;
  lines: OrderPdfLine[];
};

export const ORDER_PDF_COMPANY_NAME = "GASTROFOOD";

export const ORDER_PDF_PREP_KITCHEN_ADDRESS =
  "Khối 12A tòa OC3 thuộc dự án Mường Thanh Viễn Triều, Phường Bắc Nha Trang, Khánh Hòa";

export const ORDER_PDF_PREP_KITCHEN_PHONE = "+84 98 863 15 07";

export const ORDER_PDF_WAREHOUSE_ADDRESS = "152 Lk 77 Đường số 51\nPhường Nam Nha Trang, Tỉnh Khánh Hòa";

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

/** Pack SKU first; product_code only when the фасовка has no code. Never Staff itemNo. */
export function orderPdfLineCode(packCode?: string | null, productCode?: string | null): string {
  const pack = String(packCode ?? "").replace(/\s+/g, " ").trim();
  if (pack) return pack;
  return String(productCode ?? "").replace(/\s+/g, " ").trim();
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

/** QTY cell: ordered pack count only (`2`). Pack size stays in packLabel, never in this cell. */
export function formatOrderPdfQtyCell(line: Pick<OrderPdfLine, "qty" | "unit">): string {
  return formatOrderQty(line.qty);
}

export function orderPdfLines(input: OrderPdfInput): OrderPdfLine[] {
  return (input.lines ?? []).filter((line) => Number(line.qty) > 0);
}

/** Cook-facing filename: supplier + date. Revision stays internal (DB / PDF subject). */
export function getOrderPdfFileName(
  input: Pick<OrderPdfInput, "supplierName" | "orderedAt"> &
    Partial<Pick<OrderPdfInput, "orderNo" | "revision" | "kind">>,
): string {
  const supplier = asciiFileLabel(input.supplierName) || "Supplier";
  const date = formatOrderPdfDate(input.orderedAt).replace(/[^\d-]/g, "") || "order";
  const prefix = input.kind === "pre" ? "Pre_order" : "Order";
  return `${prefix}_${supplier}_${date}.pdf`;
}

export function orderPdfCompanyHeading(): string {
  return ORDER_PDF_COMPANY_NAME;
}

export function orderPdfFooterLines(): string[] {
  return [ORDER_PDF_COMPANY_NAME];
}

export function orderPdfAddressLines(address: string): string[] {
  return String(address ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Address/phone from the chosen ERP warehouse; Prep Kitchen contact if the DTO has none. */
export function orderPdfContactOf(
  input: Pick<OrderPdfInput, "warehouseAddress" | "warehousePhone">,
): { address: string; phone: string } {
  if (input.warehouseAddress != null || input.warehousePhone != null) {
    return {
      address: String(input.warehouseAddress ?? "").trim(),
      phone: String(input.warehousePhone ?? "").trim(),
    };
  }
  return { address: ORDER_PDF_PREP_KITCHEN_ADDRESS, phone: ORDER_PDF_PREP_KITCHEN_PHONE };
}

export function orderPdfHeaderMeta(input: OrderPdfInput): string[] {
  const contact = orderPdfContactOf(input);
  const lines = [...orderPdfAddressLines(contact.address), ...(contact.phone ? [contact.phone] : [])];
  lines.push(`Order / Số: ${input.orderNo.trim() || "—"}`, `Date / Ngày: ${formatOrderPdfDate(input.orderedAt)}`);
  const warehouse = String(input.warehouseName ?? "").trim();
  if (warehouse) lines.push(`Warehouse / Kho: ${warehouse}`);
  const comment = String(input.comment ?? "").replace(/\s+/g, " ").trim();
  if (comment) lines.push(`Note / Ghi chú: ${comment}`);
  return lines;
}

export function orderPdfTitle(input: Pick<OrderPdfInput, "supplierName"> & Partial<Pick<OrderPdfInput, "orderNo" | "revision">>): string {
  const orderNo = String(input.orderNo ?? "").trim();
  return orderNo ? `${input.supplierName} — Order ${orderNo}` : `${input.supplierName} — Order`;
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
    packCode: line.packCode ?? "",
    unit: line.unit,
    qty: Number(line.qty),
  }));
  return JSON.stringify({
    orderNo: input.orderNo,
    revision: input.revision,
    orderedAt: input.orderedAt,
    supplierName: input.supplierName,
    warehouseName: input.warehouseName ?? "",
    warehouseAddress: input.warehouseAddress ?? "",
    warehousePhone: input.warehousePhone ?? "",
    kind: input.kind ?? "final",
    comment: input.comment ?? "",
    lines,
  });
}
