import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import type { CleaningType, ShiftType } from "@/data/shiftChecklistItems";

const PREFIX = "gc_";

function venuePrefix(venue: StaffInventoryVenue): string {
  return `${PREFIX}${venue}_`;
}

export function checklistItemKey(
  venue: StaffInventoryVenue,
  itemId: string,
): string {
  return `${venuePrefix(venue)}item_${itemId}`;
}

export function isChecklistItemChecked(
  venue: StaffInventoryVenue,
  itemId: string,
): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(checklistItemKey(venue, itemId)) === "1";
}

export function setChecklistItemChecked(
  venue: StaffInventoryVenue,
  itemId: string,
  checked: boolean,
): void {
  localStorage.setItem(checklistItemKey(venue, itemId), checked ? "1" : "0");
}

export function clearChecklistItems(
  venue: StaffInventoryVenue,
  itemIds: string[],
): void {
  itemIds.forEach((itemId) => {
    localStorage.removeItem(checklistItemKey(venue, itemId));
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

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
