"use client";

/**
 * Temporary Prep Stock tab in Orders — same positions and Zalo paste as old /staff.
 * Does NOT sync with ERP полуфабрикаты yet; later prep catalog should feed this list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  evaluateStaffStock,
  getStaffStockItems,
  staffStockUnit,
} from "@/data/staffInStockItems";
import { STAFF_INVENTORY_VENUE_LABELS } from "@/data/staffInventoryItems";
import {
  deliverPdfFile,
  detectInAppBrowser,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";
import { buildStaffInventoryPdfLabels } from "@/lib/staffInventoryI18n";
import {
  getStaffInventoryPdfFileName,
  makeStaffInventoryPdfBlob,
  preloadStaffInventoryPdfFonts,
} from "@/lib/staffInventoryPdf";
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
import type { StaffStockRow } from "@/components/staff/staffInventoryTypes";
import { useOrders } from "./OrdersShell";

const VENUE = "gastrofood" as const;
const VENUE_LABEL = STAFF_INVENTORY_VENUE_LABELS[VENUE];

function buildStockRows(): StaffStockRow[] {
  return getStaffStockItems(VENUE).map((item) => {
    const restaurantValue = getStoredStockValue(VENUE, item.id, "restaurant");
    const warehouseValue = getStoredStockValue(VENUE, item.id, "warehouse");
    const hasRestaurant = restaurantValue.trim() !== "";
    const hasWarehouse = !item.noWarehouse && warehouseValue.trim() !== "";
    const restaurant = parseNumber(restaurantValue);
    const warehouse = parseNumber(warehouseValue);
    const { lowInHouse, lowWarehouse, task } = evaluateStaffStock(
      item,
      hasRestaurant ? restaurant : null,
      hasWarehouse ? warehouse : null,
    );
    return {
      id: item.id,
      name: item.name.en,
      unit: staffStockUnit(item),
      restaurant,
      warehouse,
      hasRestaurant,
      hasWarehouse,
      noWarehouse: Boolean(item.noWarehouse),
      filled: hasRestaurant || hasWarehouse,
      lowInHouse,
      lowWarehouse,
      task,
    };
  });
}

export function PrepStockPage() {
  const { t, lang } = useOrders();
  const [hydrated, setHydrated] = useState(false);
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [stockPaste, setStockPaste] = useState("");
  const [stockPasteResult, setStockPasteResult] = useState<{
    filled: number;
    unrecognized: string[];
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const sharePrepareRef = useRef<{ key: string; promise: Promise<Blob> } | null>(null);

  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const stockItems = useMemo(() => getStaffStockItems(VENUE), []);

  const pdfLabels = useMemo(
    () =>
      buildStaffInventoryPdfLabels(
        lang,
        VENUE_LABEL,
        date,
        employee,
        stockItems.length,
        "staff_pdf_stock_doc_title",
      ),
    [lang, date, employee, stockItems.length],
  );

  useEffect(() => {
    preloadStaffInventoryPdfFonts();
  }, []);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee());
    setHydrated(true);
  }, []);

  const stockRows = useMemo(() => {
    void revision;
    if (!hydrated) return [];
    return buildStockRows();
  }, [hydrated, revision]);

  const handleStockFieldChange = (itemId: string, field: StaffStockField, value: string) => {
    setStoredStockValue(VENUE, itemId, field, value);
    bump();
  };

  const handleStockPasteApply = () => {
    const { values, unrecognized, noWarehouse } = parseStockMessage(stockPaste, stockItems);
    values.forEach(({ itemId, warehouse }) => {
      setStoredStockValue(VENUE, itemId, "warehouse", warehouse);
    });
    setStockPasteResult({
      filled: values.length,
      unrecognized: [...unrecognized, ...noWarehouse],
    });
    if (values.length) setStockPaste("");
    bump();
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
    bump();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buildShareKey = useCallback(() => {
    const data = stockRows.map(
      (row) => `${row.id}:${row.restaurant}:${row.warehouse}:${row.hasRestaurant}:${row.hasWarehouse}`,
    );
    return [date, employee.trim(), data.join("|")].join("::");
  }, [date, employee, stockRows]);

  const buildPdfOptions = useCallback(
    () => ({
      venueLabel: VENUE_LABEL,
      date,
      employee,
      rows: [],
      stockRows,
      labels: pdfLabels,
    }),
    [date, employee, stockRows, pdfLabels],
  );

  const beginSharePreparation = useCallback(() => {
    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffInventoryPdfBlob(buildPdfOptions()),
    };
  }, [buildShareKey, buildPdfOptions]);

  useEffect(() => {
    if (!hydrated) {
      sharePrepareRef.current = null;
      return;
    }
    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffInventoryPdfBlob(buildPdfOptions()),
    };
  }, [hydrated, buildShareKey, buildPdfOptions]);

  const handleSharePdfResult = (result: DeliverPdfResult) => {
    if (result === "cancelled" || result === "downloaded") return;
    window.alert(t("prep_stock_share_error"));
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    if (detectInAppBrowser()) {
      window.alert(t("prep_stock_inapp_blocked"));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setExportingPdf(true);
    try {
      const fileName = getStaffInventoryPdfFileName(VENUE_LABEL, date, "PrepStock");
      const key = buildShareKey();
      const prepared = sharePrepareRef.current;
      const blob =
        prepared?.key === key ? await prepared.promise : await makeStaffInventoryPdfBlob(buildPdfOptions());
      const result = await deliverPdfFile(blob, fileName);
      if (result !== "shared") handleSharePdfResult(result);
    } catch (error) {
      console.error(error);
      window.alert(t("prep_stock_share_error"));
    } finally {
      setExportingPdf(false);
    }
  };

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
                      value={getStoredStockValue(VENUE, item.id, "restaurant")}
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
                        value={getStoredStockValue(VENUE, item.id, "warehouse")}
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
        onPointerDown={beginSharePreparation}
        onTouchStart={beginSharePreparation}
        onClick={() => void handleExportPdf()}
        disabled={exportingPdf}
      >
        {exportingPdf ? t("prep_stock_sharing") : t("prep_stock_share_pdf")}
      </button>
    </div>
  );
}
