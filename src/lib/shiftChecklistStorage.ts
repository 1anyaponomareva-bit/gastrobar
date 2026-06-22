import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import type { CleaningType, ShiftType } from "@/data/shiftChecklistItems";

const PREFIX = "gc_";

export type ChecklistItemStatus = "none" | "done" | "failed";

function venuePrefix(venue: StaffInventoryVenue): string {
  return `${PREFIX}${venue}_`;
}

function statusKey(venue: StaffInventoryVenue, itemId: string): string {
  return `${venuePrefix(venue)}status_${itemId}`;
}

function commentKey(venue: StaffInventoryVenue, itemId: string): string {
  return `${venuePrefix(venue)}comment_${itemId}`;
}

/** @deprecated legacy done flag */
function legacyDoneKey(venue: StaffInventoryVenue, itemId: string): string {
  return `${venuePrefix(venue)}item_${itemId}`;
}

export function getChecklistItemStatus(
  venue: StaffInventoryVenue,
  itemId: string,
): ChecklistItemStatus {
  if (typeof window === "undefined") return "none";

  const status = localStorage.getItem(statusKey(venue, itemId));
  if (status === "done" || status === "failed") return status;

  if (localStorage.getItem(legacyDoneKey(venue, itemId)) === "1") {
    return "done";
  }

  return "none";
}

export function setChecklistItemStatus(
  venue: StaffInventoryVenue,
  itemId: string,
  status: ChecklistItemStatus,
): void {
  if (status === "none") {
    localStorage.removeItem(statusKey(venue, itemId));
    localStorage.removeItem(commentKey(venue, itemId));
    localStorage.removeItem(legacyDoneKey(venue, itemId));
    return;
  }

  localStorage.setItem(statusKey(venue, itemId), status);
  localStorage.removeItem(legacyDoneKey(venue, itemId));

  if (status === "done") {
    localStorage.removeItem(commentKey(venue, itemId));
  }
}

export function getChecklistItemComment(
  venue: StaffInventoryVenue,
  itemId: string,
): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(commentKey(venue, itemId)) ?? "";
}

export function setChecklistItemComment(
  venue: StaffInventoryVenue,
  itemId: string,
  comment: string,
): void {
  localStorage.setItem(commentKey(venue, itemId), comment);
}

export function clearChecklistItems(
  venue: StaffInventoryVenue,
  itemIds: string[],
): void {
  itemIds.forEach((itemId) => {
    localStorage.removeItem(statusKey(venue, itemId));
    localStorage.removeItem(commentKey(venue, itemId));
    localStorage.removeItem(legacyDoneKey(venue, itemId));
  });
}

export function getStoredCheckVenue(): StaffInventoryVenue {
  if (typeof window === "undefined") return "gastrofood";
  const value = localStorage.getItem(`${PREFIX}venue`);
  return value === "gastrobar" ? "gastrobar" : "gastrofood";
}

export function setStoredCheckVenue(venue: StaffInventoryVenue): void {
  localStorage.setItem(`${PREFIX}venue`, venue);
}

export function getStoredCheckDate(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${PREFIX}date`) ?? "";
}

export function setStoredCheckDate(value: string): void {
  localStorage.setItem(`${PREFIX}date`, value);
}

export function getStoredCheckEmployee(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${PREFIX}employee`) ?? "";
}

export function setStoredCheckEmployee(value: string): void {
  localStorage.setItem(`${PREFIX}employee`, value);
}

export function getStoredShiftType(): ShiftType {
  if (typeof window === "undefined") return "day";
  return localStorage.getItem(`${PREFIX}shift`) === "evening" ? "evening" : "day";
}

export function setStoredShiftType(value: ShiftType): void {
  localStorage.setItem(`${PREFIX}shift`, value);
}

export function getStoredCleaningType(): CleaningType {
  if (typeof window === "undefined") return "regular";
  return localStorage.getItem(`${PREFIX}cleaning`) === "general"
    ? "general"
    : "regular";
}

export function setStoredCleaningType(value: CleaningType): void {
  localStorage.setItem(`${PREFIX}cleaning`, value);
}

function activeSectionKey(
  venue: StaffInventoryVenue,
  shift: ShiftType,
): string {
  return `${PREFIX}section_${venue}_${shift}`;
}

export function getStoredCheckSection(
  venue: StaffInventoryVenue,
  shift: ShiftType,
): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(activeSectionKey(venue, shift)) ?? "";
}

export function setStoredCheckSection(
  venue: StaffInventoryVenue,
  shift: ShiftType,
  section: string,
): void {
  localStorage.setItem(activeSectionKey(venue, shift), section);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** @deprecated use getChecklistItemStatus */
export function isChecklistItemChecked(
  venue: StaffInventoryVenue,
  itemId: string,
): boolean {
  return getChecklistItemStatus(venue, itemId) === "done";
}

/** @deprecated use setChecklistItemStatus */
export function setChecklistItemChecked(
  venue: StaffInventoryVenue,
  itemId: string,
  checked: boolean,
): void {
  setChecklistItemStatus(venue, itemId, checked ? "done" : "none");
}
