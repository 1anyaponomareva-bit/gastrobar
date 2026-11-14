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

/** Cuts exist only for weighed products. Pieces never get a нарезка plaque. */
export function canCutParts(unit: string | null | undefined): boolean {
  return unit === "kg" || unit === "l";
}

/** Plaque stays hidden until the cook presses Нарезка. Saved parts do not auto-open it. */
export function cutsPlaqueOpen(userOpen: boolean, unit: string | null | undefined): boolean {
  return Boolean(userOpen) && canCutParts(unit);
}

/** First open seeds one empty row so they can type a cut immediately. */
export function openCutsDraft(parts: LinePart[] | undefined): LinePart[] {
  return parts?.length ? parts : [{ name: "", grams: null }];
}

/** Closing without filled cuts clears the empty starter row. */
export function closeCutsDraft(parts: LinePart[] | undefined): LinePart[] {
  return filledParts(parts);
}

export function partsRemainderGrams(parts: LinePart[] | undefined, parentSmall: number | null): number | null {
  if (parentSmall == null) return null;
  return parentSmall - partsSumGrams(parts);
}

export function toggleCutsState(
  openIndexes: Iterable<number>,
  index: number,
  parts: LinePart[],
): { open: Set<number>; parts: LinePart[] } {
  const open = new Set(openIndexes);
  if (open.has(index)) {
    open.delete(index);
    return { open, parts: closeCutsDraft(parts) };
  }
  open.add(index);
  return { open, parts: openCutsDraft(parts) };
}

export function shiftOpenCuts(openIndexes: Iterable<number>, removedIndex: number): Set<number> {
  const next = new Set<number>();
  for (const index of openIndexes) {
    if (index === removedIndex) continue;
    next.add(index > removedIndex ? index - 1 : index);
  }
  return next;
}
