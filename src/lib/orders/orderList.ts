import { productDisplayName, type ProductNameLocale } from "../erp/productName";
import { orderPdfLineCode, orderPdfPrintWarehouse, type OrderPdfInput, type OrderPdfKind } from "./orderPdfTypes";
import { formatQty, isPositiveQty, parseQty } from "./qty";
import type { OrderProduct, OrderProductPack, OrderWarehouse } from "./types";

export type SelectionRow = { packId: string | null; qty: string };

export type SelectionMap = Record<string, SelectionRow>;

export type PlaceDialogPhase = "closed" | "open" | "submitted";

export type CatalogSortable = {
  id: string;
  sort: number;
  nameEn: string;
};

export const ALL_SUPPLIER_TAB = "all";

export type CatalogCategory = { id: string; name: string };

export type CategoryGroup<T> = { id: string; name: string; products: T[] };

export type SupplierTabChip = { id: string; label: string; count: number };

/** Employee Order List order: ERP `staff_sort`, then name. */
export function sortCatalogProducts<T extends CatalogSortable>(products: T[]): T[] {
  return [...products].sort(
    (a, b) => a.sort - b.sort || a.nameEn.localeCompare(b.nameEn, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id),
  );
}

/** Staff yellow: a row is selected when its quantity is greater than zero. */
export function isMarkedQty(qty: string | number | null | undefined): boolean {
  return isPositiveQty(qty);
}

export function isProductMarked(productId: string, selection: SelectionMap): boolean {
  return isMarkedQty(selection[productId]?.qty);
}

/** Badge on a supplier tab = count of selected rows whose current/default supplier is that supplier. */
export function supplierBadgeCounts(
  products: Array<{ id: string; supplierId: string | null }>,
  selection: SelectionMap,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (!product.supplierId || !isProductMarked(product.id, selection)) continue;
    counts.set(product.supplierId, (counts.get(product.supplierId) ?? 0) + 1);
  }
  return counts;
}

/** Horizontal supplier chips under Order List: All is separate; each supplier carries its yellow badge count. */
export function supplierTabChips(
  suppliers: Array<{ id: string; name: string }>,
  products: Array<{ id: string; supplierId: string | null }>,
  selection: SelectionMap,
): SupplierTabChip[] {
  const counts = supplierBadgeCounts(products, selection);
  return suppliers.map((supplier) => ({
    id: supplier.id,
    label: supplier.name,
    count: counts.get(supplier.id) ?? 0,
  }));
}

export function filterBySupplierTab<T extends { supplierId: string | null }>(products: T[], tab: string): T[] {
  if (!tab || tab === ALL_SUPPLIER_TAB) return products;
  return products.filter((product) => product.supplierId === tab);
}

export function filterByCategory<T extends { categoryId: string | null }>(products: T[], categoryId: string): T[] {
  if (!categoryId || categoryId === ALL_SUPPLIER_TAB) return products;
  return products.filter((product) => product.categoryId === categoryId);
}

/** Category chips/headers in catalog order (first time a category appears). One language from the switcher. */
export function catalogCategories(
  products: Array<{ categoryId: string | null; categoryName: string | null; categoryNameVn?: string | null }>,
  locale: ProductNameLocale = "ru",
): CatalogCategory[] {
  const seen = new Map<string, CatalogCategory>();
  for (const product of products) {
    if (!product.categoryId || seen.has(product.categoryId)) continue;
    const name = productDisplayName({
      locale,
      nameEn: product.categoryName,
      nameVn: product.categoryNameVn,
    });
    seen.set(product.categoryId, {
      id: product.categoryId,
      name: name || product.categoryId,
    });
  }
  return [...seen.values()];
}

/** Staff All/supplier lists stay grouped by category; selected yellow rows are not pulled to the top. */
export function groupProductsByCategory<T extends { categoryId: string | null }>(
  products: T[],
  categories: CatalogCategory[],
): CategoryGroup<T>[] {
  const groups: CategoryGroup<T>[] = [];
  for (const category of categories) {
    const list = products.filter((product) => product.categoryId === category.id);
    if (list.length) groups.push({ id: category.id, name: category.name, products: list });
  }
  const known = new Set(categories.map((category) => category.id));
  const rest = products.filter((product) => !product.categoryId || !known.has(product.categoryId));
  if (rest.length) groups.push({ id: "", name: "", products: rest });
  return groups;
}

/** Supplier page helper: selected (yellow) rows first, original order kept inside each group. */
export function selectedFirst<T extends { id: string }>(products: T[], selection: SelectionMap): T[] {
  const marked: T[] = [];
  const rest: T[] = [];
  for (const product of products) {
    if (isProductMarked(product.id, selection)) marked.push(product);
    else rest.push(product);
  }
  return [...marked, ...rest];
}

/**
 * Staff admin drag: the dragged ids keep their slots in the full list,
 * and take the new relative order.
 */
export function reorderSubset(allIds: string[], movedIds: string[]): string[] {
  const inList = new Set(allIds);
  const queue = movedIds.filter((id) => inList.has(id));
  const moved = new Set(queue);
  let next = 0;
  return allIds.map((id) => (moved.has(id) ? queue[next++] : id));
}

/**
 * Public /orders Pre-order and Отправить PDF: open the share sheet in the tap,
 * then persist the draft. Awaiting POST before share drops the user gesture.
 */
export const ORDER_PDF_TAP_STEPS = ["share", "save-draft"] as const;

/** Place runs only after the dialog Submit, never on «Заказал у поставщика» alone. */
export function reducePlaceDialog(phase: PlaceDialogPhase, action: "open" | "cancel" | "submit"): PlaceDialogPhase {
  if (action === "open") return "open";
  if (action === "cancel") return "closed";
  if (phase === "open" && action === "submit") return "submitted";
  return phase;
}

export function shouldPlaceAfterDialog(phase: PlaceDialogPhase): boolean {
  return phase === "submitted";
}

export function defaultPackId(product: Pick<OrderProduct, "packs">): string | null {
  return product.packs.find((pack) => pack.is_default)?.pack_id ?? product.packs[0]?.pack_id ?? null;
}

export function packOf(product: Pick<OrderProduct, "packs">, packId: string | null) {
  return product.packs.find((pack) => pack.pack_id === packId) ?? product.packs[0] ?? null;
}

export function packsForSupplier(product: Pick<OrderProduct, "packs">, supplierId: string | null): OrderProductPack[] {
  if (!supplierId) return product.packs;
  const scoped = product.packs.filter((pack) => !pack.supplierId || pack.supplierId === supplierId);
  return scoped.length ? scoped : product.packs;
}

export function productForSupplierTab(product: OrderProduct, supplierId: string | null): OrderProduct {
  if (!supplierId) return product;
  const packs = packsForSupplier(product, supplierId);
  if (packs === product.packs) return product;
  return { ...product, packs };
}

export function selectionForSupplier(
  products: Array<{ id: string }>,
  selection: SelectionMap,
): SelectionMap {
  const next: SelectionMap = {};
  for (const product of products) {
    const row = selection[product.id];
    if (row) next[product.id] = row;
  }
  return next;
}

export function clearSupplierSelection(selection: SelectionMap, productIds: string[]): SelectionMap {
  const remove = new Set(productIds);
  const next: SelectionMap = {};
  for (const [id, row] of Object.entries(selection)) {
    if (!remove.has(id)) next[id] = row;
  }
  return next;
}

export function clearQuantities(selection: SelectionMap, productIds: string[], packIdOf: (id: string) => string | null): SelectionMap {
  const next = { ...selection };
  for (const id of productIds) {
    next[id] = { packId: selection[id]?.packId ?? packIdOf(id), qty: "" };
  }
  return next;
}

export function filledProductIds(products: Array<{ id: string }>, selection: SelectionMap): string[] {
  return products.filter((product) => (selection[product.id]?.qty ?? "").trim() !== "").map((product) => product.id);
}

export function selectionDraftLines(
  products: Array<{ id: string }>,
  selection: SelectionMap,
): Array<{ product_id: string; pack_id: string | null; qty: number }> {
  const lines: Array<{ product_id: string; pack_id: string | null; qty: number }> = [];
  for (const product of products) {
    const row = selection[product.id];
    if (!row || !isPositiveQty(row.qty)) continue;
    lines.push({ product_id: product.id, pack_id: row.packId, qty: parseQty(row.qty) });
  }
  return lines;
}

/** Selected warehouse, else Prep Kitchen (pre-order default before the place dialog). */
export function orderPdfWarehouseOf<T extends { id?: string; kind?: string }>(
  warehouses: T[],
  warehouseId?: string | null,
): T | undefined {
  const selected = warehouseId ? warehouses.find((row) => row.id === warehouseId) : undefined;
  if (selected) return selected;
  return warehouses.find((row) => row.kind === "prep_kitchen");
}

export function orderPdfWarehouseFields(
  warehouse?: Pick<OrderWarehouse, "name" | "address" | "phone"> | null,
): Pick<OrderPdfInput, "warehouseName" | "warehouseAddress" | "warehousePhone"> {
  if (!warehouse) return {};
  return {
    warehouseName: warehouse.name,
    warehouseAddress: warehouse.address ?? "",
    warehousePhone: warehouse.phone ?? "",
  };
}

/** PDF of yellow (qty>0) supplier rows. Revision is unused on the cook-facing file. */
export function supplierPrintPdfInput(
  products: OrderProduct[],
  selection: SelectionMap,
  meta: {
    orderNo: string;
    supplierName: string;
    orderedAt?: string;
    warehouseName?: string;
    warehouseAddress?: string;
    warehousePhone?: string;
    comment?: string;
    kind?: OrderPdfKind;
  },
): OrderPdfInput | null {
  const marked = products.filter((product) => isProductMarked(product.id, selection));
  if (!marked.length) return null;
  const warehouse = orderPdfPrintWarehouse({
    kind: meta.kind,
    warehouseName: meta.warehouseName,
    warehouseAddress: meta.warehouseAddress,
    warehousePhone: meta.warehousePhone,
  });
  return {
    orderNo: meta.orderNo,
    revision: 0,
    orderedAt: (meta.orderedAt || new Date().toISOString()).slice(0, 10),
    supplierName: meta.supplierName,
    warehouseName: warehouse.warehouseName,
    warehouseAddress: warehouse.warehouseAddress,
    warehousePhone: warehouse.warehousePhone,
    kind: meta.kind,
    comment: meta.comment,
    lines: marked.map((product) => {
      const row = selection[product.id];
      const pack = packOf(product, row?.packId ?? null);
      return {
        nameEn: product.nameEn,
        nameVn: product.nameVn,
        brand: product.brand ?? "",
        packLabel: pack?.label ?? "",
        packCode: orderPdfLineCode(pack?.code, product.productCode),
        unit: pack ? orderPackUnit(pack, product.unit) : product.unit,
        qty: parseQty(row?.qty),
      };
    }),
  };
}

const PACK_CONTAINER = /^(box|pack|pcs|pc|btl|bottle|can|bag)\s+(.+)$/i;

function containerWord(value: string): string {
  const head = value.toLowerCase();
  if (head === "pc") return "pcs";
  if (head === "bottle") return "btl";
  return head;
}

function compactQty(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/** Staff-style caption under ORDER qty: `1 pack = 24 pcs`. */
export function orderPackCaption(pack: { label: string; unit: string; qty_base: number }): string | null {
  const label = pack.label.replace(/\s+/g, " ").trim();
  if (/^1\s+\S+\s*=/.test(label)) return label;
  const match = PACK_CONTAINER.exec(label);
  if (match) return `1 ${containerWord(match[1])} = ${match[2].trim()}`;
  if (pack.qty_base > 0 && pack.unit) {
    const compact = label.toLowerCase().replace(/\s+/g, "");
    if (Math.abs(pack.qty_base - 1) < 1e-9 && compact === `1${pack.unit.toLowerCase()}`) return null;
    return `1 pack = ${compactQty(pack.qty_base)} ${pack.unit}`;
  }
  return label || null;
}

/** Qty-field suffix: box/pack when the pack name starts with a container, else the pack unit. */
export function orderPackUnit(pack: { label: string; unit: string }, productUnit: string): string {
  const match = PACK_CONTAINER.exec(pack.label.replace(/\s+/g, " ").trim());
  if (match) return containerWord(match[1]);
  return pack.unit || productUnit;
}

export type OrderLineQtyView = {
  orderedQty: number;
  packQty?: number | null;
  packQtyBase?: number | null;
  qtyBase?: number | null;
  packLabel?: string | null;
  unit: string;
  baseUnit?: string | null;
};

export type OrderLineQtyField = "ordered" | "base";

function packCoef(line: OrderLineQtyView): number | null {
  const value = Number(line.packQtyBase ?? line.qtyBase);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isPackWord(value: string): boolean {
  return /^(box|pack|pcs|pc|btl|bottle|can|bag|gói)$/i.test(value.trim());
}

/** Product unit (kg, l), never the pack word box/pack. */
export function orderLineBaseUnit(line: OrderLineQtyView): string {
  const explicit = String(line.baseUnit ?? "").trim();
  if (explicit && !isPackWord(explicit)) return explicit;
  const unit = String(line.unit ?? "").trim();
  if (unit && !isPackWord(unit)) return unit;
  const match = PACK_CONTAINER.exec((line.packLabel || "").replace(/\s+/g, " ").trim());
  const fromPack = (match?.[2] ?? "").replace(/^[\d.,*\s×x]+/iu, "").trim();
  if (fromPack && !isPackWord(fromPack)) return fromPack;
  return explicit || unit;
}

/** Ordered stays packs. Accepted / posted / remaining stay kg, l, … */
export function orderLineDisplayCount(baseQty: number, line: OrderLineQtyView, field: OrderLineQtyField = "base"): number {
  if (field === "ordered") {
    if (line.packQty != null && Number(line.packQty) > 0) return Number(line.packQty);
    const coef = packCoef(line);
    if (coef) return Math.round((baseQty / coef) * 1e6) / 1e6;
  }
  return baseQty;
}

export function orderLineDisplayUnit(line: OrderLineQtyView, field: OrderLineQtyField = "base"): string {
  if (field === "ordered" && packCoef(line)) {
    return orderPackUnit({ label: line.packLabel || "", unit: line.unit || "" }, line.unit || "");
  }
  return orderLineBaseUnit(line);
}

export function formatOrderLineQty(baseQty: number, line: OrderLineQtyView, field: OrderLineQtyField = "base"): string {
  return `${formatQty(orderLineDisplayCount(baseQty, line, field))} ${orderLineDisplayUnit(line, field)}`.trim();
}

/** Extra line under ordered packs: `= 40 kg` when one box is not 1 base unit. */
export function formatOrderLineBaseHint(line: OrderLineQtyView): string | null {
  const coef = packCoef(line);
  if (!coef || Math.abs(coef - 1) < 1e-9) return null;
  if (line.packQty == null || Number(line.packQty) <= 0) return null;
  const unit = orderLineBaseUnit(line);
  return `= ${formatQty(line.orderedQty)}${unit ? ` ${unit}` : ""}`;
}

export function productDetailLine(input: {
  brand?: string | null;
  supplierName?: string | null;
  showSupplier: boolean;
  packCode?: string | null;
}): string {
  return [
    input.brand?.trim() || null,
    input.showSupplier ? input.supplierName?.trim() || null : null,
    input.packCode?.trim() ? `#${input.packCode.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
