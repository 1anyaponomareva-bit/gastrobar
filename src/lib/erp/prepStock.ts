import { ErpHttpError, rpc } from "@/lib/erp/server";
import { getStaffStockItems } from "@/data/staffInStockItems";

if (typeof window !== "undefined") throw new Error("erp/prepStock is server-only");

export type PrepStockMoveType =
  | "produce"
  | "to_warehouse"
  | "to_kitchen"
  | "writeoff_kitchen"
  | "writeoff_warehouse"
  | "set_warehouse"
  | "set_kitchen";

export type PrepStockBalance = {
  itemId: string;
  kitchen: number;
  warehouse: number;
  total: number;
};

export type PrepStockMoveResult = PrepStockBalance & {
  id: string;
  moveType: PrepStockMoveType;
  qty: number;
};

const ITEM_IDS = new Set(getStaffStockItems("gastrofood").map((item) => item.id));
const NO_WAREHOUSE = new Set(
  getStaffStockItems("gastrofood").filter((item) => item.noWarehouse).map((item) => item.id),
);

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBalance(row: Record<string, unknown>): PrepStockBalance {
  return {
    itemId: String(row.item_id ?? row.itemId ?? ""),
    kitchen: num(row.kitchen),
    warehouse: num(row.warehouse),
    total: num(row.total ?? num(row.kitchen) + num(row.warehouse)),
  };
}

export async function listPrepStockBalances(): Promise<PrepStockBalance[]> {
  const raw = await rpc<unknown>("erp_prep_stock_balances", {});
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => asBalance((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
    .filter((row) => row.itemId);
}

export async function movePrepStock(input: {
  itemId: string;
  moveType: PrepStockMoveType;
  qty: number;
  actor: string;
  note?: string | null;
}): Promise<PrepStockMoveResult> {
  const itemId = String(input.itemId || "").trim();
  if (!ITEM_IDS.has(itemId)) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
  if (!Number.isFinite(input.qty) || input.qty < 0) throw new ErpHttpError(400, "ERP_INVALID", "qty");

  const allowWarehouse = !NO_WAREHOUSE.has(itemId);
  if (
    !allowWarehouse &&
    (input.moveType === "to_warehouse" ||
      input.moveType === "to_kitchen" ||
      input.moveType === "writeoff_warehouse" ||
      input.moveType === "set_warehouse")
  ) {
    throw new ErpHttpError(400, "ERP_INVALID", "no_warehouse");
  }

  const raw = await rpc<Record<string, unknown>>("erp_prep_stock_move", {
    p_item_id: itemId,
    p_move_type: input.moveType,
    p_qty: input.qty,
    p_actor: input.actor,
    p_note: input.note ?? null,
    p_allow_warehouse: allowWarehouse,
  });

  const balance = asBalance(raw);
  return {
    ...balance,
    id: String(raw.id ?? ""),
    moveType: String(raw.move_type ?? input.moveType) as PrepStockMoveType,
    qty: num(raw.qty),
  };
}

export async function setPrepStockWarehouseBatch(input: {
  values: { itemId: string; warehouse: number }[];
  actor: string;
}): Promise<{ updated: number; balances: PrepStockBalance[] }> {
  let updated = 0;
  for (const row of input.values) {
    if (!ITEM_IDS.has(row.itemId) || NO_WAREHOUSE.has(row.itemId)) continue;
    if (!Number.isFinite(row.warehouse) || row.warehouse < 0) continue;
    await movePrepStock({
      itemId: row.itemId,
      moveType: "set_warehouse",
      qty: row.warehouse,
      actor: input.actor,
      note: "zalo_paste",
    });
    updated += 1;
  }
  return { updated, balances: await listPrepStockBalances() };
}
