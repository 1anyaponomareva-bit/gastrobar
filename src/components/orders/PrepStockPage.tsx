"use client";

/**
 * Prep Stock in Orders — Prep Kitchen ↔ Warehouse balances.
 * Semi-finished: packs + loose pcs using ERP order_pack_content_qty (e.g. 20 pcs/bag).
 * Stored qty is always pieces.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  combinePackQty,
  evaluateStaffStock,
  formatPackQty,
  formatPackRule,
  staffStockLabel,
  staffStockNote,
  staffStockPackSize,
  staffStockPackType,
  staffStockUnit,
  splitPackQty,
  type StaffStockItem,
} from "@/data/staffInStockItems";
import { STAFF_INVENTORY_VENUE_LABELS } from "@/data/staffInventoryItems";
import {
  createPrepStockTransfer,
  listPrepStockBalances,
  listPrepStockCatalogItems,
  listPrepStockTransfers,
  movePrepStock,
  PrepStockApiError,
  prepStockErrorMessage,
  readPrepStockBalanceCache,
  type PrepStockBalanceRow,
  type PrepStockMoveType,
  type PrepStockTransferRow,
} from "@/lib/orders/prepStockApi";
import { localizePackType, splitPackAndLoose } from "@/lib/erp/orderPackaging";
import { formatVietnamDateTime, vietnamIsoDate, vietnamTodayIso } from "@/lib/orders/datetime";
import {
  getStoredDate,
  getStoredEmployee,
  setStoredDate,
  setStoredEmployee,
  todayIsoDate,
} from "@/lib/staffInventoryStorage";
import { OrdersError } from "./LoadState";
import { useOrders } from "./OrdersShell";

const VENUE = "gastrofood" as const;
const VENUE_LABEL = STAFF_INVENTORY_VENUE_LABELS[VENUE];

type BalanceMap = Record<
  string,
  { kitchen: number; warehouse: number; total: number; changedAt?: string | null }
>;

function toMap(rows: PrepStockBalanceRow[]): BalanceMap {
  const next: BalanceMap = {};
  for (const row of rows) {
    next[row.itemId] = {
      kitchen: row.kitchen,
      warehouse: row.warehouse,
      total: row.total,
      changedAt: row.changedAt ?? null,
    };
  }
  return next;
}

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function unitLabel(item: StaffStockItem | undefined, pcsLabel: string): string {
  if (!item) return pcsLabel;
  if (staffStockPackSize(item)) return pcsLabel;
  return item.purchaseUnit || item.baseUnit || pcsLabel;
}

function formatBalance(value: number, pcsLabel: string, item?: StaffStockItem, lang = "en"): string {
  const packSize = item ? staffStockPackSize(item) : null;
  if (packSize) {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const parts = formatPackQty(total, packSize, localizePackType(staffStockPackType(item!), lang));
    return `${fmtQty(total)} ${pcsLabel} · ${parts}`;
  }
  const qty = Number(value) || 0;
  const rounded = Math.round(qty * 1000) / 1000;
  if (item && isIngredientPurchase(item) && item.purchaseQtyBase) {
    const split = splitPackAndLoose(rounded, item.purchaseQtyBase);
    const packWord = ingredientPackWord(item, lang);
    const unit = item.purchaseUnit || item.baseUnit || "";
    const parts =
      split.packs > 0 && split.loose > 0
        ? `${split.packs} ${packWord} + ${fmtQty(split.loose)} ${unit}`
        : split.packs > 0
          ? `${split.packs} ${packWord}`
          : split.loose > 0
            ? `${fmtQty(split.loose)} ${unit}`
            : `0 ${packWord}`;
    return `${fmtQty(rounded)} ${unit} · ${parts}`;
  }
  return `${fmtQty(rounded)} ${unitLabel(item, pcsLabel)}`;
}

function isIngredientPurchase(item: StaffStockItem): boolean {
  return item.productType !== "semi_finished" && Boolean(item.purchaseQtyBase && item.purchaseQtyBase > 0);
}

function ingredientPackWord(item: StaffStockItem, lang: string): string {
  return localizePackType(item.purchasePackLabel || "pack", lang);
}

function parseLooseNumber(raw: string): number {
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function PrepStockPage() {
  const router = useRouter();
  const { t, lang, displayName, email } = useOrders();
  const [stockItems, setStockItems] = useState<StaffStockItem[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PrepStockTransferRow[]>([]);
  const [date, setDate] = useState(() => todayIsoDate());
  const [employee, setEmployee] = useState("");
  const [balances, setBalances] = useState<BalanceMap>(() => {
    const cached = readPrepStockBalanceCache();
    return cached ? toMap(cached) : {};
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [dialog, setDialog] = useState<{
    item: StaffStockItem;
    moveType: PrepStockMoveType;
    title: string;
    mode: "add" | "set";
  } | null>(null);
  const [dialogQty, setDialogQty] = useState("");
  const [dialogPacks, setDialogPacks] = useState("");
  const [dialogLoosePcs, setDialogLoosePcs] = useState("");

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setRefreshing(true);
    setError(null);
    try {
      const [rows, catalog, transfers] = await Promise.all([
        listPrepStockBalances(),
        listPrepStockCatalogItems(),
        listPrepStockTransfers("pending").catch(() => [] as PrepStockTransferRow[]),
      ]);
      setBalances(toMap(rows));
      setPendingTransfers(transfers);
      setStockItems(
        catalog.map((item) => ({
          id: item.id,
          name: item.name,
          note: item.note || undefined,
          noWarehouse: item.noWarehouse,
          stockAlertAtOrBelow:
            item.stockAlertAtOrBelow != null && item.stockAlertAtOrBelow >= 0
              ? item.stockAlertAtOrBelow
              : undefined,
          productType: item.productType || undefined,
          baseUnit: item.baseUnit || undefined,
          packSize: item.packSize && item.packSize > 1 ? item.packSize : undefined,
          packType: item.packType || undefined,
          purchasePackLabel: item.purchasePackLabel || undefined,
          purchaseQtyBase: item.purchaseQtyBase && item.purchaseQtyBase > 0 ? item.purchaseQtyBase : undefined,
          purchaseUnit: item.purchaseUnit || undefined,
        })),
      );
    } catch (err) {
      // Keep cached balances on screen if refresh fails.
      setError(prepStockErrorMessage(err, t("error_network"), t("error_load")));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee() || "");
    void load({ quiet: true });
    // Load balances once on mount — do not refetch when session name arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!displayName && !email) return;
    setEmployee((prev) => {
      if (prev.trim()) return prev;
      const next = displayName || email || "";
      if (next) setStoredEmployee(next);
      return next;
    });
  }, [displayName, email]);

  const applyBalance = (row: PrepStockBalanceRow) => {
    setBalances((prev) => ({
      ...prev,
      [row.itemId]: {
        kitchen: row.kitchen,
        warehouse: row.warehouse,
        total: row.total,
        changedAt: row.changedAt ?? new Date().toISOString(),
      },
    }));
  };

  const askMove = (
    item: StaffStockItem,
    moveType: PrepStockMoveType,
    title: string,
    opts?: { mode?: "add" | "set"; initialQty?: number },
  ) => {
    const mode = opts?.mode ?? (moveType === "set_kitchen" || moveType === "set_warehouse" ? "set" : "add");
    setDialog({ item, moveType, title, mode });
    const packSize = staffStockPackSize(item);
    const initial = opts?.initialQty != null && Number.isFinite(opts.initialQty) ? opts.initialQty : null;
    if (packSize && mode === "set" && initial != null) {
      const split = splitPackQty(initial, packSize);
      setDialogPacks(split.packs ? String(split.packs) : "");
      setDialogLoosePcs(split.pcs ? String(split.pcs) : "");
      setDialogQty("");
    } else if (packSize) {
      setDialogPacks("");
      setDialogLoosePcs("");
      setDialogQty("");
    } else if (isIngredientPurchase(item) && mode === "set" && initial != null && item.purchaseQtyBase) {
      const split = splitPackAndLoose(initial, item.purchaseQtyBase);
      setDialogPacks(split.packs ? String(split.packs) : "");
      setDialogLoosePcs(split.loose ? String(split.loose) : "");
      setDialogQty("");
    } else if (isIngredientPurchase(item)) {
      setDialogPacks("");
      setDialogLoosePcs("");
      setDialogQty("");
    } else {
      setDialogPacks("");
      setDialogLoosePcs("");
      setDialogQty(initial != null ? fmtQty(initial) : "");
    }
  };

  const submitMove = async () => {
    if (!dialog) return;
    const packSize = staffStockPackSize(dialog.item);
    let qty: number;
    if (packSize) {
      const packs = parseLooseNumber(dialogPacks || "0");
      const loose = parseLooseNumber(dialogLoosePcs || "0");
      if (!Number.isFinite(packs) || !Number.isFinite(loose) || packs < 0 || loose < 0) {
        window.alert(t("prep_stock_qty_invalid"));
        return;
      }
      qty = combinePackQty(packs, loose, packSize);
    } else if (isIngredientPurchase(dialog.item) && dialog.item.purchaseQtyBase) {
      const packs = parseLooseNumber(dialogPacks || "0");
      const loose = parseLooseNumber(dialogLoosePcs || "0");
      if (!Number.isFinite(packs) || !Number.isFinite(loose) || packs < 0 || loose < 0) {
        window.alert(t("prep_stock_qty_invalid"));
        return;
      }
      qty = Math.round((packs * dialog.item.purchaseQtyBase + loose) * 1000) / 1000;
    } else {
      qty = parseLooseNumber(dialogQty);
    }
    if (
      !Number.isFinite(qty) ||
      qty < 0 ||
      (dialog.mode === "add" && qty <= 0)
    ) {
      window.alert(t("prep_stock_qty_invalid"));
      return;
    }
    setBusyItem(dialog.item.id);
    try {
      if (dialog.moveType === "to_warehouse" || dialog.moveType === "to_kitchen") {
        const { transfer, balance } = await createPrepStockTransfer(
          dialog.item.id,
          dialog.moveType,
          qty,
        );
        applyBalance(balance);
        setDialog(null);
        router.push(`/orders/prep-stock/transfers/${encodeURIComponent(transfer.id)}`);
        return;
      }
      const row = await movePrepStock(dialog.item.id, dialog.moveType, qty);
      applyBalance(row);
      setDialog(null);
    } catch (err) {
      window.alert(
        err instanceof PrepStockApiError && err.code === "ERP_INSUFFICIENT"
          ? t("prep_stock_insufficient")
          : prepStockErrorMessage(err, t("error_network"), t("prep_stock_move_fail")),
      );
    } finally {
      setBusyItem(null);
    }
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    setStoredDate(value);
  };

  const handleEmployeeChange = (value: string) => {
    setEmployee(value);
    setStoredEmployee(value);
  };

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const [{ deliverPdfFile, detectInAppBrowser }, { buildStaffInventoryPdfLabels }, pdf] =
        await Promise.all([
          import("@/lib/deliverPdfFile"),
          import("@/lib/staffInventoryI18n"),
          import("@/lib/staffInventoryPdf"),
        ]);

      if (detectInAppBrowser()) {
        window.alert(t("prep_stock_inapp_blocked"));
        return;
      }

      const stockRows = stockItems.map((item) => {
        const bal = balances[item.id] ?? { kitchen: 0, warehouse: 0, total: 0 };
        const hasRestaurant = true;
        const hasWarehouse = !item.noWarehouse;
        const { lowInHouse, lowWarehouse, task } = evaluateStaffStock(
          item,
          bal.kitchen,
          item.noWarehouse ? null : bal.warehouse,
        );
        return {
          id: item.id,
          name: item.name.en,
          unit: staffStockUnit(item),
          restaurant: bal.kitchen,
          warehouse: bal.warehouse,
          hasRestaurant,
          hasWarehouse,
          noWarehouse: Boolean(item.noWarehouse),
          filled: bal.total > 0,
          lowInHouse,
          lowWarehouse,
          task,
        };
      });

      const labels = buildStaffInventoryPdfLabels(
        lang,
        VENUE_LABEL,
        date,
        employee,
        stockItems.length,
        "staff_pdf_stock_doc_title",
      );
      const blob = await pdf.makeStaffInventoryPdfBlob({
        venueLabel: VENUE_LABEL,
        date,
        employee,
        rows: [],
        stockRows,
        labels,
      });
      const fileName = pdf.getStaffInventoryPdfFileName(VENUE_LABEL, date, "PrepStock");
      const result = await deliverPdfFile(blob, fileName);
      if (result !== "shared" && result !== "cancelled" && result !== "downloaded") {
        window.alert(t("prep_stock_share_error"));
      }
    } catch (error) {
      console.error(error);
      window.alert(t("prep_stock_share_error"));
    } finally {
      setExportingPdf(false);
    }
  }, [balances, date, employee, exportingPdf, lang, stockItems, t]);

  const pcsLabel = t("prep_stock_pcs_short");

  return (
    <div className="orders-prepStock">
      {error ? <OrdersError text={error} onRetry={() => void load()} /> : null}
      {refreshing ? <p className="orders-prepStockRefreshing">{t("loading")}</p> : null}
      <div className="orders-prepStockMeta">
        <label className="orders-prepStockBox">
          <span>{t("prep_stock_date")}</span>
          <input type="date" value={date} onChange={(event) => handleDateChange(event.target.value)} />
        </label>
        <label className="orders-prepStockBox">
          <span>{t("prep_stock_employee")}</span>
          <input
            type="text"
            placeholder={t("prep_stock_employee_placeholder")}
            value={employee}
            onChange={(event) => handleEmployeeChange(event.target.value)}
          />
        </label>
      </div>

      {pendingTransfers.length ? (
        <section className="orders-prepTransferList" aria-label={t("prep_stock_transfers_pending")}>
          <h2 className="orders-prepTransferListTitle">{t("prep_stock_transfers_pending")}</h2>
          {pendingTransfers.map((transfer) => {
            const item = stockItems.find((row) => row.id === transfer.itemId);
            const label = item
              ? staffStockLabel(item, lang)
              : transfer.itemId;
            const note = item ? staffStockNote(item) : "";
            const directionLabel =
              transfer.direction === "to_warehouse"
                ? t("prep_stock_to_warehouse")
                : t("prep_stock_to_kitchen");
            return (
              <Link
                key={transfer.id}
                href={`/orders/prep-stock/transfers/${encodeURIComponent(transfer.id)}`}
                className="orders-prepTransferRow"
              >
                <b>
                  {label}
                  {note ? <span className="orders-prepStockNote"> / {note}</span> : null}
                </b>
                <span>
                  {directionLabel} · {transfer.qty} {pcsLabel}
                </span>
              </Link>
            );
          })}
        </section>
      ) : null}

      <div className="orders-prepStockList">
        {!stockItems.length && !refreshing ? (
          <p className="orders-prepStockMoveHint">{t("prep_stock_catalog_empty")}</p>
        ) : null}
        {stockItems.map((item) => {
          const label = staffStockLabel(item, lang);
          const note = staffStockNote(item);
          const bal = balances[item.id] ?? { kitchen: 0, warehouse: 0, total: 0, changedAt: null };
          const busy = busyItem === item.id;
          const changedLabel = bal.changedAt
            ? t("prep_stock_changed_at", { date: formatVietnamDateTime(bal.changedAt) })
            : t("prep_stock_changed_at_empty");
          const changedTone = bal.changedAt
            ? vietnamIsoDate(bal.changedAt) === vietnamTodayIso()
              ? "today"
              : "stale"
            : "empty";
          return (
            <div key={item.id} className="orders-prepStockCard">
              <div className="orders-prepStockName">
                {label}
                {note ? <span className="orders-prepStockNote"> / {note}</span> : null}
              </div>
              <p className={`orders-prepStockChangedAt ${changedTone}`}>{changedLabel}</p>

              <div className={`orders-prepStockBalances ${item.noWarehouse ? "single" : ""}`}>
                <button
                  type="button"
                  className="orders-prepStockBal tap"
                  disabled={busy}
                  onClick={() =>
                    askMove(item, "set_kitchen", t("prep_stock_set_kitchen"), {
                      mode: "set",
                      initialQty: bal.kitchen,
                    })
                  }
                >
                  <span>PREP</span>
                  <strong>{formatBalance(bal.kitchen, pcsLabel, item, lang)}</strong>
                  <em>{t("prep_stock_tap_edit")}</em>
                </button>
                {item.noWarehouse ? null : (
                  <button
                    type="button"
                    className="orders-prepStockBal tap"
                    disabled={busy}
                    onClick={() =>
                      askMove(item, "set_warehouse", t("prep_stock_set_warehouse"), {
                        mode: "set",
                        initialQty: bal.warehouse,
                      })
                    }
                  >
                    <span>WAREHOUSE</span>
                    <strong>{formatBalance(bal.warehouse, pcsLabel, item, lang)}</strong>
                    <em>{t("prep_stock_tap_edit")}</em>
                  </button>
                )}
                <div className="orders-prepStockBal total">
                  <span>{t("prep_stock_total")}</span>
                  <strong>{formatBalance(bal.total, pcsLabel, item, lang)}</strong>
                </div>
              </div>

              {staffStockPackSize(item) ? (
                <p className="orders-prepStockMoveHint orders-packHintStrong">
                  {formatPackRule(
                    staffStockPackSize(item)!,
                    localizePackType(staffStockPackType(item), lang),
                  )}
                </p>
              ) : isIngredientPurchase(item) ? (
                <p className="orders-prepStockMoveHint orders-packHintStrong">
                  1 {ingredientPackWord(item, lang)} = {fmtQty(item.purchaseQtyBase!)}{" "}
                  {item.purchaseUnit || item.baseUnit || ""}
                </p>
              ) : null}
              <p className="orders-prepStockMoveHint">{t("prep_stock_move_hint_v2")}</p>
              <div className="orders-prepStockMoves">
                {item.productType === "semi_finished" ? (
                  <button
                    type="button"
                    className="orders-btn dark"
                    disabled={busy}
                    onClick={() => askMove(item, "produce", t("prep_stock_produce"), { mode: "add" })}
                  >
                    {t("prep_stock_produce")}
                  </button>
                ) : null}
                {item.noWarehouse ? null : (
                  <>
                    <button
                      type="button"
                      className="orders-btn primary"
                      disabled={busy}
                      onClick={() =>
                        askMove(item, "to_warehouse", t("prep_stock_to_warehouse"), { mode: "add" })
                      }
                    >
                      {t("prep_stock_to_warehouse")}
                    </button>
                    <button
                      type="button"
                      className="orders-btn ghost"
                      disabled={busy}
                      onClick={() =>
                        askMove(item, "to_kitchen", t("prep_stock_to_kitchen"), { mode: "add" })
                      }
                    >
                      {t("prep_stock_to_kitchen")}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="orders-btn primary block orders-prepStockShare"
        onClick={() => void handleExportPdf()}
        disabled={exportingPdf}
      >
        {exportingPdf ? t("prep_stock_sharing") : t("prep_stock_share_pdf")}
      </button>

      {dialog ? (
        <div className="orders-prepStockModal" role="dialog" aria-modal="true">
          <div className="orders-prepStockModalCard">
            <h3>{dialog.title}</h3>
            <p className="orders-prepStockModalItem">
              {staffStockLabel(dialog.item, lang)}
              {staffStockNote(dialog.item) ? ` / ${staffStockNote(dialog.item)}` : ""}
            </p>
            <p className="orders-prepStockModalHint">
              {dialog.moveType === "to_warehouse" || dialog.moveType === "to_kitchen"
                ? t("prep_stock_transfer_create_hint")
                : isIngredientPurchase(dialog.item)
                  ? dialog.mode === "set"
                    ? t("prep_stock_set_hint_packs")
                    : t("prep_stock_add_hint_packs")
                  : dialog.mode === "set"
                    ? t("prep_stock_set_hint")
                    : t("prep_stock_add_hint")}
            </p>
            {staffStockPackSize(dialog.item) ? (
              <>
                <p className="orders-prepStockModalHint orders-packHintStrong">
                  {formatPackRule(
                    staffStockPackSize(dialog.item)!,
                    localizePackType(staffStockPackType(dialog.item), lang),
                  )}
                </p>
                <label>
                  <span>{localizePackType(staffStockPackType(dialog.item), lang)}</span>
                  <input
                    inputMode="numeric"
                    autoFocus
                    value={dialogPacks}
                    onChange={(event) => setDialogPacks(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitMove();
                    }}
                  />
                </label>
                <label>
                  <span>{t("prep_stock_pcs")}</span>
                  <input
                    inputMode="numeric"
                    value={dialogLoosePcs}
                    onChange={(event) => setDialogLoosePcs(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitMove();
                    }}
                  />
                </label>
                <p className="orders-prepStockModalHint">
                  {t("prep_stock_total")}:{" "}
                  {formatPackQty(
                    combinePackQty(
                      parseLooseNumber(dialogPacks || "0") || 0,
                      parseLooseNumber(dialogLoosePcs || "0") || 0,
                      staffStockPackSize(dialog.item)!,
                    ),
                    staffStockPackSize(dialog.item)!,
                    localizePackType(staffStockPackType(dialog.item), lang),
                  )}{" "}
                  ({fmtQty(
                    combinePackQty(
                      parseLooseNumber(dialogPacks || "0") || 0,
                      parseLooseNumber(dialogLoosePcs || "0") || 0,
                      staffStockPackSize(dialog.item)!,
                    ),
                  )}{" "}
                  {pcsLabel})
                </p>
              </>
            ) : isIngredientPurchase(dialog.item) ? (
              <>
                <p className="orders-prepStockModalHint orders-packHintStrong">
                  1 {ingredientPackWord(dialog.item, lang)} = {fmtQty(dialog.item.purchaseQtyBase!)}{" "}
                  {dialog.item.purchaseUnit || dialog.item.baseUnit || ""}
                </p>
                <label>
                  <span>{ingredientPackWord(dialog.item, lang)}</span>
                  <input
                    inputMode="decimal"
                    autoFocus
                    value={dialogPacks}
                    onChange={(event) => setDialogPacks(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitMove();
                    }}
                  />
                </label>
                <label>
                  <span>
                    {t("order_packing_loose", {
                      unit: dialog.item.purchaseUnit || dialog.item.baseUnit || "kg",
                    })}
                  </span>
                  <input
                    inputMode="decimal"
                    value={dialogLoosePcs}
                    onChange={(event) => setDialogLoosePcs(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitMove();
                    }}
                  />
                </label>
                <p className="orders-prepStockModalHint orders-packHintStrong">
                  {t("prep_stock_total")}:{" "}
                  {fmtQty(
                    Math.round(
                      ((parseLooseNumber(dialogPacks || "0") || 0) * (dialog.item.purchaseQtyBase || 0) +
                        (parseLooseNumber(dialogLoosePcs || "0") || 0)) *
                        1000,
                    ) / 1000,
                  )}{" "}
                  {dialog.item.purchaseUnit || dialog.item.baseUnit || ""}
                </p>
              </>
            ) : (
              <label>
                <span>
                  {dialog.mode === "set" ? t("prep_stock_qty_set_prompt") : t("prep_stock_qty_prompt")}
                </span>
                <input
                  inputMode="numeric"
                  autoFocus
                  value={dialogQty}
                  onChange={(event) => setDialogQty(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitMove();
                  }}
                />
              </label>
            )}
            <div className="orders-prepStockModalActions">
              <button type="button" className="orders-btn ghost" onClick={() => setDialog(null)}>
                {t("place_cancel") || "Cancel"}
              </button>
              <button
                type="button"
                className="orders-btn primary"
                disabled={busyItem === dialog.item.id}
                onClick={() => void submitMove()}
              >
                {busyItem === dialog.item.id ? t("prep_stock_busy") : t("prep_stock_move_ok")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
