"use client";

/**
 * Prep Stock in Orders — Prep Kitchen ↔ Warehouse balances (variant 1).
 * Static item list for now; later ERP prep items will feed this screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  evaluateStaffStock,
  getStaffStockItems,
  staffStockUnit,
  type StaffStockItem,
} from "@/data/staffInStockItems";
import { STAFF_INVENTORY_VENUE_LABELS } from "@/data/staffInventoryItems";
import {
  errorMessage,
  listPrepStockBalances,
  movePrepStock,
  setPrepStockWarehouseFromPaste,
  type PrepStockBalanceRow,
  type PrepStockMoveType,
} from "@/lib/orders/api";
import {
  getStoredDate,
  getStoredEmployee,
  setStoredDate,
  setStoredEmployee,
  todayIsoDate,
} from "@/lib/staffInventoryStorage";
import { parseStockMessage } from "@/lib/staffStockParser";
import { OrdersError, OrdersLoading } from "./LoadState";
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

export function PrepStockPage() {
  const { t, lang, displayName, email } = useOrders();
  const stockItems = useMemo(() => getStaffStockItems(VENUE), []);
  const [date, setDate] = useState(() => todayIsoDate());
  const [employee, setEmployee] = useState("");
  const [balances, setBalances] = useState<BalanceMap>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
  } | null>(null);
  const [dialogQty, setDialogQty] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listPrepStockBalances();
      setBalances(toMap(rows));
    } catch (err) {
      setError(errorMessage(err, t("error_network"), t("error_load")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee() || displayName || email || "");
    void load();
  }, [displayName, email, load]);

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

  const askMove = (item: StaffStockItem, moveType: PrepStockMoveType, title: string) => {
    setDialog({ item, moveType, title });
    setDialogQty("");
  };

  const submitMove = async () => {
    if (!dialog) return;
    const qty = Number(String(dialogQty).replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0 || (dialog.moveType !== "set_warehouse" && dialog.moveType !== "set_kitchen" && qty <= 0)) {
      window.alert(t("prep_stock_qty_invalid"));
      return;
    }
    setBusyItem(dialog.item.id);
    try {
      const row = await movePrepStock(dialog.item.id, dialog.moveType, qty);
      applyBalance(row);
      setDialog(null);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
      window.alert(
        code === "ERP_INSUFFICIENT"
          ? t("prep_stock_insufficient")
          : errorMessage(err, t("error_network"), t("prep_stock_move_fail")),
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
        values.map((row) => ({
          itemId: row.itemId,
          warehouse: Number(String(row.warehouse).replace(",", ".")) || 0,
        })),
      );
      setBalances(toMap(result.balances));
      setStockPaste("");
      setStockPasteResult({
        filled: result.updated,
        unrecognized: [...unrecognized, ...noWarehouse],
      });
    } catch (err) {
      window.alert(errorMessage(err, t("error_network"), t("prep_stock_move_fail")));
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

  if (loading) return <OrdersLoading />;
  if (error) return <OrdersError text={error} onRetry={() => void load()} />;

  return (
    <div className="orders-prepStock">
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
          const busy = busyItem === item.id;
          return (
            <div key={item.id} className="orders-prepStockCard">
              <div className="orders-prepStockName">
                {label}
                {secondary && secondary !== label ? <span> / {secondary}</span> : null}
                <em className="orders-prepStockUnitTag">{unit}</em>
              </div>

              <div className={`orders-prepStockBalances ${item.noWarehouse ? "single" : ""}`}>
                <div className="orders-prepStockBal">
                  <span>{t("prep_stock_kitchen")}</span>
                  <strong>{fmtQty(bal.kitchen)}</strong>
                </div>
                {item.noWarehouse ? null : (
                  <div className="orders-prepStockBal">
                    <span>{t("prep_stock_warehouse")}</span>
                    <strong>{fmtQty(bal.warehouse)}</strong>
                  </div>
                )}
                <div className="orders-prepStockBal total">
                  <span>{t("prep_stock_total")}</span>
                  <strong>{fmtQty(bal.total)}</strong>
                </div>
              </div>

              <div className="orders-prepStockMoves">
                <button
                  type="button"
                  className="orders-btn dark"
                  disabled={busy}
                  onClick={() => askMove(item, "produce", t("prep_stock_produce"))}
                >
                  {t("prep_stock_produce")}
                </button>
                {item.noWarehouse ? null : (
                  <>
                    <button
                      type="button"
                      className="orders-btn primary"
                      disabled={busy}
                      onClick={() => askMove(item, "to_warehouse", t("prep_stock_to_warehouse"))}
                    >
                      {t("prep_stock_to_warehouse")}
                    </button>
                    <button
                      type="button"
                      className="orders-btn ghost"
                      disabled={busy}
                      onClick={() => askMove(item, "to_kitchen", t("prep_stock_to_kitchen"))}
                    >
                      {t("prep_stock_to_kitchen")}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="orders-btn ghost"
                  disabled={busy}
                  onClick={() => askMove(item, "writeoff_kitchen", t("prep_stock_writeoff_kitchen"))}
                >
                  {t("prep_stock_writeoff_kitchen")}
                </button>
                {item.noWarehouse ? null : (
                  <button
                    type="button"
                    className="orders-btn ghost"
                    disabled={busy}
                    onClick={() =>
                      askMove(item, "writeoff_warehouse", t("prep_stock_writeoff_warehouse"))
                    }
                  >
                    {t("prep_stock_writeoff_warehouse")}
                  </button>
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
                ` · ${staffStockUnit(dialog.item)}`}
            </p>
            <label>
              <span>{t("prep_stock_qty_prompt")}</span>
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
