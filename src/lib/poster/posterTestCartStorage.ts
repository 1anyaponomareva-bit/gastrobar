import type { CartItem } from "@/lib/poster/posterTestCartHelpers";

const CART_KEY = "pt_cart_v1";
const PHONE_KEY = "pt_customer_phone";
const NAME_KEY = "pt_customer_name";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function loadPosterTestCartItems(): CartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.key === "string" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number(item.quantity) > 0 &&
        Number(item.unitPrice) > 0,
    );
  } catch {
    return [];
  }
}

export function savePosterTestCartItems(items: CartItem[]): void {
  if (!canUseStorage()) return;
  if (items.length === 0) {
    localStorage.removeItem(CART_KEY);
    return;
  }
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function clearPosterTestCartItems(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(CART_KEY);
}

export function getStoredCustomerPhone(): string {
  if (!canUseStorage()) return "";
  return localStorage.getItem(PHONE_KEY)?.trim() ?? "";
}

export function setStoredCustomerPhone(value: string): void {
  if (!canUseStorage()) return;
  const trimmed = value.trim();
  if (!trimmed) {
    localStorage.removeItem(PHONE_KEY);
    return;
  }
  localStorage.setItem(PHONE_KEY, trimmed);
}

export function getStoredCustomerName(): string {
  if (!canUseStorage()) return "";
  return localStorage.getItem(NAME_KEY)?.trim() ?? "";
}

export function setStoredCustomerName(value: string): void {
  if (!canUseStorage()) return;
  const trimmed = value.trim();
  if (!trimmed) {
    localStorage.removeItem(NAME_KEY);
    return;
  }
  localStorage.setItem(NAME_KEY, trimmed);
}
