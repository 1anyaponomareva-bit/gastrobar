"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STAFF_INVENTORY_VENUE_LABELS,
  STAFF_INVENTORY_VENUE_LOGOS,
  STAFF_INVENTORY_VENUES,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import {
  CLEANING_TYPE_LABELS,
  getShiftChecklistItems,
  SHIFT_TYPE_LABELS,
  type CleaningType,
  type ShiftType,
} from "@/data/shiftChecklistItems";
import { getAssetUrl } from "@/lib/appVersion";
import { exportShiftChecklistPdf } from "@/lib/shiftChecklistPdf";
import {
  clearChecklistItems,
  getStoredCheckDate,
  getStoredCheckEmployee,
  getStoredCheckVenue,
  getStoredCleaningType,
  getStoredShiftType,
  isChecklistItemChecked,
  setChecklistItemChecked,
  setStoredCheckDate,
  setStoredCheckEmployee,
  setStoredCheckVenue,
  setStoredCleaningType,
  setStoredShiftType,
  todayIsoDate,
} from "@/lib/shiftChecklistStorage";
import "../staff/staff-inventory.css";
import "./shift-checklist.css";

export function ShiftChecklistApp() {
  const [hydrated, setHydrated] = useState(false);
  const [venue, setVenue] = useState<StaffInventoryVenue>("gastrofood");
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [shift, setShift] = useState<ShiftType>("day");
  const [cleaning, setCleaning] = useState<CleaningType>("regular");
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const venueLabel = STAFF_INVENTORY_VENUE_LABELS[venue];

  const items = useMemo(
    () => getShiftChecklistItems(venue, cleaning),
    [venue, cleaning],
  );

  useEffect(() => {
    setVenue(getStoredCheckVenue());
    setDate(getStoredCheckDate() || todayIsoDate());
    setEmployee(getStoredCheckEmployee());
    setShift(getStoredShiftType());
    setCleaning(getStoredCleaningType());
    setHydrated(true);
  }, []);

  const sections = useMemo(() => {
    void revision;
    const grouped = new Map<string, typeof items>();
    items.forEach((item) => {
      const list = grouped.get(item.section) ?? [];
      list.push(item);
      grouped.set(item.section, list);
    });
    return Array.from(grouped.entries()).map(([title, sectionItems]) => ({
      title,
      items: sectionItems.map((item) => ({
        ...item,
        checked: isChecklistItemChecked(venue, item.id),
      })),
    }));
  }, [items, revision, venue]);

  const completedCount = useMemo(
    () => sections.reduce((sum, section) => sum + section.items.filter((item) => item.checked).length, 0),
    [sections],
  );

  const handleVenueChange = (nextVenue: StaffInventoryVenue) => {
    if (nextVenue === venue) return;
    setVenue(nextVenue);
    setStoredCheckVenue(nextVenue);
    bump();
  };

  const handleShiftChange = (nextShift: ShiftType) => {
    setShift(nextShift);
    setStoredShiftType(nextShift);
  };

  const handleCleaningChange = (nextCleaning: CleaningType) => {
    setCleaning(nextCleaning);
    setStoredCleaningType(nextCleaning);
    bump();
  };

  const toggleItem = (itemId: string) => {
    const checked = !isChecklistItemChecked(venue, itemId);
    setChecklistItemChecked(venue, itemId, checked);
    bump();
  };

  const handleResetChecks = () => {
    if (!window.confirm("Clear all checklist marks for this venue?")) return;
    clearChecklistItems(
      venue,
      items.map((item) => item.id),
    );
    bump();
  };

  const handleExportPdf = () => {
    exportShiftChecklistPdf({
      venueLabel,
      date,
      employee,
      shiftLabel: SHIFT_TYPE_LABELS[shift],
      cleaningLabel: CLEANING_TYPE_LABELS[cleaning],
      sections: sections.map((section) => ({
        title: section.title,
        items: section.items.map((item) => ({
          label: item.label,
          checked: item.checked,
        })),
      })),
    });
  };

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        Loading...
      </div>
    );
  }

  return (
    <div className="staff-inventory">
      <div className="app">
        <div className="top">
          <div className="venuePicker">
            {STAFF_INVENTORY_VENUES.map((option) => (
              <button
                key={option}
                type="button"
                className={`venueOption ${option === venue ? "active" : ""}`}
                onClick={() => handleVenueChange(option)}
                aria-pressed={option === venue}
                aria-label={STAFF_INVENTORY_VENUE_LABELS[option]}
              >
                <img
                  src={getAssetUrl(STAFF_INVENTORY_VENUE_LOGOS[option])}
                  alt={STAFF_INVENTORY_VENUE_LABELS[option]}
                />
              </button>
            ))}
          </div>

          <div className="meta">
            <div className="box">
              <label htmlFor="check-date">Date</label>
              <input
                id="check-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setStoredCheckDate(event.target.value);
                }}
              />
            </div>
            <div className="box">
              <label htmlFor="check-employee">Employee</label>
              <input
                id="check-employee"
                type="text"
                placeholder="Name"
                value={employee}
                onChange={(event) => {
                  setEmployee(event.target.value);
                  setStoredCheckEmployee(event.target.value);
                }}
              />
            </div>
          </div>

          <div>
            <span className="segmentLabel">Shift</span>
            <div className="segmentPicker">
              {(["day", "evening"] as ShiftType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`segmentBtn ${shift === option ? "active" : ""}`}
                  onClick={() => handleShiftChange(option)}
                >
                  {SHIFT_TYPE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="segmentLabel">Cleaning</span>
            <div className="segmentPicker">
              {(["regular", "general"] as CleaningType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`segmentBtn ${cleaning === option ? "active" : ""}`}
                  onClick={() => handleCleaningChange(option)}
                >
                  {CLEANING_TYPE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="progress">
            <label>Completed</label>
            <b>
              {completedCount} / {items.length}
            </b>
          </div>
        </div>

        <div className="main">
          <div className="mode">
            <span>
              {venueLabel} · {SHIFT_TYPE_LABELS[shift]} ·{" "}
              {CLEANING_TYPE_LABELS[cleaning]}
            </span>
            <button type="button" className="dark" onClick={handleResetChecks}>
              Reset
            </button>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <div className="checkSection">{section.title}</div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`checkItem ${item.checked ? "checked" : ""}`}
                  onClick={() => toggleItem(item.id)}
                  aria-pressed={item.checked}
                >
                  <span className="checkBox" aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                  <span className="checkLabel">{item.label}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="exportOnly">
            <button type="button" className="gold" onClick={handleExportPdf}>
              Export PDF
            </button>
          </div>

          <p className="note">
            Tap a task to mark it done. Export PDF saves the checklist with all
            checkmarks for this shift.
          </p>
        </div>
      </div>
    </div>
  );
}
