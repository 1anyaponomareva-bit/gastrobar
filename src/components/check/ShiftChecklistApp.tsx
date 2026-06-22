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
  getChecklistItemComment,
  getChecklistItemStatus,
  getStoredCheckDate,
  getStoredCheckEmployee,
  getStoredCheckVenue,
  getStoredCleaningType,
  getStoredShiftType,
  setChecklistItemComment,
  setChecklistItemStatus,
  setStoredCheckDate,
  setStoredCheckEmployee,
  setStoredCheckVenue,
  setStoredCleaningType,
  setStoredShiftType,
  todayIsoDate,
  type ChecklistItemStatus,
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
    () => getShiftChecklistItems(venue, cleaning, shift),
    [venue, cleaning, shift],
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
    const blockMap = new Map<string, typeof items>();
    items.forEach((item) => {
      const list = blockMap.get(item.section) ?? [];
      list.push(item);
      blockMap.set(item.section, list);
    });

    return Array.from(blockMap.entries()).map(([title, sectionItems]) => {
      const groupMap = new Map<string, typeof sectionItems>();
      sectionItems.forEach((item) => {
        const groupKey = item.group?.trim() || "";
        const list = groupMap.get(groupKey) ?? [];
        list.push(item);
        groupMap.set(groupKey, list);
      });

      return {
        title,
        groups: Array.from(groupMap.entries()).map(([groupTitle, groupItems]) => ({
          title: groupTitle || null,
          items: groupItems.map((item) => ({
            ...item,
            status: getChecklistItemStatus(venue, item.id),
            comment: getChecklistItemComment(venue, item.id),
          })),
        })),
      };
    });
  }, [items, revision, venue]);

  const completedCount = useMemo(
    () =>
      sections.reduce(
        (sum, section) =>
          sum +
          section.groups.reduce(
            (groupSum, group) =>
              groupSum + group.items.filter((item) => item.status === "done").length,
            0,
          ),
        0,
      ),
    [sections],
  );

  const failedCount = useMemo(
    () =>
      sections.reduce(
        (sum, section) =>
          sum +
          section.groups.reduce(
            (groupSum, group) =>
              groupSum +
              group.items.filter((item) => item.status === "failed").length,
            0,
          ),
        0,
      ),
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
    bump();
  };

  const handleCleaningChange = (nextCleaning: CleaningType) => {
    setCleaning(nextCleaning);
    setStoredCleaningType(nextCleaning);
    bump();
  };

  const markDone = (itemId: string) => {
    const current = getChecklistItemStatus(venue, itemId);
    setChecklistItemStatus(venue, itemId, current === "done" ? "none" : "done");
    bump();
  };

  const markFailed = (itemId: string) => {
    const current = getChecklistItemStatus(venue, itemId);
    setChecklistItemStatus(venue, itemId, current === "failed" ? "none" : "failed");
    bump();
  };

  const handleCommentChange = (itemId: string, comment: string) => {
    setChecklistItemComment(venue, itemId, comment);
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
        items: section.groups.flatMap((group) =>
          group.items.map((item) => ({
            label: group.title ? `${group.title}: ${item.label}` : item.label,
            status: item.status,
            comment: item.comment,
          })),
        ),
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

          <div className="stats">
            <div className="stat">
              <label>Done</label>
              <b>{completedCount}</b>
            </div>
            <div className="stat">
              <label>Not done</label>
              <b className="statRed">{failedCount}</b>
            </div>
            <div className="stat">
              <label>Total</label>
              <b>{items.length}</b>
            </div>
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

          <div className="statusLegend">
            <span className="legendItem">
              <span className="statusBox doneBox active" aria-hidden="true">
                ✓
              </span>
              Done
            </span>
            <span className="legendItem">
              <span className="statusBox failBox active" aria-hidden="true">
                ✕
              </span>
              Not done
            </span>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <div className="checkSection">{section.title}</div>
              {section.groups.map((group) => (
                <div key={group.title ?? "__default"}>
                  {group.title ? (
                    <div className="checkGroup">{group.title}</div>
                  ) : null}
                  {group.items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      label={item.label}
                      status={item.status}
                      comment={item.comment}
                      failPlaceholder={
                        venue === "gastrobar"
                          ? "Укажите причину, почему не выполнено"
                          : "Why was this not completed?"
                      }
                      onMarkDone={() => markDone(item.id)}
                      onMarkFailed={() => markFailed(item.id)}
                      onCommentChange={(value) =>
                        handleCommentChange(item.id, value)
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}

          <div className="exportOnly">
            <button type="button" className="gold" onClick={handleExportPdf}>
              Export PDF
            </button>
          </div>

          <p className="note">
            Tap ✓ on the left if done, ✕ on the right if not done. Add a reason
            when marking not done. Export PDF includes all marks and comments.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({
  label,
  status,
  comment,
  failPlaceholder,
  onMarkDone,
  onMarkFailed,
  onCommentChange,
}: {
  label: string;
  status: ChecklistItemStatus;
  comment: string;
  failPlaceholder: string;
  onMarkDone: () => void;
  onMarkFailed: () => void;
  onCommentChange: (value: string) => void;
}) {
  const rowClass =
    status === "done" ? "done" : status === "failed" ? "failed" : "";

  return (
    <div className={`checkRow ${rowClass}`}>
      <div className="checkItemMain">
        <button
          type="button"
          className={`statusBox doneBox ${status === "done" ? "active" : ""}`}
          onClick={onMarkDone}
          aria-pressed={status === "done"}
          aria-label={status === "done" ? "Mark as not selected" : "Mark as done"}
        >
          {status === "done" ? "✓" : ""}
        </button>

        <span className="checkLabel">{label}</span>

        <button
          type="button"
          className={`statusBox failBox ${status === "failed" ? "active" : ""}`}
          onClick={onMarkFailed}
          aria-pressed={status === "failed"}
          aria-label={
            status === "failed" ? "Clear not done" : "Mark as not done"
          }
        >
          {status === "failed" ? "✕" : ""}
        </button>
      </div>

      {status === "failed" ? (
        <textarea
          className="failComment"
          placeholder={failPlaceholder}
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          rows={2}
        />
      ) : null}
    </div>
  );
}
