"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getStaffInventoryCategories,
  getStaffInventoryItems,
  STAFF_INVENTORY_VENUE_LABELS,
  STAFF_INVENTORY_VENUE_LOGOS,
  STAFF_INVENTORY_VENUES,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import { getAssetUrl } from "@/lib/appVersion";
import { exportStaffInventoryPdf } from "@/lib/staffInventoryPdf";
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
    const current = parseNumber(getStoredValue(venue, index, "current"));
    const needed = parseNumber(getStoredValue(venue, index, "needed"));
    const order = Math.max(needed - current, 0);
    return {
      index,
      category: item[0],
      name: item[1],
      unit: item[2],
      current,
      needed,
      order,
    };
  });
}

function formatOrderValue(order: number, unit: string): string {
  if (!order) return "";
  return `${Number(order.toFixed(2))} ${unit}`;
}

export function StaffInventoryApp() {
  const [hydrated, setHydrated] = useState(false);
  const [venue, setVenue] = useState<StaffInventoryVenue>("gastrofood");
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [onlyOrder, setOnlyOrder] = useState(false);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportEmployeeError, setExportEmployeeError] = useState(false);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const items = useMemo(() => getStaffInventoryItems(venue), [venue]);
  const categories = useMemo(() => getStaffInventoryCategories(venue), [venue]);
  const venueLabel = STAFF_INVENTORY_VENUE_LABELS[venue];

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

  const stats = useMemo(() => {
    const toOrder = rows.filter((row) => row.order > 0);
    return {
      totalItems: items.length,
      itemsToOrder: toOrder.length,
      totalQty: Number(
        rows.reduce((sum, row) => sum + row.order, 0).toFixed(2),
      ),
    };
  }, [rows, items.length]);

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
      if (onlyOrder && row.order <= 0) return false;
      return true;
    });
  }, [rows, activeCategory, search, onlyOrder]);

  const handleVenueChange = (nextVenue: StaffInventoryVenue) => {
    if (nextVenue === venue) return;
    setVenue(nextVenue);
    setStoredVenue(nextVenue);
    setActiveCategory(getStoredActiveCategory(nextVenue));
    setSearch("");
    setOnlyOrder(false);
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
    setOnlyOrder(false);
    bump();
  };

  const handleNewDay = () => {
    if (
      !window.confirm(
        `Start a new day and clear all entered stock/order values for ${venueLabel}?`,
      )
    ) {
      return;
    }

    clearStoredValues(venue, items.length);
    const today = todayIsoDate();
    setDate(today);
    setStoredDate(today);
    setSearch("");
    setActiveCategory("All");
    setStoredActiveCategory(venue, "All");
    setOnlyOrder(false);
    bump();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      await exportStaffInventoryPdf({
        venueLabel,
        date,
        employee,
        rows: rows.filter((row) => row.order > 0),
      });
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
              <b>{stats.totalItems}</b>
            </div>
            <div className="stat">
              <label>To order</label>
              <b>{stats.itemsToOrder}</b>
            </div>
            <div className="stat">
              <label>Order qty</label>
              <b>{stats.totalQty}</b>
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
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? "Sharing PDF..." : "Share PDF"}
            </button>
            <button type="button" className="danger" onClick={handleNewDay}>
              New Day
            </button>
            <button
              type="button"
              className="white"
              onClick={() => setOnlyOrder((value) => !value)}
            >
              {onlyOrder ? "Only order" : "All items"}
            </button>
          </div>
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
              {venueLabel} ·{" "}
              {(onlyOrder ? "Showing only order items" : "Showing all items") +
                ` - ${visibleRows.length} visible`}
            </span>
            <span>PDF includes order &gt; 0</span>
          </div>

          <div>
            {!visibleRows.length ? (
              <div className="empty">
                No items found. Press Reset or turn off Only order.
              </div>
            ) : (
              visibleRows.map((row) => {
                const showCategoryHeader = row.category !== lastCategory;
                lastCategory = row.category;

                return (
                  <div key={`${venue}-${row.index}`}>
                    {showCategoryHeader ? (
                      <div className="category">{row.category}</div>
                    ) : null}
                    <div className={`card ${row.order > 0 ? "low" : ""}`}>
                      <div className="name">{row.name}</div>
                      <div className="row">
                        <div className="field">
                          <label>Current ({row.unit})</label>
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
                          <label>Needed ({row.unit})</label>
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
                        <div className="field order">
                          <label>Order</label>
                          <input
                            className="orderValue"
                            readOnly
                            value={formatOrderValue(row.order, row.unit)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="bottomActions">
            {exportEmployeeError ? (
              <div className="exportError bottomActionsExport" role="alert">
                <strong>Employee name is required.</strong>
              </div>
            ) : null}
            <button
              type="button"
              className="gold"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? "Sharing PDF..." : "Share PDF"}
            </button>
            <button type="button" className="dark" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="danger" onClick={handleNewDay}>
              New Day / Clear Orders
            </button>
          </div>

          <p className="note">
            For the next day press New Day / Clear Orders. It clears Current and
            Needed values for {venueLabel}, sets today date, and keeps all
            items.
          </p>
        </div>
      </div>
    </div>
  );
}
