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

export type QtyProgress = {
  orderedQty: number;
  acceptedQty: number;
  postedQty: number;
  remainingQty?: number;
};

function finiteQty(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Qty still open to receive: ordered − accepted − closed.
 * Previous table formula copied this into «Осталось», so a just-placed 1 Pack looked like warehouse leftover.
 */
export function openReceiveQty(line: QtyProgress): number {
  if (line.remainingQty != null && Number.isFinite(line.remainingQty)) return Math.max(0, line.remainingQty);
  return Math.max(0, finiteQty(line.orderedQty) - finiteQty(line.acceptedQty));
}

/**
 * Table/card «Осталось»: leftover after goods are in the warehouse, not the open PO
 * and not employee «Товар получен». If nothing is posted this is 0.
 * After a posted receipt, leftover is outstanding on the document: max(0, ordered − posted),
 * capped by remainingQty so «Закрыть недопоставку» leftover does not reappear after close.
 */
export function displayRemainingQty(line: QtyProgress): number {
  const ordered = finiteQty(line.orderedQty);
  const posted = finiteQty(line.postedQty);
  if (posted <= 0) return 0;
  const afterPost = Math.max(0, ordered - posted);
  if (line.remainingQty == null || !Number.isFinite(line.remainingQty)) return afterPost;
  return Math.max(0, Math.min(afterPost, line.remainingQty));
}

export function sumDisplayRemaining(lines: QtyProgress[]): number {
  return lines.reduce((sum, line) => sum + displayRemainingQty(line), 0);
}
