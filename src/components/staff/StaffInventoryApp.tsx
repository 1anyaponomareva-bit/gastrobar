"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import { StaffOrderList } from "@/components/staff/StaffOrderList";
import { STAFF_ORDER_ITEMS } from "@/data/staffOrderItems";
import {
  STAFF_INVENTORY_VENUE_LABELS,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import {
  evaluateStaffStock,
  getStaffStockItems,
  staffStockUnit,
} from "@/data/staffInStockItems";
import { getAssetUrl } from "@/lib/appVersion";
import { deliverPdfFile, type DeliverPdfResult } from "@/lib/deliverPdfFile";
import {
  buildStaffInventoryPdfLabels,
  toStaffAppLang,
} from "@/lib/staffInventoryI18n";
import {
  getStaffInventoryPdfFileName,
  makeStaffInventoryPdfBlob,
  preloadStaffInventoryPdfFonts,
} from "@/lib/staffInventoryPdf";
import {
  clearStoredOrderValues,
  clearStoredStockValues,
  getStoredDate,
  getStoredEmployee,
  getStoredSection,
  getStoredStockValue,
  parseNumber,
  setStoredDate,
  setStoredEmployee,
  setStoredSection,
  setStoredStockValue,
  todayIsoDate,
  type StaffInventorySection,
  type StaffStockField,
} from "@/lib/staffInventoryStorage";
import { parseStockMessage } from "@/lib/staffStockParser";
import { translate } from "@/lib/i18n";
import { useTranslation } from "@/lib/useTranslation";
import type { StaffStockRow } from "@/components/staff/staffInventoryTypes";
import "./staff-inventory.css";

function buildStockRows(venue: StaffInventoryVenue): StaffStockRow[] {
  return getStaffStockItems(venue).map((item) => {
    const restaurantValue = getStoredStockValue(venue, item.id, "restaurant");
    const warehouseValue = getStoredStockValue(venue, item.id, "warehouse");
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

export function StaffInventoryApp() {
  const { lang } = useTranslation();
  const staffLang = toStaffAppLang(lang);
  const t = useCallback(
    (key: string) => translate(staffLang, key),
    [staffLang],
  );
  const [hydrated, setHydrated] = useState(false);
  const venue: StaffInventoryVenue = "gastrofood";
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [section, setSection] = useState<StaffInventorySection>("purchase");
  const [stockPaste, setStockPaste] = useState("");
  const [stockPasteResult, setStockPasteResult] = useState<{
    filled: number;
    unrecognized: string[];
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const sharePrepareRef = useRef<{
    key: string;
    promise: Promise<Blob>;
  } | null>(null);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const stockItems = useMemo(() => getStaffStockItems(venue), [venue]);
  const hasStockSection = stockItems.length > 0;
  const activeSection: StaffInventorySection = hasStockSection
    ? section
    : "purchase";
  const venueLabel = STAFF_INVENTORY_VENUE_LABELS[venue];
  const isStockSection = activeSection === "stock";
  const pdfLabels = useMemo(
    () =>
      buildStaffInventoryPdfLabels(
        "en",
        venueLabel,
        date,
        employee,
        stockItems.length,
        "staff_pdf_stock_doc_title",
      ),
    [venueLabel, date, employee, stockItems.length],
  );

  useEffect(() => {
    preloadStaffInventoryPdfFonts();
  }, []);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee());
    setSection(getStoredSection(venue));
    setHydrated(true);
  }, [venue]);

  const stockRows = useMemo(() => {
    void revision;
    if (!hydrated) return [];
    return buildStockRows(venue);
  }, [hydrated, revision, venue]);

  const handleSectionChange = (nextSection: StaffInventorySection) => {
    setSection(nextSection);
    setStoredSection(venue, nextSection);
  };

  const handleStockFieldChange = (
    itemId: string,
    field: StaffStockField,
    value: string,
  ) => {
    setStoredStockValue(venue, itemId, field, value);
    bump();
  };

  const handleStockPasteApply = () => {
    const { values, unrecognized, noWarehouse } = parseStockMessage(
      stockPaste,
      stockItems,
    );
    values.forEach(({ itemId, warehouse }) => {
      setStoredStockValue(venue, itemId, "warehouse", warehouse);
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
    if (
      !window.confirm(t("staff_new_day_confirm").replace("{venue}", venueLabel))
    ) {
      return;
    }

    clearStoredOrderValues(
      venue,
      STAFF_ORDER_ITEMS.map((item) => item.id),
    );
    clearStoredStockValues(
      venue,
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
      (row) =>
        `${row.id}:${row.restaurant}:${row.warehouse}:${row.hasRestaurant}:${row.hasWarehouse}`,
    );
    return [
      date,
      employee.trim(),
      data.join("|"),
    ].join("::");
  }, [date, employee, stockRows]);

  const buildPdfOptions = useCallback(
    () => ({
      venueLabel,
      date,
      employee,
      rows: [],
      stockRows,
      labels: pdfLabels,
    }),
    [venueLabel, date, employee, stockRows, pdfLabels],
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
    window.alert(t("staff_share_pdf_error"));
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;

    setExportingPdf(true);
    try {
      const fileName = getStaffInventoryPdfFileName(
        venueLabel,
        date,
        "PrepStock",
      );
      const key = buildShareKey();
      const prepared = sharePrepareRef.current;
      const blob =
        prepared?.key === key
          ? await prepared.promise
          : await makeStaffInventoryPdfBlob(buildPdfOptions());
      const result = await deliverPdfFile(blob, fileName);

      if (result !== "shared") {
        handleSharePdfResult(result);
      }
    } catch (error) {
      console.error(error);
      window.alert(t("staff_share_pdf_error_generic"));
    } finally {
      setExportingPdf(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        {t("staff_loading")}
      </div>
    );
  }

  const stockCards = stockItems.map((item) => (
    <div key={`${venue}-stock-${item.id}`} className="card">
      <div className="name">{item.name[staffLang]}</div>
      <div className={`row ${item.noWarehouse ? "single" : ""}`}>
        <div className="field">
          <label>{t("staff_stock_restaurant")}</label>
          <div className="unitInput">
            <input
              inputMode="decimal"
              value={getStoredStockValue(venue, item.id, "restaurant")}
              onChange={(event) =>
                handleStockFieldChange(item.id, "restaurant", event.target.value)
              }
            />
            <span className="unitSuffix">{staffStockUnit(item)}</span>
          </div>
        </div>
        {item.noWarehouse ? null : (
          <div className="field">
            <label>{t("staff_stock_warehouse")}</label>
            <div className="unitInput">
              <input
                inputMode="decimal"
                value={getStoredStockValue(venue, item.id, "warehouse")}
                onChange={(event) =>
                  handleStockFieldChange(
                    item.id,
                    "warehouse",
                    event.target.value,
                  )
                }
              />
              <span className="unitSuffix">{staffStockUnit(item)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  ));

  return (
    <div className="staff-inventory staff-inventory-page">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffLanguageFlags />
          </div>

          <div className="venueLogo">
            <img
              src={getAssetUrl("/food/menu/GASTROFOOD-line.png")}
              alt={venueLabel}
            />
          </div>

          <div className="meta">
            <div className="box">
              <label htmlFor="staff-date">{t("staff_date")}</label>
              <input
                id="staff-date"
                type="date"
                value={date}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </div>
            <div className="box">
              <label htmlFor="staff-employee">{t("staff_employee")}</label>
              <input
                id="staff-employee"
                type="text"
                placeholder={t("staff_employee_placeholder")}
                value={employee}
                onChange={(event) => handleEmployeeChange(event.target.value)}
              />
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="success actionsExport"
              onClick={handleNewDay}
            >
              {t("staff_new_day")}
            </button>
          </div>

          <p className="note">
            {t("staff_note").replace("{venue}", venueLabel)}
          </p>
        </div>

        <div className="main">
          {hasStockSection ? (
            <div className="sectionPicker" role="tablist">
              {(["purchase", "stock"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === option}
                  className={`sectionBtn ${activeSection === option ? "active" : ""}`}
                  onClick={() => handleSectionChange(option)}
                >
                  {option === "purchase"
                    ? t("staff_section_purchase")
                    : t("staff_section_stock")}
                </button>
              ))}
            </div>
          ) : null}

          {activeSection === "stock" ? (
            <>
              <div className="mode">
                <span>
                  {t("staff_stock_mode")
                    .replace("{venue}", venueLabel)
                    .replace("{count}", String(stockItems.length))}
                </span>
              </div>
              <div className="stockPaste">
                <label htmlFor="staff-stock-paste">
                  {t("staff_stock_paste_title")}
                </label>
                <textarea
                  id="staff-stock-paste"
                  rows={5}
                  placeholder={t("staff_stock_paste_placeholder")}
                  value={stockPaste}
                  onChange={(event) => {
                    setStockPaste(event.target.value);
                    setStockPasteResult(null);
                  }}
                />
                <button
                  type="button"
                  className="gold"
                  onClick={handleStockPasteApply}
                  disabled={!stockPaste.trim()}
                >
                  {t("staff_stock_paste_apply")}
                </button>
                {stockPasteResult ? (
                  <div
                    className={`stockPasteResult ${stockPasteResult.filled ? "" : "error"}`}
                    role="status"
                  >
                    {stockPasteResult.filled
                      ? t("staff_stock_paste_filled").replace(
                          "{count}",
                          String(stockPasteResult.filled),
                        )
                      : t("staff_stock_paste_nothing")}
                    {stockPasteResult.unrecognized.length ? (
                      <div className="stockPasteUnknown">
                        {t("staff_stock_paste_unrecognized")}
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
              {stockCards}
            </>
          ) : (
            <StaffOrderList
              venue={venue}
              venueLabel={venueLabel}
              date={date}
              employee={employee}
              staffLang={staffLang}
              revision={revision}
              onChange={bump}
            />
          )}

          {isStockSection ? (
            <button
              type="button"
              className="gold sectionShare"
              onPointerDown={beginSharePreparation}
              onTouchStart={beginSharePreparation}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? t("staff_sharing_pdf") : t("staff_share_pdf")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
