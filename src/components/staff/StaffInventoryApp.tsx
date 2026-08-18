"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import {
  getStaffInventoryCategories,
  getStaffInventoryItems,
  getStaffInventoryUnits,
  STAFF_INVENTORY_VENUE_LABELS,
  STAFF_INVENTORY_VENUE_LOGOS,
  STAFF_INVENTORY_VENUES,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverPdfFile,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";
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
  clearStoredValues,
  getStoredActiveCategory,
  getStoredDate,
  getStoredEmployee,
  getStoredValue,
  getStoredVenue,
  parseNumber,
  setStoredActiveCategory,
  setStoredDate,
  setStoredEmployee,
  setStoredValue,
  setStoredVenue,
  todayIsoDate,
} from "@/lib/staffInventoryStorage";
import { translate } from "@/lib/i18n";
import { useTranslation } from "@/lib/useTranslation";
import type { StaffInventoryRow } from "@/components/staff/staffInventoryTypes";
import "./staff-inventory.css";

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
  const t = useCallback((key: string) => translate(staffLang, key), [staffLang]);
  const [hydrated, setHydrated] = useState(false);
  const [venue, setVenue] = useState<StaffInventoryVenue>("gastrofood");
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportEmployeeError, setExportEmployeeError] = useState(false);
  const sharePrepareRef = useRef<{
    key: string;
    promise: Promise<Blob>;
  } | null>(null);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const items = useMemo(() => getStaffInventoryItems(venue), [venue]);
  const categories = useMemo(() => getStaffInventoryCategories(venue), [venue]);
  const venueLabel = STAFF_INVENTORY_VENUE_LABELS[venue];
  const pdfLabels = useMemo(
    () =>
      buildStaffInventoryPdfLabels(
        staffLang,
        venueLabel,
        date,
        employee,
        items.length,
      ),
    [staffLang, venueLabel, date, employee, items.length],
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
    const storedVenue = getStoredVenue();
    setVenue(storedVenue);
    setDate(getStoredDate() || todayIsoDate());
    setEmployee(getStoredEmployee());
    setActiveCategory(getStoredActiveCategory(storedVenue));
    setHydrated(true);
  }, []);

  const rows = useMemo(() => {
    void revision;
    if (!hydrated) return [];
    return buildRows(venue);
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

  const handleVenueChange = (nextVenue: StaffInventoryVenue) => {
    if (nextVenue === venue) return;
    setVenue(nextVenue);
    setStoredVenue(nextVenue);
    setActiveCategory(getStoredActiveCategory(nextVenue));
    setSearch("");
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
    if (exportEmployeeError) setExportEmployeeError(false);
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    setStoredActiveCategory(venue, category);
  };

  const handleSave = () => {
    setStoredDate(date);
    setStoredEmployee(employee);
    window.alert(t("staff_saved"));
  };

  const handleReset = () => {
    setSearch("");
    setActiveCategory("All");
    setStoredActiveCategory(venue, "All");
    bump();
  };

  const handleNewDay = () => {
    if (
      !window.confirm(
        t("staff_new_day_confirm").replace("{venue}", venueLabel),
      )
    ) {
      return;
    }

    clearStoredValues(venue, items.length);
    const today = todayIsoDate();
    setDate(today);
    setStoredDate(today);
    setEmployee("");
    setStoredEmployee("");
    setExportEmployeeError(false);
    setSearch("");
    setActiveCategory("All");
    setStoredActiveCategory(venue, "All");
    bump();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buildShareKey = useCallback(() => {
    return [
      staffLang,
      venue,
      date,
      employee.trim(),
      rows
        .map(
          (row) =>
            `${row.index}:${row.current}:${row.needed}:${row.hasCurrent}:${row.hasNeeded}`,
        )
        .join("|"),
    ].join("::");
  }, [staffLang, venue, date, employee, rows]);

  const buildPdfOptions = useCallback(
    () => ({
      venueLabel,
      date,
      employee,
      rows: rows.map((row) => ({ ...row, name: itemLabel(row.name) })),
      labels: pdfLabels,
    }),
    [venueLabel, date, employee, rows, pdfLabels, itemLabel],
  );

  const beginSharePreparation = useCallback(() => {
    if (!employee.trim()) return;

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffInventoryPdfBlob(buildPdfOptions()),
    };
  }, [buildShareKey, buildPdfOptions, employee]);

  useEffect(() => {
    if (!hydrated || !employee.trim()) {
      sharePrepareRef.current = null;
      return;
    }

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffInventoryPdfBlob(buildPdfOptions()),
    };
  }, [hydrated, buildShareKey, buildPdfOptions, employee, rows]);

  const handleSharePdfResult = (result: DeliverPdfResult) => {
    if (result === "cancelled" || result === "downloaded") return;
    window.alert(t("staff_share_pdf_error"));
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;

    if (!employee.trim()) {
      setExportEmployeeError(true);
      window.setTimeout(() => {
        document.getElementById("staff-employee")?.focus();
        document
          .getElementById("staff-employee")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setExportEmployeeError(false);
    setExportingPdf(true);
    try {
      const fileName = getStaffInventoryPdfFileName(venueLabel, date);
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

  return (
    <div className="staff-inventory staff-inventory-page">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffLanguageFlags />
          </div>

          <div className="venuePicker">
            {STAFF_INVENTORY_VENUES.map((option) => {
              const isActive = option === venue;
              return (
                <button
                  key={option}
                  type="button"
                  className={`venueOption ${isActive ? "active" : ""}`}
                  onClick={() => handleVenueChange(option)}
                  aria-pressed={isActive}
                  aria-label={STAFF_INVENTORY_VENUE_LABELS[option]}
                >
                  <img
                    src={getAssetUrl(STAFF_INVENTORY_VENUE_LOGOS[option])}
                    alt={STAFF_INVENTORY_VENUE_LABELS[option]}
                  />
                </button>
              );
            })}
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

          <div className="stats">
            <div className="stat">
              <label>{t("staff_total_items")}</label>
              <b>{items.length}</b>
            </div>
          </div>

          <div className="actions">
            {exportEmployeeError ? (
              <div className="exportError actionsExport" role="alert">
                <strong>{t("staff_export_employee_required")}</strong>
              </div>
            ) : null}
            <button
              type="button"
              className="gold actionsExport"
              onPointerDown={beginSharePreparation}
              onTouchStart={beginSharePreparation}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? t("staff_sharing_pdf") : t("staff_share_pdf")}
            </button>
            <button type="button" className="dark" onClick={handleSave}>
              {t("staff_save")}
            </button>
            <button type="button" className="danger" onClick={handleNewDay}>
              {t("staff_new_day")}
            </button>
          </div>

          <p className="note">
            {t("staff_note").replace("{venue}", venueLabel)}
          </p>
        </div>

        <div className="main">
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
                  ? t("staff_tab_all").replace("{count}", String(items.length))
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
                      <div className="category">{categoryLabel(row.category)}</div>
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
                            value={getStoredValue(venue, row.index, "current")}
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
                            value={getStoredValue(venue, row.index, "needed")}
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
        </div>
      </div>
    </div>
  );
}
