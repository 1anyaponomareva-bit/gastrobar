/** Nested cuts under a composition line. Grams (or ml) must sum to the parent net. */

export const MAX_LINE_PARTS = 10;

export type LinePart = { name: string; grams: number | null };

export type PartsIssue = "empty_row" | "too_many" | "need_net" | "sum" | "unit" | null;

export function emptyParts(): LinePart[] {
  return [];
}

export function parseLineParts(value: unknown): LinePart[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_LINE_PARTS).map((item) => {
    const row = item as { name?: unknown; grams?: unknown };
    const grams = typeof row.grams === "number" && Number.isFinite(row.grams) ? row.grams : Number(row.grams);
    return {
      name: typeof row.name === "string" ? row.name : "",
      grams: Number.isFinite(grams) ? grams : null,
    };
  });
}

/** kg/l net → grams or millilitres. */
export function netToSmallUnit(net: number | null | undefined): number | null {
  if (net == null || !Number.isFinite(net)) return null;
  return Math.round(net * 1000);
}

export function filledParts(parts: LinePart[] | undefined): LinePart[] {
  return (parts ?? []).filter((part) => part.name.trim() !== "" || part.grams != null);
}

export function partsSumGrams(parts: LinePart[] | undefined): number {
  return filledParts(parts).reduce((sum, part) => sum + (part.grams ?? 0), 0);
}

export function partsIssue(parts: LinePart[] | undefined, parentSmall: number | null, unit: string | null | undefined): PartsIssue {
  const rows = filledParts(parts);
  if (!rows.length) return null;
  if (unit === "pcs") return "unit";
  if (rows.length > MAX_LINE_PARTS) return "too_many";
  if (rows.some((part) => !part.name.trim() || part.grams == null || part.grams < 0)) return "empty_row";
  if (parentSmall == null) return "need_net";
  if (partsSumGrams(rows) !== parentSmall) return "sum";
  return null;
}
