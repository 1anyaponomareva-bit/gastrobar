import { type StaffStockItem } from "@/data/staffInStockItems";
import { check, ErpHttpError, erpDb, rpc } from "@/lib/erp/server";

if (typeof window !== "undefined") throw new Error("erp/prepStock is server-only");

const PRODUCT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type PrepStockCatalogItem = StaffStockItem & {
  sortOrder: number;
  archived?: boolean;
};

type DbItemRow = {
  id: string;
  name_en: string | null;
  name_ru: string | null;
  name_vn: string | null;
  note: string | null;
  no_warehouse: boolean | null;
  sort_order: number | null;
  archived_at: string | null;
};

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

function fromDbRow(row: DbItemRow): PrepStockCatalogItem {
  return {
    id: String(row.id),
    name: {
      en: String(row.name_en ?? "").trim(),
      ru: String(row.name_ru ?? "").trim(),
      vn: String(row.name_vn ?? "").trim(),
    },
    note: String(row.note ?? "").trim() || undefined,
    noWarehouse: Boolean(row.no_warehouse),
    sortOrder: Number(row.sort_order) || 0,
    archived: Boolean(row.archived_at),
  };
}

function isMissingCatalog(error: { code?: string } | null): boolean {
  return ["PGRST205", "42P01"].includes(error?.code ?? "");
}

async function readCatalogRows(includeArchived: boolean): Promise<DbItemRow[] | null> {
  let query = erpDb()
    .from("erp_prep_stock_items")
    .select("id,name_en,name_ru,name_vn,note,no_warehouse,sort_order,archived_at")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (!includeArchived) query = query.is("archived_at", null);
  const result = await query;
  if (result.error) {
    if (isMissingCatalog(result.error)) return null;
    throw check(result);
  }
  return (result.data ?? []) as DbItemRow[];
}

async function listErpFlaggedPrepStockItems(): Promise<PrepStockCatalogItem[]> {
  const result = await erpDb()
    .from("erp_products")
    .select("id,name_en,name_vn,names,staff_listed,archived_at,staff_sort")
    .eq("staff_listed", true)
    .is("archived_at", null);
  if (result.error) {
    if (["PGRST204", "PGRST205", "42703"].includes(result.error.code ?? "")) return [];
    throw check(result);
  }
  const metaRows = await readCatalogRows(true);
  const metaById = new Map((metaRows ?? []).map((row) => [row.id, row]));
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row, index) => {
    const id = String(row.id);
    const names =
      row.names && typeof row.names === "object" && !Array.isArray(row.names)
        ? (row.names as Record<string, unknown>)
        : {};
    const ru = typeof names.ru === "string" ? names.ru.trim() : "";
    const meta = metaById.get(id);
    return {
      id,
      name: {
        en: String(row.name_en ?? "").trim(),
        ru: ru || String(meta?.name_ru ?? "").trim(),
        vn: String(row.name_vn ?? "").trim() || String(meta?.name_vn ?? "").trim(),
      },
      note: String(meta?.note ?? "").trim() || undefined,
      noWarehouse: Boolean(meta?.no_warehouse),
      sortOrder: Number(meta?.sort_order) || Number(row.staff_sort) || (index + 1) * 10,
      archived: false,
    } satisfies PrepStockCatalogItem;
  });
}

/** Prep Stock catalog = ERP products with «Show in Prep Stock» only. No legacy seed list. */
export async function listPrepStockItems(opts?: {
  includeArchived?: boolean;
}): Promise<PrepStockCatalogItem[]> {
  const includeArchived = Boolean(opts?.includeArchived);
  const active = await listErpFlaggedPrepStockItems();
  if (!includeArchived) {
    return active.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en) || a.id.localeCompare(b.id),
    );
  }
  const rows = await readCatalogRows(true);
  const byId = new Map(active.map((item) => [item.id, item]));
  for (const row of rows ?? []) {
    if (!PRODUCT_UUID.test(row.id)) continue;
    if (byId.has(row.id)) continue;
    byId.set(row.id, fromDbRow(row));
  }
  return [...byId.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en) || a.id.localeCompare(b.id),
  );
}

/** Checkbox staff_listed → upsert/archive matching Prep Stock catalog row (id = product uuid). */
export async function syncPrepStockFromErpProduct(input: {
  productId: string;
  listed: boolean;
  nameEn: string;
  nameRu?: string | null;
  nameVn?: string | null;
  actor: string;
}): Promise<void> {
  const productId = String(input.productId || "").trim();
  if (!productId) return;
  if (input.listed) {
    await upsertPrepStockItem({
      id: productId,
      nameEn: input.nameEn,
      nameRu: String(input.nameRu ?? "").trim(),
      nameVn: String(input.nameVn ?? "").trim(),
      actor: input.actor,
    });
    return;
  }
  const existing = await readCatalogRows(true);
  if (existing === null) return;
  if (!existing.some((row) => row.id === productId && !row.archived_at)) return;
  await archivePrepStockItem({ id: productId, actor: input.actor });
}

async function requireCatalogItem(itemId: string): Promise<PrepStockCatalogItem> {
  const id = String(itemId || "").trim();
  if (!id) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
  const erp = await listErpFlaggedPrepStockItems();
  const fromErp = erp.find((item) => item.id === id);
  if (fromErp) return fromErp;
  throw new ErpHttpError(400, "ERP_INVALID", "item_id");
}

export function slugifyPrepStockId(nameEn: string): string {
  const base = String(nameEn || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `item-${Date.now()}`;
}

export async function upsertPrepStockItem(input: {
  id?: string | null;
  nameEn: string;
  nameRu: string;
  nameVn: string;
  note?: string | null;
  noWarehouse?: boolean;
  actor: string;
}): Promise<PrepStockCatalogItem> {
  const nameEn = String(input.nameEn || "").trim();
  const nameRu = String(input.nameRu || "").trim();
  const nameVn = String(input.nameVn || "").trim();
  const note = String(input.note || "").trim();
  if (!nameEn && !nameRu && !nameVn) {
    throw new ErpHttpError(400, "ERP_INVALID", "name");
  }

  let id = String(input.id || "").trim();
  if (!id) {
    id = slugifyPrepStockId(nameEn || nameRu || nameVn);
    const all = await listPrepStockItems({ includeArchived: true });
    const used = new Set(all.map((item) => item.id));
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
  }

  const existing = await readCatalogRows(true);
  if (existing === null) {
    throw new ErpHttpError(503, "ERP_NOT_INSTALLED", "erp_prep_stock_items");
  }

  const current = existing.find((row) => row.id === id);
  const sortOrder = current
    ? Number(current.sort_order) || 0
    : (existing.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), 0) || 0) + 10;

  const payload = {
    id,
    name_en: nameEn,
    name_ru: nameRu,
    name_vn: nameVn,
    note,
    no_warehouse: Boolean(input.noWarehouse),
    sort_order: sortOrder,
    archived_at: null,
    updated_at: new Date().toISOString(),
    updated_by: input.actor,
  };

  const saved = await erpDb().from("erp_prep_stock_items").upsert(payload, { onConflict: "id" }).select(
    "id,name_en,name_ru,name_vn,note,no_warehouse,sort_order,archived_at",
  ).single();
  return fromDbRow(check(saved) as DbItemRow);
}

export async function archivePrepStockItem(input: {
  id: string;
  actor: string;
}): Promise<{ id: string }> {
  const id = String(input.id || "").trim();
  if (!id) throw new ErpHttpError(400, "ERP_INVALID", "id");
  const result = await erpDb()
    .from("erp_prep_stock_items")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: input.actor,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (result.error) {
    if (isMissingCatalog(result.error)) {
      throw new ErpHttpError(503, "ERP_NOT_INSTALLED", "erp_prep_stock_items");
    }
    throw check(result);
  }
  if (!result.data) throw new ErpHttpError(404, "ERP_NOT_FOUND", "item");
  return { id };
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
  const item = await requireCatalogItem(input.itemId);
  if (!Number.isFinite(input.qty) || input.qty < 0) throw new ErpHttpError(400, "ERP_INVALID", "qty");

  const allowWarehouse = !item.noWarehouse;
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
    p_item_id: item.id,
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
  const items = await listPrepStockItems();
  const byId = new Map(items.map((item) => [item.id, item]));
  let updated = 0;
  for (const row of input.values) {
    const item = byId.get(row.itemId);
    if (!item || item.noWarehouse) continue;
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

export type PrepStockTransferDirection = "to_warehouse" | "to_kitchen";
export type PrepStockTransferStatus = "pending" | "received" | "cancelled";

export type PrepStockTransfer = {
  id: string;
  itemId: string;
  direction: PrepStockTransferDirection;
  qty: number;
  status: PrepStockTransferStatus;
  actor: string;
  note: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
};

export type PrepStockTransferResult = PrepStockTransfer & {
  kitchen?: number;
  warehouse?: number;
  total?: number;
};

function asTransfer(row: Record<string, unknown>): PrepStockTransfer {
  const direction = String(row.direction ?? "") as PrepStockTransferDirection;
  const status = String(row.status ?? "") as PrepStockTransferStatus;
  return {
    id: String(row.id ?? ""),
    itemId: String(row.item_id ?? row.itemId ?? ""),
    direction: direction === "to_kitchen" ? "to_kitchen" : "to_warehouse",
    qty: num(row.qty),
    status:
      status === "received" ? "received" : status === "cancelled" ? "cancelled" : "pending",
    actor: String(row.actor ?? ""),
    note: row.note == null || row.note === "" ? null : String(row.note),
    createdAt: row.created_at == null ? null : String(row.created_at),
    receivedAt: row.received_at == null ? null : String(row.received_at),
    receivedBy: row.received_by == null ? null : String(row.received_by),
  };
}

export async function getPrepStockSettings(): Promise<{ zaloUrl: string | null }> {
  try {
    const raw = await rpc<Record<string, unknown>>("erp_prep_stock_settings_get", {});
    const url = raw?.zalo_url;
    return { zaloUrl: url == null || url === "" ? null : String(url) };
  } catch (error) {
    if (error instanceof ErpHttpError && error.code === "ERP_NOT_INSTALLED") {
      return { zaloUrl: null };
    }
    throw error;
  }
}

export async function setPrepStockSettings(input: {
  zaloUrl: string | null;
  actor: string;
}): Promise<{ zaloUrl: string | null }> {
  const raw = await rpc<Record<string, unknown>>("erp_prep_stock_settings_set", {
    p_zalo_url: input.zaloUrl,
    p_actor: input.actor,
  });
  const url = raw?.zalo_url;
  return { zaloUrl: url == null || url === "" ? null : String(url) };
}

export async function listPrepStockTransfers(status?: PrepStockTransferStatus | null): Promise<PrepStockTransfer[]> {
  const raw = await rpc<unknown>("erp_prep_stock_transfers_list", {
    p_status: status ?? null,
  });
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => asTransfer((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
    .filter((row) => row.id && row.itemId);
}

export async function getPrepStockTransfer(id: string): Promise<PrepStockTransfer> {
  const raw = await rpc<unknown>("erp_prep_stock_transfer_get", { p_transfer_id: id });
  if (!raw || raw === null || typeof raw !== "object") {
    throw new ErpHttpError(404, "ERP_NOT_FOUND", "transfer");
  }
  const transfer = asTransfer(raw as Record<string, unknown>);
  if (!transfer.id) throw new ErpHttpError(404, "ERP_NOT_FOUND", "transfer");
  return transfer;
}

export async function createPrepStockTransfer(input: {
  itemId: string;
  direction: PrepStockTransferDirection;
  qty: number;
  actor: string;
  note?: string | null;
}): Promise<PrepStockTransferResult> {
  const item = await requireCatalogItem(input.itemId);
  if (item.noWarehouse) throw new ErpHttpError(400, "ERP_INVALID", "no_warehouse");
  if (!Number.isFinite(input.qty) || input.qty <= 0) throw new ErpHttpError(400, "ERP_INVALID", "qty");
  if (input.direction !== "to_warehouse" && input.direction !== "to_kitchen") {
    throw new ErpHttpError(400, "ERP_INVALID", "direction");
  }

  const raw = await rpc<Record<string, unknown>>("erp_prep_stock_transfer_create", {
    p_item_id: item.id,
    p_direction: input.direction,
    p_qty: input.qty,
    p_actor: input.actor,
    p_note: input.note ?? null,
    p_allow_warehouse: true,
  });

  const transfer = asTransfer(raw);
  return {
    ...transfer,
    kitchen: num(raw.kitchen),
    warehouse: num(raw.warehouse),
    total: num(raw.total),
  };
}

export async function receivePrepStockTransfer(input: {
  transferId: string;
  actor: string;
}): Promise<PrepStockTransferResult> {
  const raw = await rpc<Record<string, unknown>>("erp_prep_stock_transfer_receive", {
    p_transfer_id: input.transferId,
    p_actor: input.actor,
  });
  const transfer = asTransfer(raw);
  return {
    ...transfer,
    kitchen: num(raw.kitchen),
    warehouse: num(raw.warehouse),
    total: num(raw.total),
  };
}
