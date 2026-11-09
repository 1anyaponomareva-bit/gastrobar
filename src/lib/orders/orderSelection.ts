import type { SelectionMap, SelectionRow } from "./orderList";

const STORAGE_KEY = "gf_orders_selection";
const TAB_KEY = "gf_orders_supplier_tab";
const PLACER_KEY = "gf_orders_placer_name";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readOrderSelection(): SelectionMap {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: SelectionMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const row = value as { packId?: unknown; qty?: unknown };
        next[id] = {
          packId: typeof row.packId === "string" && row.packId ? row.packId : null,
          qty: typeof row.qty === "string" ? row.qty : "",
        };
      } else if (typeof value === "string") {
        next[id] = { packId: null, qty: value };
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function writeOrderSelection(selection: SelectionMap): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* private mode or full */
  }
}

export function setSelectionRow(selection: SelectionMap, productId: string, row: SelectionRow): SelectionMap {
  return { ...selection, [productId]: row };
}

export function readOrderSupplierTab(): string {
  if (!canUseStorage()) return "all";
  try {
    return window.localStorage.getItem(TAB_KEY) || "all";
  } catch {
    return "all";
  }
}

export function writeOrderSupplierTab(tab: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* private mode or full */
  }
}

export function readStoredPlacerName(): string {
  if (!canUseStorage()) return "";
  try {
    return window.localStorage.getItem(PLACER_KEY) || "";
  } catch {
    return "";
  }
}

export function writeStoredPlacerName(name: string): void {
  if (!canUseStorage()) return;
  try {
    const value = name.trim();
    if (value) window.localStorage.setItem(PLACER_KEY, value);
    else window.localStorage.removeItem(PLACER_KEY);
  } catch {
    /* private mode or full */
  }
}
