"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import {
  getStaffInventoryCategories,
  getStaffInventoryItems,
  getStaffInventoryUnits,
  STAFF_INVENTORY_VENUE_LABELS,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import { getStaffStockItems } from "@/data/staffInStockItems";
import { getAssetUrl } from "@/lib/appVersion";
import { deliverPdfFile, type DeliverPdfResult } from "@/lib/deliverPdfFile";
import {
  buildStaffInventoryPdfLabels,
  toStaffAppLang,
  translateStaffCategory,
  translateStaffItemName,
} from "@/lib/staffInventoryI18n";
import {
  getStaffInventoryPdfFileName,
  makeStaffInventoryPdfBlob,
  preloadStaffInventoryPdfFonts,
} from "@/lib/staffInventoryPdf";
import {
  clearStoredStockValues,
  clearStoredValues,
  getStoredActiveCategory,
  getStoredDate,
  getStoredEmployee,
  getStoredSection,
  getStoredStockValue,
  getStoredValue,
  parseNumber,
  setStoredActiveCategory,
  setStoredDate,
  setStoredEmployee,
  setStoredSection,
  setStoredStockValue,
  setStoredValue,
  todayIsoDate,
  type StaffInventorySection,
  type StaffStockField,
} from "@/lib/staffInventoryStorage";
import { parseStockMessage } from "@/lib/staffStockParser";
import { translate } from "@/lib/i18n";
import { useTranslation } from "@/lib/useTranslation";
import type {
  StaffInventoryRow,
  StaffStockRow,
} from "@/components/staff/staffInventoryTypes";
import "./staff-inventory.css";

function buildStockRows(venue: StaffInventoryVenue): StaffStockRow[] {
  return getStaffStockItems(venue).map((item) => {
    const restaurantValue = getStoredStockValue(venue, item.id, "restaurant");
    const warehouseValue = getStoredStockValue(venue, item.id, "warehouse");
    return {
      id: item.id,
      name: item.name.en,
      restaurant: parseNumber(restaurantValue),
      warehouse: parseNumber(warehouseValue),
      hasRestaurant: restaurantValue.trim() !== "",
      hasWarehouse: !item.noWarehouse && warehouseValue.trim() !== "",
      noWarehouse: Boolean(item.noWarehouse),
    };
  });
}

function buildRows(venue: StaffInventoryVenue): StaffInventoryRow[] {
  return getStaffInventoryItems(venue).map((item, index) => {
    const { neededUnit, leftUnit } = getStaffInventoryUnits(item);
    const currentValue = getStoredValue(venue, index, "current");
    const neededValue = getStoredValue(venue, index, "needed");
    return {
      index,
      category: item[0],
      name: item[1],
      neededUnit,
      leftUnit,
      current: parseNumber(currentValue),
      needed: parseNumber(neededValue),
      hasCurrent: currentValue.trim() !== "",
      hasNeeded: neededValue.trim() !== "",
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
  const [activeCategory, setActiveCategory] = useState("All");
  const [section, setSection] = useState<StaffInventorySection>("purchase");
  const [search, setSearch] = useState("");
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

  const items = useMemo(() => getStaffInventoryItems(venue), [venue]);
  const categories = useMemo(() => getStaffInventoryCategories(venue), [venue]);
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
        isStockSection ? stockItems.length : items.length,
        isStockSection ? "staff_pdf_stock_doc_title" : "staff_pdf_title",
      ),
    [venueLabel, date, employee, isStockSection, stockItems.length, items.length],
  );

  const categoryLabel = useCallback(
    (category: string) => translateStaffCategory(staffLang, category),
    [staffLang],
  );

  const itemLabel = useCallback(
    (name: string) => translateStaffItemName(staffLang, name),
    [staffLang],
  );

  useEffect(() => {
    preloadStaffInventoryPdfFonts();
  }, []);

  useEffect(() => {
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee());
    setActiveCategory(getStoredActiveCategory(venue));
    setSection(getStoredSection(venue));
    setHydrated(true);
  }, [venue]);

  const rows = useMemo(() => {
    void revision;
    if (!hydrated) return [];
    return buildRows(venue);
  }, [hydrated, revision, venue]);

  const stockRows = useMemo(() => {
    void revision;
    if (!hydrated) return [];
    return buildStockRows(venue);
  }, [hydrated, revision, venue]);

  const visibleRows = useMemo(() => {
    const query = search.toLowerCase().trim();
    return rows.filter((row) => {
      if (activeCategory !== "All" && row.category !== activeCategory) {
        return false;
      }
      if (query) {
        const translatedCategory = categoryLabel(row.category).toLowerCase();
        const translatedName = itemLabel(row.name).toLowerCase();
        if (
          !row.name.toLowerCase().includes(query) &&
          !translatedName.includes(query) &&
          !row.category.toLowerCase().includes(query) &&
          !translatedCategory.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, activeCategory, search, categoryLabel, itemLabel]);

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
    const { values, unrecognized } = parseStockMessage(stockPaste, stockItems);
    values.forEach(({ itemId, restaurant, warehouse }) => {
      if (restaurant !== undefined) {
        setStoredStockValue(venue, itemId, "restaurant", restaurant);
      }
      if (warehouse !== undefined) {
        setStoredStockValue(venue, itemId, "warehouse", warehouse);
      }
    });
    setStockPasteResult({ filled: values.length, unrecognized });
    if (values.length) setStockPaste("");
    bump();
  };

  const handleFieldChange = (
    index: number,
    field: "current" | "needed",
    value: string,
  ) => {
    setStoredValue(venue, index, field, value);
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

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    setStoredActiveCategory(venue, category);
  };

  const handleReset = () => {
    setSearch("");
    setActiveCategory("All");
    setStoredActiveCategory(venue, "All");
    bump();
  };

  const handleNewDay = () => {
    if (
      !window.confirm(t("staff_new_day_confirm").replace("{venue}", venueLabel))
    ) {
      return;
    }

    clearStoredValues(venue, items.length);
    clearStoredStockValues(
      venue,
      stockItems.map((item) => item.id),
    );
    const today = todayIsoDate();
    setDate(today);
    setStoredDate(today);
    setEmployee("");
    setStoredEmployee("");
    setSearch("");
    setActiveCategory("All");
    setStoredActiveCategory(venue, "All");
    bump();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buildShareKey = useCallback(() => {
    const data = isStockSection
      ? stockRows.map(
          (row) =>
            `${row.id}:${row.restaurant}:${row.warehouse}:${row.hasRestaurant}:${row.hasWarehouse}`,
        )
      : rows.map(
          (row) =>
            `${row.index}:${row.current}:${row.needed}:${row.hasCurrent}:${row.hasNeeded}`,
        );
    return [
      activeSection,
      date,
      employee.trim(),
      data.join("|"),
    ].join("::");
  }, [isStockSection, activeSection, date, employee, rows, stockRows]);

  const buildPdfOptions = useCallback(
    () => ({
      venueLabel,
      date,
      employee,
      rows: isStockSection ? [] : rows,
      stockRows: isStockSection ? stockRows : [],
      labels: pdfLabels,
    }),
    [venueLabel, date, employee, isStockSection, rows, stockRows, pdfLabels],
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
        isStockSection ? "PrepStock" : "OrderList",
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

  let lastCategory = "";

  const stockCards = stockItems.map((item) => (
    <div key={`${venue}-stock-${item.id}`} className="card">
      <div className="name">{item.name[staffLang]}</div>
      <div className={`row ${item.noWarehouse ? "single" : ""}`}>
        <div className="field">
          <label>{t("staff_stock_restaurant")}</label>
          <input
            inputMode="decimal"
            value={getStoredStockValue(venue, item.id, "restaurant")}
            onChange={(event) =>
              handleStockFieldChange(item.id, "restaurant", event.target.value)
            }
          />
        </div>
        {item.noWarehouse ? null : (
          <div className="field">
            <label>{t("staff_stock_warehouse")}</label>
            <input
              inputMode="decimal"
              value={getStoredStockValue(venue, item.id, "warehouse")}
              onChange={(event) =>
                handleStockFieldChange(item.id, "warehouse", event.target.value)
              }
            />
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
            <>
              <div className="searchRow">
                <input
                  className="search"
                  placeholder={t("staff_search_placeholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button type="button" className="dark" onClick={handleReset}>
                  {t("staff_reset")}
                </button>
              </div>

              <div className="tabs">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`tab ${category === activeCategory ? "active" : ""}`}
                    onClick={() => handleCategoryChange(category)}
                  >
                    {category === "All"
                      ? t("staff_tab_all").replace(
                          "{count}",
                          String(items.length),
                        )
                      : categoryLabel(category)}
                  </button>
                ))}
              </div>

              <div className="mode">
                <span>
                  {t("staff_mode_visible")
                    .replace("{venue}", venueLabel)
                    .replace("{count}", String(visibleRows.length))}
                </span>
              </div>

              <div>
                {!visibleRows.length ? (
                  <div className="empty">{t("staff_empty")}</div>
                ) : (
                  visibleRows.map((row) => {
                    const showCategoryHeader = row.category !== lastCategory;
                    lastCategory = row.category;

                    return (
                      <div key={`${venue}-${row.index}`}>
                        {showCategoryHeader ? (
                          <div className="category">
                            {categoryLabel(row.category)}
                          </div>
                        ) : null}
                        <div className="card">
                          <div className="name">{itemLabel(row.name)}</div>
                          <div className="row">
                            <div className="field">
                              <label>
                                {t("staff_left")} ({row.leftUnit})
                              </label>
                              <input
                                inputMode="decimal"
                                value={getStoredValue(
                                  venue,
                                  row.index,
                                  "current",
                                )}
                                onChange={(event) =>
                                  handleFieldChange(
                                    row.index,
                                    "current",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="field">
                              <label>
                                {t("staff_needed")} ({row.neededUnit})
                              </label>
                              <input
                                inputMode="decimal"
                                value={getStoredValue(
                                  venue,
                                  row.index,
                                  "needed",
                                )}
                                onChange={(event) =>
                                  handleFieldChange(
                                    row.index,
                                    "needed",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          <button
            type="button"
            className="gold sectionShare"
            onPointerDown={beginSharePreparation}
            onTouchStart={beginSharePreparation}
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            {exportingPdf
              ? t("staff_sharing_pdf")
              : `${t("staff_share_pdf")} · ${t(
                  isStockSection
                    ? "staff_section_stock"
                    : "staff_section_purchase",
                )}`}
          </button>
        </div>
      </div>
    </div>
  );
}
