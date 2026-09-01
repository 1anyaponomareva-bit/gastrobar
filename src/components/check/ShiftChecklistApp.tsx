"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckLanguageFlags } from "@/components/check/CheckLanguageFlags";
import {
  STAFF_INVENTORY_VENUE_LABELS,
  STAFF_INVENTORY_VENUE_LOGOS,
  STAFF_INVENTORY_VENUES,
  type StaffInventoryVenue,
} from "@/data/staffInventoryItems";
import {
  getShiftChecklistItems,
  isClosingSection,
  type CleaningType,
  type ShiftType,
} from "@/data/shiftChecklistItems";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverPdfFile,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";
import { translate } from "@/lib/i18n";
import {
  getCheckSectionTabLabel,
  supportsMarkAllDone,
  toCheckAppLang,
  translateChecklistText,
  translateChecklistTextForPdf,
} from "@/lib/shiftChecklistI18n";
import {
  getShiftChecklistPdfFileName,
  makeShiftChecklistPdfBlob,
  preloadShiftChecklistPdfFonts,
} from "@/lib/shiftChecklistPdf";
import {
  clearChecklistItems,
  getChecklistItemComment,
  getChecklistItemStatus,
  getStoredCheckDate,
  getStoredCheckEmployee,
  getStoredCheckSection,
  getStoredCheckVenue,
  getStoredCleaningType,
  getStoredShiftType,
  setChecklistItemComment,
  setChecklistItemStatus,
  setStoredCheckDate,
  setStoredCheckEmployee,
  setStoredCheckSection,
  setStoredCheckVenue,
  setStoredCleaningType,
  setStoredShiftType,
  todayIsoDate,
  type ChecklistItemStatus,
} from "@/lib/shiftChecklistStorage";
import { useTranslation } from "@/lib/useTranslation";
import "../staff/staff-inventory.css";
import "./shift-checklist.css";

export function ShiftChecklistApp() {
  const { lang } = useTranslation();
  const checkLang = toCheckAppLang(lang);
  const t = useCallback(
    (key: string) => translate(checkLang, key),
    [checkLang],
  );
  const [hydrated, setHydrated] = useState(false);
  const [venue, setVenue] = useState<StaffInventoryVenue>("gastrofood");
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [shift, setShift] = useState<ShiftType>("day");
  const [cleaning, setCleaning] = useState<CleaningType>("regular");
  const [activeSection, setActiveSection] = useState("");
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportBlocked, setExportBlocked] = useState(false);
  const [exportEmployeeError, setExportEmployeeError] = useState(false);
  const sharePrepareRef = useRef<{
    key: string;
    promise: Promise<Blob>;
  } | null>(null);

  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const venueLabel = STAFF_INVENTORY_VENUE_LABELS[venue];

  const items = useMemo(
    () => getShiftChecklistItems(venue, cleaning, shift),
    [venue, cleaning, shift],
  );

  useEffect(() => {
    preloadShiftChecklistPdfFonts();
  }, []);

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

  useEffect(() => {
    if (!sections.length) {
      setActiveSection("");
      return;
    }

    const stored = getStoredCheckSection(venue, shift);
    const hasStored = sections.some((section) => section.title === stored);
    const nextSection = hasStored ? stored : sections[0].title;

    setActiveSection((current) =>
      current === nextSection ? current : nextSection,
    );
  }, [sections, venue, shift]);

  const activeSectionData = useMemo(
    () => sections.find((section) => section.title === activeSection) ?? sections[0],
    [sections, activeSection],
  );

  const sectionProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    sections.forEach((section) => {
      let done = 0;
      let total = 0;
      section.groups.forEach((group) => {
        group.items.forEach((item) => {
          total += 1;
          if (item.status === "done") done += 1;
        });
      });
      map.set(section.title, { done, total });
    });
    return map;
  }, [sections]);

  const handleSectionChange = (sectionTitle: string) => {
    setActiveSection(sectionTitle);
    setStoredCheckSection(venue, shift, sectionTitle);
  };

  const showExportPdf = activeSectionData
    ? isClosingSection(activeSectionData.title)
    : false;

  const exportIssues = useMemo(() => {
    const issues: Array<{
      id: string;
      sectionTitle: string;
      groupTitle: string | null;
      label: string;
      kind: "unmarked" | "missingComment";
    }> = [];

    sections.forEach((section) => {
      section.groups.forEach((group) => {
        group.items.forEach((item) => {
          if (item.status === "none") {
            issues.push({
              id: item.id,
              sectionTitle: section.title,
              groupTitle: group.title,
              label: item.label,
              kind: "unmarked",
            });
            return;
          }

          if (item.status === "failed" && !item.comment.trim()) {
            issues.push({
              id: item.id,
              sectionTitle: section.title,
              groupTitle: group.title,
              label: item.label,
              kind: "missingComment",
            });
          }
        });
      });
    });

    return issues;
  }, [sections]);

  const formatIssueLabel = (
    item: (typeof exportIssues)[number],
  ): string => {
    const sectionLabel = getCheckSectionTabLabel(checkLang, item.sectionTitle);
    const groupLabel = item.groupTitle
      ? translateChecklistText(checkLang, item.groupTitle)
      : null;
    const itemLabel = translateChecklistText(checkLang, item.label);
    const pointLabel = groupLabel
      ? `${sectionLabel} — ${groupLabel}: ${itemLabel}`
      : `${sectionLabel}: ${itemLabel}`;

    return item.kind === "unmarked"
      ? t("check_issue_unmarked").replace("{point}", pointLabel)
      : t("check_issue_missing_comment").replace("{point}", pointLabel);
  };

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

  const penaltyPointsTotal = useMemo(
    () =>
      sections.reduce(
        (sum, section) =>
          sum +
          section.groups.reduce(
            (groupSum, group) =>
              groupSum +
              group.items.reduce((itemSum, item) => {
                if (item.status !== "failed" || item.penaltyPoints == null) {
                  return itemSum;
                }
                return itemSum + item.penaltyPoints;
              }, 0),
            0,
          ),
        0,
      ),
    [sections],
  );

  const hasPenaltyScoring = useMemo(
    () => items.some((item) => item.penaltyPoints != null),
    [items],
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
    setExportBlocked(false);
    bump();
  };

  const markFailed = (itemId: string) => {
    const current = getChecklistItemStatus(venue, itemId);
    setChecklistItemStatus(venue, itemId, current === "failed" ? "none" : "failed");
    setExportBlocked(false);
    bump();
  };

  const handleCommentChange = (itemId: string, comment: string) => {
    setChecklistItemComment(venue, itemId, comment);
    setExportBlocked(false);
    bump();
  };

  const markAllSectionDone = useCallback(() => {
    if (!activeSectionData || !supportsMarkAllDone(activeSectionData.title)) {
      return;
    }

    activeSectionData.groups.forEach((group) => {
      group.items.forEach((item) => {
        setChecklistItemStatus(venue, item.id, "done");
        setChecklistItemComment(venue, item.id, "");
      });
    });

    setExportBlocked(false);
    bump();
  }, [activeSectionData, venue, bump]);

  const performChecklistReset = useCallback(() => {
    clearChecklistItems(
      venue,
      items.map((item) => item.id),
    );

    const today = todayIsoDate();
    setDate(today);
    setStoredCheckDate(today);
    setEmployee("");
    setStoredCheckEmployee("");
    setExportBlocked(false);
    setExportEmployeeError(false);
    sharePrepareRef.current = null;

    const firstSection = sections[0]?.title ?? "";
    setActiveSection(firstSection);
    if (firstSection) {
      setStoredCheckSection(venue, shift, firstSection);
    }

    bump();
  }, [venue, items, shift, sections, bump]);

  const handleResetChecks = () => {
    if (!window.confirm(t("check_reset_confirm"))) {
      return;
    }

    performChecklistReset();
  };

  const shiftLabel = t(
    shift === "day" ? "check_shift_day" : "check_shift_evening",
  );
  const cleaningLabel = t(
    cleaning === "regular" ? "check_cleaning_regular" : "check_cleaning_general",
  );

  const pdfExportOptions = useMemo(
    () => ({
      venueLabel,
      locale: "en" as const,
      date,
      employee,
      shiftLabel: translate(
        "en",
        shift === "day" ? "check_shift_day" : "check_shift_evening",
      ),
      cleaningLabel: translate(
        "en",
        cleaning === "regular"
          ? "check_cleaning_regular"
          : "check_cleaning_general",
      ),
      sections: sections.map((section) => ({
        title: translateChecklistTextForPdf(section.title),
        items: section.groups.flatMap((group) =>
          group.items.map((item) => ({
            label: group.title
              ? `${translateChecklistTextForPdf(group.title)}: ${translateChecklistTextForPdf(item.label)}`
              : translateChecklistTextForPdf(item.label),
            status: item.status,
            comment: item.comment,
            penaltyPoints: item.penaltyPoints,
          })),
        ),
      })),
    }),
    [venueLabel, date, employee, shift, cleaning, sections],
  );

  const buildShareKey = useCallback(() => {
    return [
      venue,
      shift,
      cleaning,
      date,
      employee.trim(),
      revision,
    ].join("::");
  }, [venue, shift, cleaning, date, employee, revision]);

  const beginSharePreparation = useCallback(() => {
    if (!employee.trim() || exportIssues.length) return;

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeShiftChecklistPdfBlob(pdfExportOptions),
    };
  }, [
    buildShareKey,
    employee,
    exportIssues.length,
    pdfExportOptions,
    venueLabel,
    date,
  ]);

  const handleSharePdfResult = (result: DeliverPdfResult) => {
    if (result === "cancelled" || result === "downloaded") return;
    window.alert(t("check_share_pdf_error"));
  };

  useEffect(() => {
    if (!hydrated || !employee.trim() || exportIssues.length) {
      sharePrepareRef.current = null;
      return;
    }

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeShiftChecklistPdfBlob(pdfExportOptions),
    };
  }, [
    hydrated,
    buildShareKey,
    employee,
    exportIssues.length,
    pdfExportOptions,
  ]);

  const handleExportPdf = async () => {
    if (exportingPdf) return;

    if (!employee.trim()) {
      setExportEmployeeError(true);
      setExportBlocked(true);
      window.setTimeout(() => {
        document.getElementById("check-employee")?.focus();
        document
          .getElementById("check-employee")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setExportEmployeeError(false);

    if (exportIssues.length) {
      setExportBlocked(true);
      const first = exportIssues[0];
      setActiveSection(first.sectionTitle);
      setStoredCheckSection(venue, shift, first.sectionTitle);
      window.setTimeout(() => {
        document
          .getElementById(`check-item-${first.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setExportBlocked(false);
    setExportingPdf(true);
    try {
      const fileName = getShiftChecklistPdfFileName(venueLabel, date);
      const key = buildShareKey();
      const prepared = sharePrepareRef.current;
      const blob =
        prepared?.key === key
          ? await prepared.promise
          : await makeShiftChecklistPdfBlob(pdfExportOptions);
      const result = await deliverPdfFile(blob, fileName);

      if (result === "shared" || result === "downloaded") {
        performChecklistReset();
      } else {
        handleSharePdfResult(result);
      }
    } catch (error) {
      console.error(error);
      window.alert(t("check_share_pdf_error_generic"));
    } finally {
      setExportingPdf(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        {t("check_loading")}
      </div>
    );
  }

  return (
    <div className="staff-inventory shift-checklist">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <CheckLanguageFlags />
          </div>

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
              <label htmlFor="check-date">{t("check_date")}</label>
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
              <label htmlFor="check-employee">{t("check_employee")}</label>
              <input
                id="check-employee"
                type="text"
                placeholder={t("check_employee_placeholder")}
                value={employee}
                onChange={(event) => {
                  setEmployee(event.target.value);
                  setStoredCheckEmployee(event.target.value);
                  if (exportEmployeeError) setExportEmployeeError(false);
                }}
              />
            </div>
          </div>

          <div>
            <span className="segmentLabel">{t("check_shift_label")}</span>
            <div className="segmentPicker">
              {(["day", "evening"] as ShiftType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`segmentBtn ${shift === option ? "active" : ""}`}
                  onClick={() => handleShiftChange(option)}
                >
                  {t(
                    option === "day" ? "check_shift_day" : "check_shift_evening",
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="segmentLabel">{t("check_cleaning_label")}</span>
            <div className="segmentPicker">
              {(["regular", "general"] as CleaningType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`segmentBtn ${cleaning === option ? "active" : ""}`}
                  onClick={() => handleCleaningChange(option)}
                >
                  {t(
                    option === "regular"
                      ? "check_cleaning_regular"
                      : "check_cleaning_general",
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <label>{t("check_stat_done")}</label>
              <b>{completedCount}</b>
            </div>
            <div className="stat">
              <label>{t("check_stat_not_done")}</label>
              <b className="statRed">{failedCount}</b>
            </div>
            <div className="stat">
              <label>{t("check_stat_total")}</label>
              <b>{items.length}</b>
            </div>
          </div>
        </div>

        <div className="main">
          <div className="mode">
            <span>
              {t("check_mode_line")
                .replace("{venue}", venueLabel)
                .replace("{shift}", shiftLabel)
                .replace("{cleaning}", cleaningLabel)}
            </span>
            <button type="button" className="dark" onClick={handleResetChecks}>
              {t("check_reset")}
            </button>
          </div>

          {sections.length > 1 ? (
            <div className="tabs">
              {sections.map((section) => {
                const progress = sectionProgress.get(section.title);
                const tabLabel = getCheckSectionTabLabel(
                  checkLang,
                  section.title,
                );
                const countLabel = progress
                  ? `${progress.done}/${progress.total}`
                  : "";

                return (
                  <button
                    key={section.title}
                    type="button"
                    className={`tab ${
                      section.title === activeSectionData?.title ? "active" : ""
                    }`}
                    onClick={() => handleSectionChange(section.title)}
                  >
                    {tabLabel}
                    {countLabel ? ` ${countLabel}` : ""}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="statusLegend">
            <span className="legendItem">
              <span className="statusBox doneBox active" aria-hidden="true">
                ✓
              </span>
              {t("check_legend_done")}
            </span>
            <span className="legendItem">
              <span className="statusBox failBox active" aria-hidden="true">
                ✕
              </span>
              {t("check_legend_not_done")}
            </span>
          </div>

          {activeSectionData ? (
            <div key={activeSectionData.title}>
              <div className="checkSection">
                {translateChecklistText(checkLang, activeSectionData.title)}
              </div>
              {supportsMarkAllDone(activeSectionData.title) ? (
                <button
                  type="button"
                  className="markAllDoneBtn"
                  onClick={markAllSectionDone}
                  aria-label={t("check_aria_mark_all_done")}
                >
                  {t("check_mark_all_done")}
                </button>
              ) : null}
              {activeSectionData.groups.map((group) => (
                <div key={group.title ?? "__default"}>
                  {group.title ? (
                    <div className="checkGroup">
                      {translateChecklistText(checkLang, group.title)}
                    </div>
                  ) : null}
                  {group.items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      itemId={item.id}
                      label={translateChecklistText(checkLang, item.label)}
                      penaltyPoints={item.penaltyPoints}
                      status={item.status}
                      comment={item.comment}
                      highlightMissing={
                        exportBlocked &&
                        exportIssues.some((issue) => issue.id === item.id)
                      }
                      failPlaceholder={t("check_fail_placeholder")}
                      penaltyPointsAriaLabel={t("check_aria_penalty_points").replace(
                        "{points}",
                        String(item.penaltyPoints ?? 0),
                      )}
                      ariaMarkDone={t("check_aria_mark_done")}
                      ariaMarkNotSelected={t("check_aria_mark_not_selected")}
                      ariaMarkNotDone={t("check_aria_mark_not_done")}
                      ariaClearNotDone={t("check_aria_clear_not_done")}
                      onMarkDone={() => markDone(item.id)}
                      onMarkFailed={() => markFailed(item.id)}
                      onCommentChange={(value) =>
                        handleCommentChange(item.id, value)
                      }
                    />
                  ))}
                </div>
              ))}

              {showExportPdf ? (
                <div className="exportOnly">
                  {exportBlocked && (exportEmployeeError || exportIssues.length) ? (
                    <div className="exportError" role="alert">
                      <strong>{t("check_export_blocked_title")}</strong>
                      <ul>
                        {exportEmployeeError ? (
                          <li>{t("check_export_employee_required")}</li>
                        ) : null}
                        {exportIssues.map((item) => (
                          <li key={`${item.id}-${item.kind}`}>
                            {formatIssueLabel(item)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="gold"
                    onPointerDown={beginSharePreparation}
                    onTouchStart={beginSharePreparation}
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                  >
                    {exportingPdf ? t("check_sharing_pdf") : t("check_share_pdf")}
                  </button>
                  {hasPenaltyScoring && failedCount > 0 ? (
                    <p className="penaltyTotal" role="status">
                      {t("check_penalty_points").replace(
                        "{points}",
                        String(penaltyPointsTotal),
                      )}
                    </p>
                  ) : null}
                  <div className="penaltiesBlock">
                    <h3 className="penaltiesTitle">{t("check_penalties_title")}</h3>
                    <ul className="penaltiesList">
                      <li>{t("check_penalty_tier_remark")}</li>
                      <li>{t("check_penalty_tier_12")}</li>
                      <li>{t("check_penalty_tier_22")}</li>
                      <li>{t("check_penalty_tier_32")}</li>
                      <li>{t("check_penalty_tier_42")}</li>
                    </ul>
                  </div>
                  <p className="note">{t("check_note_pdf")}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {!showExportPdf ? (
            <p className="note">{t("check_note_items")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({
  itemId,
  label,
  penaltyPoints,
  status,
  comment,
  failPlaceholder,
  highlightMissing,
  penaltyPointsAriaLabel,
  ariaMarkDone,
  ariaMarkNotSelected,
  ariaMarkNotDone,
  ariaClearNotDone,
  onMarkDone,
  onMarkFailed,
  onCommentChange,
}: {
  itemId: string;
  label: string;
  penaltyPoints?: number;
  status: ChecklistItemStatus;
  comment: string;
  failPlaceholder: string;
  highlightMissing?: boolean;
  penaltyPointsAriaLabel: string;
  ariaMarkDone: string;
  ariaMarkNotSelected: string;
  ariaMarkNotDone: string;
  ariaClearNotDone: string;
  onMarkDone: () => void;
  onMarkFailed: () => void;
  onCommentChange: (value: string) => void;
}) {
  const rowClass = [
    status === "done" ? "done" : status === "failed" ? "failed" : "",
    highlightMissing ? "missingMark" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div id={`check-item-${itemId}`} className={`checkRow ${rowClass}`}>
      <div className="checkItemMain">
        <button
          type="button"
          className={`statusBox doneBox ${status === "done" ? "active" : ""}`}
          onClick={onMarkDone}
          aria-pressed={status === "done"}
          aria-label={status === "done" ? ariaMarkNotSelected : ariaMarkDone}
        >
          {status === "done" ? "✓" : ""}
        </button>

        <span className="checkLabelText">{label}</span>

        <button
          type="button"
          className={`statusBox failBox ${status === "failed" ? "active" : ""}`}
          onClick={onMarkFailed}
          aria-pressed={status === "failed"}
          aria-label={
            status === "failed" ? ariaClearNotDone : ariaMarkNotDone
          }
        >
          {status === "failed" ? "✕" : ""}
        </button>

        {penaltyPoints != null ? (
          <span
            className={[
              "penaltyPoints",
              status === "done" ? "penaltyPointsDone" : "",
              status === "failed" ? "penaltyPointsFailed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={penaltyPointsAriaLabel}
          >
            {penaltyPoints}
          </span>
        ) : null}
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
