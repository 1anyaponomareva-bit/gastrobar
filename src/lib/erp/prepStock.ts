import {
  getStaffStockItems,
  type StaffStockItem,
} from "@/data/staffInStockItems";
import { check, ErpHttpError, erpDb, rpc } from "@/lib/erp/server";

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

function seedRows(): PrepStockCatalogItem[] {
  return getStaffStockItems("gastrofood").map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 10,
    archived: false,
  }));
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

async function seedCatalogIfEmpty(): Promise<PrepStockCatalogItem[]> {
  const existing = await readCatalogRows(true);
  if (existing === null) return seedRows();
  if (existing.length > 0) {
    return existing.filter((row) => !row.archived_at).map(fromDbRow);
  }

  const seed = seedRows();
  const payload = seed.map((item) => ({
    id: item.id,
    name_en: item.name.en,
    name_ru: item.name.ru,
    name_vn: item.name.vn,
    note: item.note ?? "",
    no_warehouse: Boolean(item.noWarehouse),
    sort_order: item.sortOrder,
    updated_at: new Date().toISOString(),
    updated_by: "seed",
  }));
  const inserted = await erpDb().from("erp_prep_stock_items").upsert(payload, { onConflict: "id" });
  if (inserted.error) {
    if (isMissingCatalog(inserted.error)) return seed;
    throw check(inserted);
  }
  return seed;
}

export async function listPrepStockItems(opts?: {
  includeArchived?: boolean;
}): Promise<PrepStockCatalogItem[]> {
  const includeArchived = Boolean(opts?.includeArchived);
  const rows = await readCatalogRows(includeArchived);
  if (rows === null) return seedRows();
  if (rows.length === 0) return seedCatalogIfEmpty();
  return rows.map(fromDbRow).filter((item) => includeArchived || !item.archived);
}

async function requireCatalogItem(itemId: string): Promise<PrepStockCatalogItem> {
  const id = String(itemId || "").trim();
  if (!id) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
  const result = await erpDb()
    .from("erp_prep_stock_items")
    .select("id,name_en,name_ru,name_vn,note,no_warehouse,sort_order,archived_at")
    .eq("id", id)
    .maybeSingle();
  if (result.error) {
    if (isMissingCatalog(result.error)) {
      const fallback = seedRows().find((item) => item.id === id);
      if (!fallback) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
      return fallback;
    }
    throw check(result);
  }
  if (!result.data) {
    // First-time seed may not have run yet.
    const seeded = await seedCatalogIfEmpty();
    const found = seeded.find((item) => item.id === id && !item.archived);
    if (!found) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
    return found;
  }
  if (result.data.archived_at) throw new ErpHttpError(400, "ERP_INVALID", "item_id");
  return fromDbRow(result.data as DbItemRow);
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
  if (existing.length === 0) await seedCatalogIfEmpty();

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
