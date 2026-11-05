import type { ErpDocType } from "./types";

type Warehouse = { id: string; kind: string; archived_at?: string | null };

/**
 * Warehouses of a new document. A saved draft keeps its own warehouses and never comes here.
 * Receipts: the warehouse passed when opening the form, else the active Prep Kitchen, else none
 * (the user must choose; the main Warehouse is never picked for a receipt automatically).
 */
export function initialWarehouses(
  type: ErpDocType,
  warehouses: Warehouse[],
  requested: string | null,
): { warehouse_id: string | null; target_warehouse_id: string | null } {
  const active = warehouses.filter((w) => !w.archived_at);
  const byKind = (kind: string) => active.find((w) => w.kind === kind)?.id ?? null;
  const preset = active.find((w) => w.id === requested)?.id ?? null;
  const prep = byKind("prep_kitchen");
  if (type === "receipt") return { warehouse_id: preset ?? prep, target_warehouse_id: null };
  const source = preset ?? byKind("warehouse") ?? active[0]?.id ?? null;
  return {
    warehouse_id: source,
    target_warehouse_id:
      type === "transfer" ? (prep && prep !== source ? prep : (active.find((w) => w.id !== source)?.id ?? null)) : null,
  };
}
