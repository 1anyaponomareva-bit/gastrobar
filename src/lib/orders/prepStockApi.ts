/**
 * Lightweight Prep Stock client API — keep out of the huge orders/api bundle
 * so the PREP STOCK tab opens faster on mobile.
 */

export type PrepStockBalanceRow = {
  itemId: string;
  kitchen: number;
  warehouse: number;
  total: number;
};

export type PrepStockCatalogItemRow = {
  id: string;
  name: { en: string; ru: string; vn: string };
  note: string;
  noWarehouse: boolean;
  sortOrder: number;
};

export type PrepStockMoveType =
  | "produce"
  | "to_warehouse"
  | "to_kitchen"
  | "writeoff_kitchen"
  | "writeoff_warehouse"
  | "set_warehouse"
  | "set_kitchen";

export class PrepStockApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string,
  ) {
    super(detail || code);
    this.name = "PrepStockApiError";
  }
}

const CACHE_KEY = "gf_prep_stock_balances_v1";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function balanceOf(row: Record<string, unknown>): PrepStockBalanceRow {
  return {
    itemId: String(pick(row, "itemId", "item_id") ?? ""),
    kitchen: Number(pick(row, "kitchen") ?? 0) || 0,
    warehouse: Number(pick(row, "warehouse") ?? 0) || 0,
    total: Number(pick(row, "total") ?? 0) || 0,
  };
}

function balancesOf(data: unknown): PrepStockBalanceRow[] {
  const obj = asRecord(data);
  const list = Array.isArray(obj.balances) ? obj.balances : Array.isArray(data) ? data : [];
  return list
    .map((row) => balanceOf(asRecord(row)))
    .filter((row) => row.itemId);
}

export function readPrepStockBalanceCache(): PrepStockBalanceRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const rows = balancesOf({ balances: parsed });
    return rows.length ? rows : Array.isArray(parsed) ? balancesOf({ balances: parsed }) : null;
  } catch {
    return null;
  }
}

export function writePrepStockBalanceCache(rows: PrepStockBalanceRow[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* private mode */
  }
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PrepStockApiError(0, "network", "Failed to fetch");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const obj = asRecord(data);
    throw new PrepStockApiError(
      response.status,
      String(obj.error ?? obj.code ?? `HTTP ${response.status}`),
      typeof obj.detail === "string" ? obj.detail : undefined,
    );
  }
  return data;
}

export async function listPrepStockBalances(): Promise<PrepStockBalanceRow[]> {
  const rows = balancesOf(await postJson("/api/orders/prep-stock"));
  writePrepStockBalanceCache(rows);
  return rows;
}

function catalogItemsOf(data: unknown): PrepStockCatalogItemRow[] {
  const obj = asRecord(data);
  const list = Array.isArray(obj.items) ? obj.items : [];
  return list
    .map((row) => {
      const r = asRecord(row);
      const name = asRecord(r.name);
      return {
        id: String(r.id ?? ""),
        name: {
          en: String(name.en ?? ""),
          ru: String(name.ru ?? ""),
          vn: String(name.vn ?? ""),
        },
        note: String(r.note ?? ""),
        noWarehouse: Boolean(r.noWarehouse ?? r.no_warehouse),
        sortOrder: Number(r.sortOrder ?? r.sort_order ?? 0) || 0,
      };
    })
    .filter((row) => row.id);
}

export async function listPrepStockCatalogItems(): Promise<PrepStockCatalogItemRow[]> {
  return catalogItemsOf(await postJson("/api/orders/prep-stock/items"));
}

export async function listAdminPrepStockItems(): Promise<PrepStockCatalogItemRow[]> {
  return catalogItemsOf(await postJson("/api/orders/admin/prep-stock-items"));
}

export async function saveAdminPrepStockItem(payload: {
  id?: string | null;
  nameEn: string;
  nameRu: string;
  nameVn: string;
  note: string;
  noWarehouse: boolean;
}): Promise<PrepStockCatalogItemRow> {
  const data = asRecord(
    await postJson("/api/orders/admin/prep-stock-items", {
      action: "upsert",
      ...payload,
    }),
  );
  const items = catalogItemsOf({ items: [pick(data, "item") ?? data] });
  if (!items[0]) throw new PrepStockApiError(500, "server", "item");
  return items[0];
}

export async function archiveAdminPrepStockItem(id: string): Promise<void> {
  await postJson("/api/orders/admin/prep-stock-items", { action: "archive", id });
}

export type PrepStockTransferRow = {
  id: string;
  itemId: string;
  direction: "to_warehouse" | "to_kitchen";
  qty: number;
  status: "pending" | "received" | "cancelled";
  actor: string;
  note: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
};

function transferOf(row: Record<string, unknown>): PrepStockTransferRow {
  const direction = String(pick(row, "direction") ?? "");
  const status = String(pick(row, "status") ?? "");
  return {
    id: String(pick(row, "id") ?? ""),
    itemId: String(pick(row, "itemId", "item_id") ?? ""),
    direction: direction === "to_kitchen" ? "to_kitchen" : "to_warehouse",
    qty: Number(pick(row, "qty") ?? 0) || 0,
    status:
      status === "received" ? "received" : status === "cancelled" ? "cancelled" : "pending",
    actor: String(pick(row, "actor") ?? ""),
    note: (() => {
      const note = pick(row, "note");
      return note == null || note === "" ? null : String(note);
    })(),
    createdAt: (() => {
      const v = pick(row, "createdAt", "created_at");
      return v == null ? null : String(v);
    })(),
    receivedAt: (() => {
      const v = pick(row, "receivedAt", "received_at");
      return v == null ? null : String(v);
    })(),
    receivedBy: (() => {
      const v = pick(row, "receivedBy", "received_by");
      return v == null ? null : String(v);
    })(),
  };
}

function transfersOf(data: unknown): PrepStockTransferRow[] {
  const obj = asRecord(data);
  const list = Array.isArray(obj.transfers) ? obj.transfers : Array.isArray(data) ? data : [];
  return list
    .map((row) => transferOf(asRecord(row)))
    .filter((row) => row.id && row.itemId);
}

export async function listPrepStockTransfers(
  status?: "pending" | "received" | "cancelled",
): Promise<PrepStockTransferRow[]> {
  const path = status
    ? `/api/orders/prep-stock/transfers?status=${encodeURIComponent(status)}`
    : "/api/orders/prep-stock/transfers";
  return transfersOf(await postJson(path));
}

export async function getPrepStockTransfer(id: string): Promise<PrepStockTransferRow> {
  const data = asRecord(await postJson(`/api/orders/prep-stock/transfers/${encodeURIComponent(id)}`));
  const transfer = transferOf(asRecord(pick(data, "transfer") ?? data));
  if (!transfer.id) throw new PrepStockApiError(404, "ERP_NOT_FOUND", "transfer");
  return transfer;
}

export async function createPrepStockTransfer(
  itemId: string,
  direction: "to_warehouse" | "to_kitchen",
  qty: number,
  note?: string,
): Promise<{ transfer: PrepStockTransferRow; balance: PrepStockBalanceRow }> {
  const data = asRecord(
    await postJson("/api/orders/prep-stock/transfers", { itemId, direction, qty, note }),
  );
  const transfer = transferOf(asRecord(pick(data, "transfer") ?? data));
  const balance = balanceOf(asRecord(pick(data, "balance") ?? {}));
  if (balance.itemId) {
    const cached = readPrepStockBalanceCache() ?? [];
    writePrepStockBalanceCache(
      cached.filter((row) => row.itemId !== balance.itemId).concat([balance]),
    );
  }
  return { transfer, balance };
}

export async function receivePrepStockTransfer(
  id: string,
): Promise<{ transfer: PrepStockTransferRow; balance: PrepStockBalanceRow }> {
  const data = asRecord(
    await postJson(`/api/orders/prep-stock/transfers/${encodeURIComponent(id)}`, {
      action: "receive",
    }),
  );
  const transfer = transferOf(asRecord(pick(data, "transfer") ?? data));
  const balance = balanceOf(asRecord(pick(data, "balance") ?? {}));
  if (balance.itemId) {
    const cached = readPrepStockBalanceCache() ?? [];
    writePrepStockBalanceCache(
      cached.filter((row) => row.itemId !== balance.itemId).concat([balance]),
    );
  }
  return { transfer, balance };
}

export async function getPrepStockSettings(): Promise<{ zaloUrl: string | null }> {
  const data = asRecord(await postJson("/api/orders/prep-stock/settings"));
  const url = pick(data, "zaloUrl", "zalo_url");
  return { zaloUrl: url == null || url === "" ? null : String(url) };
}

export async function savePrepStockSettings(zaloUrl: string): Promise<{ zaloUrl: string | null }> {
  const data = asRecord(
    await postJson("/api/orders/prep-stock/settings", { zaloUrl }),
  );
  const url = pick(data, "zaloUrl", "zalo_url");
  return { zaloUrl: url == null || url === "" ? null : String(url) };
}

export async function movePrepStock(
  itemId: string,
  moveType: PrepStockMoveType,
  qty: number,
  note?: string,
): Promise<PrepStockBalanceRow> {
  const data = asRecord(await postJson("/api/orders/prep-stock/move", { itemId, moveType, qty, note }));
  const balance = balanceOf(asRecord(pick(data, "balance") ?? data));
  const cached = readPrepStockBalanceCache() ?? [];
  const next = cached.filter((row) => row.itemId !== balance.itemId).concat(balance.itemId ? [balance] : []);
  writePrepStockBalanceCache(next);
  return balance;
}

export async function setPrepStockWarehouseFromPaste(
  values: { itemId: string; warehouse: number }[],
): Promise<{ updated: number; balances: PrepStockBalanceRow[] }> {
  const data = asRecord(await postJson("/api/orders/prep-stock/set-warehouse", { values }));
  const balances = balancesOf(data);
  writePrepStockBalanceCache(balances);
  return {
    updated: Number(pick(data, "updated") ?? 0) || 0,
    balances,
  };
}

export function prepStockErrorMessage(error: unknown, networkText: string, genericText: string): string {
  if (error instanceof PrepStockApiError) {
    if (error.code === "network") return networkText;
    if (error.code === "ERP_INSUFFICIENT") return error.code;
    if (error.detail) return error.detail;
    if (error.code && error.code !== "server") return error.code;
  }
  return genericText;
}
