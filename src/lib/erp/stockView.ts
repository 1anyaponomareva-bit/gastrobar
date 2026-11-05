import type { ErpStockRow } from "./types";

/** Stock of one product over a set of warehouses, valued by its remaining lots. */
export type StockTotals = {
  qty: number;
  /** Value of the lots whose cost is known. */
  knownValue: number;
  /** False when some remaining lot has no cost: knownValue is then only a lower bound. */
  complete: boolean;
};

const EMPTY: StockTotals = { qty: 0, knownValue: 0, complete: true };

/** `warehouses` null or empty = all warehouses. */
export function stockByProduct(rows: ErpStockRow[], warehouses: Set<string> | null): Map<string, StockTotals> {
  const out = new Map<string, StockTotals>();
  for (const row of rows) {
    if (warehouses?.size && !warehouses.has(row.warehouse_id)) continue;
    const prev = out.get(row.product_id) ?? EMPTY;
    out.set(row.product_id, {
      qty: prev.qty + Number(row.qty),
      knownValue: prev.knownValue + Number(row.known_value ?? 0),
      complete: prev.complete && (Number(row.qty) === 0 || row.cost_known),
    });
  }
  return out;
}

export const stockOf = (map: Map<string, StockTotals>, productId: string) => map.get(productId) ?? EMPTY;

export function addTotals(items: StockTotals[]): StockTotals {
  return items.reduce((a, b) => ({ qty: a.qty + b.qty, knownValue: a.knownValue + b.knownValue, complete: a.complete && b.complete }), EMPTY);
}

/** Value of the stock, or null when it is not fully known (never 0 for an unknown cost). */
export const stockValue = (t: StockTotals): number | null => (t.complete ? t.knownValue : null);

export type CostInfo =
  /** Weighted average of the remaining lots: value / qty. */
  | { kind: "lots"; unitCost: number }
  /** There is stock but some lots have no cost. */
  | { kind: "unknown" }
  /** No stock: the product's reference price (last delivery / manual / recipe), not a stock value. */
  | { kind: "reference"; unitCost: number; source: string | null }
  | { kind: "none" };

export function costInfo(t: StockTotals, product: { est_unit_cost: number | null; est_cost_source?: string | null }): CostInfo {
  if (t.qty > 0) return t.complete ? { kind: "lots", unitCost: t.knownValue / t.qty } : { kind: "unknown" };
  if (product.est_unit_cost !== null && product.est_unit_cost !== undefined) {
    return { kind: "reference", unitCost: Number(product.est_unit_cost), source: product.est_cost_source ?? null };
  }
  return { kind: "none" };
}

export const costNumber = (c: CostInfo) => (c.kind === "lots" || c.kind === "reference" ? c.unitCost : null);
