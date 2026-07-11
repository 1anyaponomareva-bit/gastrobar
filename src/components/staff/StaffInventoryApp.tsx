"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      if (
        query &&
        !row.name.toLowerCase().includes(query) &&
        !row.category.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, activeCategory, search]);

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
    window.alert("Saved");
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
        `Start a new day and clear all entered LEFT and NEEDED values and employee name for ${venueLabel}?`,
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
  }, [venue, date, employee, rows]);

  const beginSharePreparation = useCallback(() => {
    if (!employee.trim()) return;

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffInventoryPdfBlob({
        venueLabel,
        date,
        employee,
        rows,
      }),
    };
  }, [buildShareKey, venueLabel, date, employee, rows]);

  const handleSharePdfResult = (result: DeliverPdfResult) => {
    if (result === "cancelled") return;
    if (result === "downloaded") {
      window.alert(
        "PDF saved. Open Downloads or Files app, or use the Share button in the PDF viewer.",
      );
      return;
    }
    window.alert(
      "Could not share the PDF file. Tap Share PDF again and choose Telegram or WhatsApp — not Copy Link.",
    );
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
          : await makeStaffInventoryPdfBlob({
              venueLabel,
              date,
              employee,
              rows,
            });
      const result = await deliverPdfFile(blob, fileName);

      if (result !== "shared") {
        handleSharePdfResult(result);
      }
    } catch (error) {
      console.error(error);
      window.alert(
        "Could not share the PDF file. Choose Telegram or WhatsApp in the share menu — not Copy Link.",
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        Loading...
      </div>
    );
  }

  let lastCategory = "";

  return (
    <div className="staff-inventory staff-inventory-page">
      <div className="app">
        <div className="top">
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
              <label htmlFor="staff-date">Date</label>
              <input
                id="staff-date"
                type="date"
                value={date}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </div>
            <div className="box">
              <label htmlFor="staff-employee">Employee</label>
              <input
                id="staff-employee"
                type="text"
                placeholder="Name"
                value={employee}
                onChange={(event) => handleEmployeeChange(event.target.value)}
              />
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <label>Total items</label>
              <b>{items.length}</b>
            </div>
          </div>

          <div className="actions">
            {exportEmployeeError ? (
              <div className="exportError actionsExport" role="alert">
                <strong>Employee name is required.</strong>
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
              {exportingPdf ? "Sharing PDF..." : "Share PDF"}
            </button>
            <button type="button" className="dark" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="danger" onClick={handleNewDay}>
              New Day
            </button>
          </div>

          <p className="note">
            For the next day press New Day. It clears LEFT and NEEDED values,
            employee name, and sets today date for {venueLabel}.
          </p>
        </div>

        <div className="main">
          <div className="searchRow">
            <input
              className="search"
              placeholder="Search item or category..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" className="dark" onClick={handleReset}>
              Reset
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
                {category === "All" ? `All ${items.length}` : category}
              </button>
            ))}
          </div>

          <div className="mode">
            <span>
              {venueLabel} · Showing all items - {visibleRows.length} visible
            </span>
          </div>

          <div>
            {!visibleRows.length ? (
              <div className="empty">No items found. Press Reset.</div>
            ) : (
              visibleRows.map((row) => {
                const showCategoryHeader = row.category !== lastCategory;
                lastCategory = row.category;

                return (
                  <div key={`${venue}-${row.index}`}>
                    {showCategoryHeader ? (
                      <div className="category">{row.category}</div>
                    ) : null}
                    <div className="card">
                      <div className="name">{row.name}</div>
                      <div className="row">
                        <div className="field">
                          <label>LEFT ({row.leftUnit})</label>
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
                          <label>NEEDED ({row.neededUnit})</label>
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
