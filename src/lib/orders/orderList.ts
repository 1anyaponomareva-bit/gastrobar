import { isPositiveQty } from "./qty";
import type { OrderProduct } from "./types";

export type SelectionRow = { packId: string | null; qty: string };

export type SelectionMap = Record<string, SelectionRow>;

export type PlaceDialogPhase = "closed" | "open" | "submitted";

export type CatalogSortable = {
  id: string;
  sort: number;
  nameEn: string;
};

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

/** Badge = count of selected rows whose current/default supplier is that supplier. */
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

/** Supplier page: selected (yellow) rows first, original order kept inside each group. */
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
