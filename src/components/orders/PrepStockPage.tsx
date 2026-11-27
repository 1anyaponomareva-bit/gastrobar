"use client";

/**
 * Temporary Prep Stock tab in Orders — same positions and Zalo paste as old /staff.
 * Does NOT sync with ERP полуфабрикаты yet; later prep catalog should feed this list.
 *
 * PDF (pdf-lib + fonts + i18n) loads only when Share is pressed — keeps tab open fast.
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
  clearStoredStockValues,
  getStoredDate,
  getStoredEmployee,
  getStoredStockValue,
  parseNumber,
  setStoredDate,
  setStoredEmployee,
  setStoredStockValue,
  todayIsoDate,
  type StaffStockField,
} from "@/lib/staffInventoryStorage";
import { parseStockMessage } from "@/lib/staffStockParser";
import { useOrders } from "./OrdersShell";

const VENUE = "gastrofood" as const;
const VENUE_LABEL = STAFF_INVENTORY_VENUE_LABELS[VENUE];

type FieldMap = Record<string, { restaurant: string; warehouse: string }>;

function readFields(items: StaffStockItem[]): FieldMap {
  const next: FieldMap = {};
  for (const item of items) {
    next[item.id] = {
      restaurant: getStoredStockValue(VENUE, item.id, "restaurant"),
      warehouse: item.noWarehouse ? "" : getStoredStockValue(VENUE, item.id, "warehouse"),
    };
  }
  return next;
}

export function PrepStockPage() {
  const { t, lang } = useOrders();
  const stockItems = useMemo(() => getStaffStockItems(VENUE), []);
  const [date, setDate] = useState(() => todayIsoDate());
  const [employee, setEmployee] = useState("");
  const [fields, setFields] = useState<FieldMap>(() => readFields(stockItems));
  const [stockPaste, setStockPaste] = useState("");
  const [stockPasteResult, setStockPasteResult] = useState<{
    filled: number;
    unrecognized: string[];
  } | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee());
    setFields(readFields(stockItems));
    setHydrated(true);
  }, [stockItems]);

  const handleStockFieldChange = (itemId: string, field: StaffStockField, value: string) => {
    setStoredStockValue(VENUE, itemId, field, value);
    setFields((prev) => ({
      ...prev,
      [itemId]: {
        restaurant: field === "restaurant" ? value : (prev[itemId]?.restaurant ?? ""),
        warehouse: field === "warehouse" ? value : (prev[itemId]?.warehouse ?? ""),
      },
    }));
  };

  const handleStockPasteApply = () => {
    const { values, unrecognized, noWarehouse } = parseStockMessage(stockPaste, stockItems);
    if (values.length) {
      setFields((prev) => {
        const next = { ...prev };
        for (const { itemId, warehouse } of values) {
          setStoredStockValue(VENUE, itemId, "warehouse", warehouse);
          next[itemId] = {
            restaurant: next[itemId]?.restaurant ?? "",
            warehouse,
          };
        }
        return next;
      });
      setStockPaste("");
    }
    setStockPasteResult({
      filled: values.length,
      unrecognized: [...unrecognized, ...noWarehouse],
    });
  };

  const handleDateChange = (value: string) => {
    setDate(value);
    setStoredDate(value);
  };

  const handleEmployeeChange = (value: string) => {
    setEmployee(value);
    setStoredEmployee(value);
  };

  const handleNewDay = () => {
    if (!window.confirm(t("prep_stock_new_day_confirm", { venue: VENUE_LABEL }))) return;
    clearStoredStockValues(
      VENUE,
      stockItems.map((item) => item.id),
    );
    const today = todayIsoDate();
    setDate(today);
    setStoredDate(today);
    setEmployee("");
    setStoredEmployee("");
    setFields(readFields(stockItems));
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const stockRows = stockItems.map((item) => {
        const restaurantValue = fields[item.id]?.restaurant ?? "";
        const warehouseValue = fields[item.id]?.warehouse ?? "";
        const hasRestaurant = restaurantValue.trim() !== "";
        const hasWarehouse = !item.noWarehouse && warehouseValue.trim() !== "";
        return {
          id: item.id,
          name: item.name.en,
          unit: staffStockUnit(item),
          restaurant: parseNumber(restaurantValue),
          warehouse: parseNumber(warehouseValue),
          hasRestaurant,
          hasWarehouse,
          noWarehouse: Boolean(item.noWarehouse),
          filled: hasRestaurant || hasWarehouse,
          lowInHouse: false,
          lowWarehouse: false,
          task: null as string | null,
        };
      });

      for (let i = 0; i < stockRows.length; i += 1) {
        const item = stockItems[i];
        const row = stockRows[i];
        const { lowInHouse, lowWarehouse, task } = evaluateStaffStock(
          item,
          row.hasRestaurant ? row.restaurant : null,
          row.hasWarehouse ? row.warehouse : null,
        );
        row.lowInHouse = lowInHouse;
        row.lowWarehouse = lowWarehouse;
        row.task = task;
      }

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
  }, [date, employee, exportingPdf, fields, lang, stockItems, t]);

  if (!hydrated) {
    return <div className="orders-loading">{t("loading")}</div>;
  }

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

      <div className="orders-prepStockActions">
        <button type="button" className="orders-btn ghost" onClick={handleNewDay}>
          {t("prep_stock_new_day")}
        </button>
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
          onClick={handleStockPasteApply}
          disabled={!stockPaste.trim()}
        >
          {t("prep_stock_paste_apply")}
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
          const values = fields[item.id] ?? { restaurant: "", warehouse: "" };
          return (
            <div key={item.id} className="orders-prepStockCard">
              <div className="orders-prepStockName">
                {label}
                {secondary && secondary !== label ? <span> / {secondary}</span> : null}
              </div>
              <div className={`orders-prepStockRow ${item.noWarehouse ? "single" : ""}`}>
                <label className="orders-prepStockField">
                  <span>{t("prep_stock_in_house")}</span>
                  <span className="orders-prepStockUnitInput">
                    <input
                      inputMode="decimal"
                      value={values.restaurant}
                      onChange={(event) =>
                        handleStockFieldChange(item.id, "restaurant", event.target.value)
                      }
                    />
                    <em>{staffStockUnit(item)}</em>
                  </span>
                </label>
                {item.noWarehouse ? null : (
                  <label className="orders-prepStockField">
                    <span>{t("prep_stock_warehouse")}</span>
                    <span className="orders-prepStockUnitInput">
                      <input
                        inputMode="decimal"
                        value={values.warehouse}
                        onChange={(event) =>
                          handleStockFieldChange(item.id, "warehouse", event.target.value)
                        }
                      />
                      <em>{staffStockUnit(item)}</em>
                    </span>
                  </label>
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
    </div>
  );
}
