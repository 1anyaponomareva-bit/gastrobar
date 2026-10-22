import type { StaffInventoryVenue } from "@/data/staffInventoryItems";

const PREFIX = "gf_";

function venuePrefix(venue: StaffInventoryVenue): string {
  return `${PREFIX}${venue}_`;
}

export function storageKey(
  venue: StaffInventoryVenue,
  itemIndex: number,
  field: "current" | "needed",
): string {
  return `${venuePrefix(venue)}${itemIndex}_${field}`;
}

function legacyStorageKey(
  itemIndex: number,
  field: "current" | "needed",
): string {
  return `${PREFIX}${itemIndex}_${field}`;
}

export function getStoredValue(
  venue: StaffInventoryVenue,
  itemIndex: number,
  field: "current" | "needed",
): string {
  if (typeof window === "undefined") return "";

  const value = localStorage.getItem(storageKey(venue, itemIndex, field));
  if (value !== null) return value;

  if (venue === "gastrofood") {
    return localStorage.getItem(legacyStorageKey(itemIndex, field)) ?? "";
  }

  return "";
}

export function setStoredValue(
  venue: StaffInventoryVenue,
  itemIndex: number,
  field: "current" | "needed",
  value: string,
): void {
  localStorage.setItem(storageKey(venue, itemIndex, field), value);

  if (venue === "gastrofood") {
    localStorage.removeItem(legacyStorageKey(itemIndex, field));
  }
}

export function clearStoredValues(
  venue: StaffInventoryVenue,
  itemCount: number,
): void {
  for (let i = 0; i < itemCount; i += 1) {
    localStorage.removeItem(storageKey(venue, i, "current"));
    localStorage.removeItem(storageKey(venue, i, "needed"));

    if (venue === "gastrofood") {
      localStorage.removeItem(legacyStorageKey(i, "current"));
      localStorage.removeItem(legacyStorageKey(i, "needed"));
    }
  }
}

export type StaffStockField = "restaurant" | "warehouse";

function stockStorageKey(
  venue: StaffInventoryVenue,
  itemId: string,
  field: StaffStockField,
): string {
  return `${venuePrefix(venue)}stock_${itemId}_${field}`;
}

export function getStoredStockValue(
  venue: StaffInventoryVenue,
  itemId: string,
  field: StaffStockField,
): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(stockStorageKey(venue, itemId, field)) ?? "";
}

export function setStoredStockValue(
  venue: StaffInventoryVenue,
  itemId: string,
  field: StaffStockField,
  value: string,
): void {
  localStorage.setItem(stockStorageKey(venue, itemId, field), value);
}

export function clearStoredStockValues(
  venue: StaffInventoryVenue,
  itemIds: string[],
): void {
  itemIds.forEach((itemId) => {
    localStorage.removeItem(stockStorageKey(venue, itemId, "restaurant"));
    localStorage.removeItem(stockStorageKey(venue, itemId, "warehouse"));
  });
}

export type StaffInventorySection = "purchase" | "stock";

export function getStoredSection(
  venue: StaffInventoryVenue,
): StaffInventorySection {
  if (typeof window === "undefined") return "purchase";
  return localStorage.getItem(`${venuePrefix(venue)}section`) === "stock"
    ? "stock"
    : "purchase";
}

export function setStoredSection(
  venue: StaffInventoryVenue,
  section: StaffInventorySection,
): void {
  localStorage.setItem(`${venuePrefix(venue)}section`, section);
}

export function getStoredVenue(): StaffInventoryVenue {
  if (typeof window === "undefined") return "gastrofood";
  const value = localStorage.getItem(`${PREFIX}venue`);
  return value === "gastrobar" ? "gastrobar" : "gastrofood";
}

export function setStoredVenue(venue: StaffInventoryVenue): void {
  localStorage.setItem(`${PREFIX}venue`, venue);
}

export function getStoredDate(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${PREFIX}date`) ?? "";
}

export function setStoredDate(value: string): void {
  localStorage.setItem(`${PREFIX}date`, value);
}

export function getStoredEmployee(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${PREFIX}employee`) ?? "";
}

export function setStoredEmployee(value: string): void {
  localStorage.setItem(`${PREFIX}employee`, value);
}

export function getStoredActiveCategory(venue: StaffInventoryVenue): string {
  if (typeof window === "undefined") return "All";

  const perVenue = localStorage.getItem(`${venuePrefix(venue)}active`);
  if (perVenue) return perVenue;

  if (venue === "gastrofood") {
    return localStorage.getItem(`${PREFIX}active`) ?? "All";
  }

  return "All";
}

export function setStoredActiveCategory(
  venue: StaffInventoryVenue,
  value: string,
): void {
  localStorage.setItem(`${venuePrefix(venue)}active`, value);

  if (venue === "gastrofood") {
    localStorage.removeItem(`${PREFIX}active`);
  }
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseNumber(value: string): number {
  const parsed = parseFloat(String(value || "").replace(",", "."));
  return Number.isNaN(parsed) ? 0 : parsed;
}
