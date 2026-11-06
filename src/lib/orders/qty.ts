/** Fractional quantities: "1,5" and "1.5" both count. */

export function parseQty(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value ?? "").trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

export function isPositiveQty(value: string | number | null | undefined): boolean {
  return parseQty(value) > 0;
}

export function lineKey(productId: string, packId: string | null | undefined): string {
  return `${productId}::${packId ?? ""}`;
}
