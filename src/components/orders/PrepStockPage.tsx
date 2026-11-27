"use client";

/**
 * Prep Stock in Orders — Prep Kitchen ↔ Warehouse balances (variant 1).
 * Static item list for now; later ERP prep items will feed this screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  combinePackQty,
  evaluateStaffStock,
  getStaffStockItems,
  splitPackQty,
  staffStockPackSize,
  staffStockUnit,
  type StaffStockItem,
} from "@/data/staffInStockItems";
import { STAFF_INVENTORY_VENUE_LABELS } from "@/data/staffInventoryItems";
import {
  listPrepStockBalances,
  movePrepStock,
  PrepStockApiError,
  prepStockErrorMessage,
  readPrepStockBalanceCache,
  setPrepStockWarehouseFromPaste,
  type PrepStockBalanceRow,
  type PrepStockMoveType,
} from "@/lib/orders/prepStockApi";
import {
  getStoredDate,
  getStoredEmployee,
  setStoredDate,
  setStoredEmployee,
  todayIsoDate,
} from "@/lib/staffInventoryStorage";
import { parseStockMessage } from "@/lib/staffStockParser";
import { OrdersError } from "./LoadState";
import { useOrders } from "./OrdersShell";

const VENUE = "gastrofood" as const;
const VENUE_LABEL = STAFF_INVENTORY_VENUE_LABELS[VENUE];

type BalanceMap = Record<string, { kitchen: number; warehouse: number; total: number }>;

function toMap(rows: PrepStockBalanceRow[]): BalanceMap {
  const next: BalanceMap = {};
  for (const row of rows) {
    next[row.itemId] = {
      kitchen: row.kitchen,
      warehouse: row.warehouse,
      total: row.total,
    };
  }
  return next;
}

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function fmtBalance(
  value: number,
  item: StaffStockItem,
  labels: { pack: string; packs: string; pcs: string },
): string {
  const packSize = staffStockPackSize(item);
  if (!packSize) return fmtQty(value);
  const { packs, pcs } = splitPackQty(value, packSize);
  if (packs <= 0 && pcs <= 0) return "0";
  if (packs <= 0) return `${pcs} ${labels.pcs}`;
  if (pcs <= 0) return `${packs} ${packs === 1 ? labels.pack : labels.packs}`;
  return `${packs} ${packs === 1 ? labels.pack : labels.packs} + ${pcs} ${labels.pcs}`;
}

function parseLooseNumber(raw: string): number {
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function PrepStockPage() {
  const { t, lang, displayName, email } = useOrders();
  const stockItems = useMemo(() => getStaffStockItems(VENUE), []);
  const [date, setDate] = useState(() => todayIsoDate());
  const [employee, setEmployee] = useState("");
  const [balances, setBalances] = useState<BalanceMap>(() => {
    const cached = readPrepStockBalanceCache();
    return cached ? toMap(cached) : {};
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [stockPaste, setStockPaste] = useState("");
  const [stockPasteResult, setStockPasteResult] = useState<{
    filled: number;
    unrecognized: string[];
  } | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [dialog, setDialog] = useState<{
    item: StaffStockItem;
    moveType: PrepStockMoveType;
    title: string;
    mode: "add" | "set";
  } | null>(null);
  const [dialogQty, setDialogQty] = useState("");
  const [dialogPacks, setDialogPacks] = useState("");
  const [dialogPcs, setDialogPcs] = useState("");

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setRefreshing(true);
    setError(null);
    try {
      const rows = await listPrepStockBalances();
      setBalances(toMap(rows));
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
    if (packSize) {
      if (opts?.initialQty != null && Number.isFinite(opts.initialQty)) {
        const split = splitPackQty(opts.initialQty, packSize);
        setDialogPacks(split.packs ? String(split.packs) : "");
        setDialogPcs(split.pcs ? String(split.pcs) : "");
      } else {
        setDialogPacks("");
        setDialogPcs("");
      }
      setDialogQty("");
    } else {
      setDialogQty(
        opts?.initialQty != null && Number.isFinite(opts.initialQty) ? fmtQty(opts.initialQty) : "",
      );
      setDialogPacks("");
      setDialogPcs("");
    }
  };

  const itemById = useCallback(
    (id: string) => stockItems.find((item) => item.id === id) ?? null,
    [stockItems],
  );

  const submitMove = async () => {
    if (!dialog) return;
    const packSize = staffStockPackSize(dialog.item);
    let qty: number;
    if (packSize) {
      const packs = dialogPacks.trim() === "" ? 0 : parseLooseNumber(dialogPacks);
      const pcs = dialogPcs.trim() === "" ? 0 : parseLooseNumber(dialogPcs);
      if (!Number.isFinite(packs) || !Number.isFinite(pcs) || packs < 0 || pcs < 0) {
        window.alert(t("prep_stock_qty_invalid"));
        return;
      }
      qty = combinePackQty(packs, pcs, packSize);
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

  const handleStockPasteApply = async () => {
    const { values, unrecognized, noWarehouse } = parseStockMessage(stockPaste, stockItems);
    if (!values.length) {
      setStockPasteResult({ filled: 0, unrecognized: [...unrecognized, ...noWarehouse] });
      return;
    }
    setBusyItem("__paste__");
    try {
      const result = await setPrepStockWarehouseFromPaste(
        values.map((row) => {
          const item = itemById(row.itemId);
          const raw = Number(String(row.warehouse).replace(",", ".")) || 0;
          const packSize = item ? staffStockPackSize(item) : null;
          // Zalo warehouse messages are pack counts when the item is packed.
          return {
            itemId: row.itemId,
            warehouse: packSize ? combinePackQty(raw, 0, packSize) : raw,
          };
        }),
      );
      setBalances(toMap(result.balances));
      setStockPaste("");
      setStockPasteResult({
        filled: result.updated,
        unrecognized: [...unrecognized, ...noWarehouse],
      });
    } catch (err) {
      window.alert(prepStockErrorMessage(err, t("error_network"), t("prep_stock_move_fail")));
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

  const overviewRows = useMemo(() => {
    return stockItems.map((item) => {
      const bal = balances[item.id] ?? { kitchen: 0, warehouse: 0, total: 0 };
      return {
        id: item.id,
        item,
        name: item.name[lang] || item.name.en,
        unit: staffStockUnit(item),
        packSize: staffStockPackSize(item),
        kitchen: bal.kitchen,
        warehouse: item.noWarehouse ? null : bal.warehouse,
        total: bal.total,
        hasStock: bal.total > 0,
      };
    });
  }, [balances, lang, stockItems]);

  const overviewInStock = useMemo(() => overviewRows.filter((row) => row.hasStock), [overviewRows]);
  const kitchenSum = useMemo(
    () => overviewRows.reduce((sum, row) => sum + row.kitchen, 0),
    [overviewRows],
  );
  const warehouseSum = useMemo(
    () => overviewRows.reduce((sum, row) => sum + (row.warehouse ?? 0), 0),
    [overviewRows],
  );
  const packLabels = useMemo(
    () => ({
      pack: t("prep_stock_pack_one"),
      packs: t("prep_stock_packs_short"),
      pcs: t("prep_stock_pcs_short"),
    }),
    [t],
  );

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

      <p className="orders-prepStockMode">
        {t("prep_stock_mode", { venue: VENUE_LABEL, count: stockItems.length })}
      </p>
      <p className="orders-prepStockNote">{t("prep_stock_temp_note")}</p>
      <p className="orders-prepStockNote">{t("prep_stock_pack_note", { size: 20 })}</p>

      <section className="orders-prepStockOverview" aria-label={t("prep_stock_overview_title")}>
        <div className="orders-prepStockOverviewHead">
          <h2>{t("prep_stock_overview_title")}</h2>
          <div className="orders-prepStockOverviewTotals">
            <span>
              {t("prep_stock_kitchen")}: <strong>{fmtQty(kitchenSum)} pcs</strong>
            </span>
            <span>
              {t("prep_stock_warehouse")}: <strong>{fmtQty(warehouseSum)} pcs</strong>
            </span>
            <span>
              {t("prep_stock_total")}: <strong>{fmtQty(kitchenSum + warehouseSum)} pcs</strong>
            </span>
          </div>
        </div>
        {overviewInStock.length === 0 ? (
          <p className="orders-prepStockOverviewEmpty">{t("prep_stock_overview_empty")}</p>
        ) : (
          <div className="orders-prepStockOverviewTableWrap">
            <table className="orders-prepStockOverviewTable">
              <thead>
                <tr>
                  <th>{t("prep_stock_overview_item")}</th>
                  <th>{t("prep_stock_kitchen")}</th>
                  <th>{t("prep_stock_warehouse")}</th>
                  <th>{t("prep_stock_total")}</th>
                </tr>
              </thead>
              <tbody>
                {overviewInStock.map((row) => {
                  const item = itemById(row.id);
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="orders-prepStockOverviewName">{row.name}</span>
                        <em>{row.unit}</em>
                      </td>
                      <td>
                        {item ? (
                          <button
                            type="button"
                            className="orders-prepStockOverviewCellBtn"
                            onClick={() =>
                              askMove(item, "set_kitchen", t("prep_stock_set_kitchen"), {
                                mode: "set",
                                initialQty: row.kitchen,
                              })
                            }
                          >
                            {fmtBalance(row.kitchen, item, packLabels)}
                          </button>
                        ) : (
                          fmtBalance(row.kitchen, row.item, packLabels)
                        )}
                      </td>
                      <td>
                        {row.warehouse == null || !item ? (
                          "—"
                        ) : (
                          <button
                            type="button"
                            className="orders-prepStockOverviewCellBtn"
                            onClick={() =>
                              askMove(item, "set_warehouse", t("prep_stock_set_warehouse"), {
                                mode: "set",
                                initialQty: row.warehouse ?? 0,
                              })
                            }
                          >
                            {fmtBalance(row.warehouse, item, packLabels)}
                          </button>
                        )}
                      </td>
                      <td>{fmtBalance(row.total, row.item, packLabels)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="orders-prepStockPaste">
        <label htmlFor="orders-prep-stock-paste">{t("prep_stock_paste_title")}</label>
        <textarea
          id="orders-prep-stock-paste"
          rows={5}
          placeholder={t("prep_stock_paste_placeholder")}
          value={stockPaste}
          onChange={(event) => {
            setStockPaste(event.target.value);
            setStockPasteResult(null);
          }}
        />
        <button
          type="button"
          className="orders-btn primary"
          onClick={() => void handleStockPasteApply()}
          disabled={!stockPaste.trim() || busyItem === "__paste__"}
        >
          {busyItem === "__paste__" ? t("prep_stock_busy") : t("prep_stock_paste_apply")}
        </button>
        {stockPasteResult ? (
          <div
            className={`orders-prepStockPasteResult ${stockPasteResult.filled ? "" : "error"}`}
            role="status"
          >
            {stockPasteResult.filled
              ? t("prep_stock_paste_filled", { count: stockPasteResult.filled })
              : t("prep_stock_paste_nothing")}
            {stockPasteResult.unrecognized.length ? (
              <div className="orders-prepStockUnknown">
                {t("prep_stock_paste_unrecognized")}
                <ul>
                  {stockPasteResult.unrecognized.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="orders-prepStockList">
        {stockItems.map((item) => {
          const label = item.name[lang] || item.name.en;
          const secondary = lang === "en" ? item.name.vn : item.name.en;
          const bal = balances[item.id] ?? { kitchen: 0, warehouse: 0, total: 0 };
          const unit = staffStockUnit(item);
          const packSize = staffStockPackSize(item);
          const busy = busyItem === item.id;
          return (
            <div key={item.id} className="orders-prepStockCard">
              <div className="orders-prepStockName">
                {label}
                {secondary && secondary !== label ? <span> / {secondary}</span> : null}
                <em className="orders-prepStockUnitTag">
                  {packSize ? t("prep_stock_pack_unit", { size: packSize }) : unit}
                </em>
              </div>

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
                  <span>{t("prep_stock_kitchen")}</span>
                  <strong>{fmtBalance(bal.kitchen, item, packLabels)}</strong>
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
                    <span>{t("prep_stock_warehouse")}</span>
                    <strong>{fmtBalance(bal.warehouse, item, packLabels)}</strong>
                    <em>{t("prep_stock_tap_edit")}</em>
                  </button>
                )}
                <div className="orders-prepStockBal total">
                  <span>{t("prep_stock_total")}</span>
                  <strong>{fmtBalance(bal.total, item, packLabels)}</strong>
                </div>
              </div>

              <p className="orders-prepStockMoveHint">{t("prep_stock_move_hint")}</p>
              <div className="orders-prepStockMoves">
                <button
                  type="button"
                  className="orders-btn dark"
                  disabled={busy}
                  onClick={() => askMove(item, "produce", t("prep_stock_produce"), { mode: "add" })}
                >
                  {t("prep_stock_produce")}
                </button>
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
            <p>
              {(dialog.item.name[lang] || dialog.item.name.en) +
                ` · ${
                  staffStockPackSize(dialog.item)
                    ? t("prep_stock_pack_unit", { size: staffStockPackSize(dialog.item)! })
                    : staffStockUnit(dialog.item)
                }`}
            </p>
            <p className="orders-prepStockModalHint">
              {dialog.mode === "set" ? t("prep_stock_set_hint") : t("prep_stock_add_hint")}
            </p>
            {staffStockPackSize(dialog.item) ? (
              <>
                <p className="orders-prepStockModalHint">
                  {t("prep_stock_pack_size_line", { size: staffStockPackSize(dialog.item)! })}
                </p>
                <div className="orders-prepStockPackInputs">
                  <label>
                    <span>{t("prep_stock_packs")}</span>
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
                      value={dialogPcs}
                      onChange={(event) => setDialogPcs(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submitMove();
                      }}
                    />
                  </label>
                </div>
                <p className="orders-prepStockPackTotal">
                  {t("prep_stock_pack_total_pcs", {
                    qty: combinePackQty(
                      dialogPacks.trim() === "" ? 0 : parseLooseNumber(dialogPacks) || 0,
                      dialogPcs.trim() === "" ? 0 : parseLooseNumber(dialogPcs) || 0,
                      staffStockPackSize(dialog.item)!,
                    ),
                  })}
                </p>
              </>
            ) : (
              <label>
                <span>
                  {dialog.mode === "set" ? t("prep_stock_qty_set_prompt") : t("prep_stock_qty_prompt")}
                </span>
                <input
                  inputMode="decimal"
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
