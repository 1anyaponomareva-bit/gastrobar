/** Line order and main-ingredient flags for yield / dish composition. */

export const MAX_MAIN_INGREDIENTS = 4;

export function moveListItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function mapIndexAfterMove(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

export function moveOpenIndexes(openIndexes: Iterable<number>, from: number, to: number): Set<number> {
  const next = new Set<number>();
  for (const index of openIndexes) next.add(mapIndexAfterMove(index, from, to));
  return next;
}

export function mainLineIndexes(flags: readonly boolean[]): number[] {
  return flags
    .map((flag, index) => (flag ? index : -1))
    .filter((index) => index >= 0)
    .slice(0, MAX_MAIN_INGREDIENTS);
}

/** Toggle a main flag. At most four mains; zero mains is allowed. */
export function toggleMainFlags(flags: readonly boolean[], index: number): boolean[] {
  if (index < 0 || index >= flags.length) return [...flags];
  const current = mainLineIndexes(flags);
  const on = current.includes(index);
  const next = on ? current.filter((item) => item !== index) : [...current, index];
  if (next.length > MAX_MAIN_INGREDIENTS) return [...flags];
  return flags.map((_, itemIndex) => next.includes(itemIndex));
}

export function withMainFlags<T extends { is_main?: boolean }>(lines: T[], index: number): T[] {
  const flags = toggleMainFlags(
    lines.map((line) => Boolean(line.is_main)),
    index,
  );
  return lines.map((line, itemIndex) => ({ ...line, is_main: flags[itemIndex] }));
}

export function compositionChipLabel(name: string | null | undefined, index: number): string {
  const trimmed = name?.trim();
  return trimmed && trimmed !== "—" ? trimmed : `#${index + 1}`;
}
