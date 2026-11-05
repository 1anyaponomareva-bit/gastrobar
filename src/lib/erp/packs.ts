/**
 * Pack labels are stored as written by the Staff import ("box 10*1040 g", "pcs 1 L").
 * This module only reads them for display: stored labels and qty_base stay untouched,
 * and a label that does not match a known pattern is shown unchanged.
 */

export type PackContainer = "box" | "pack" | "pcs" | "btl" | "can" | "bag";
export type PackUnit = "g" | "kg" | "ml" | "l" | "pcs";

export type ParsedPack = {
  /** null when the label starts with a measure unit ("kg 5 kg"): sold by weight/volume, no container. */
  container: PackContainer | null;
  /** Inner pieces of a multipack ("10*1040 g" → 10). */
  count: number | null;
  size: number;
  /** Upper bound of a range ("13-15 kg"). */
  sizeTo: number | null;
  unit: PackUnit;
};

const CONTAINERS: Record<string, PackContainer> = {
  box: "box", pack: "pack", pcs: "pcs", pc: "pcs", btl: "btl", bottle: "btl", can: "can", bag: "bag",
};
const MEASURES = new Set(["g", "kg", "ml", "l"]);
const UNITS: Record<string, PackUnit> = { g: "g", gr: "g", kg: "kg", ml: "ml", l: "l", pcs: "pcs", pc: "pcs" };

const num = (text: string) => Number(text.replace(/\s+/g, "").replace(",", "."));

const PATTERN = new RegExp(
  "^([a-z]+)\\s+" + // container or measure unit
    "(?:(\\d+)\\s*[*x×]\\s*)?" + // count of inner pieces
    "(\\d[\\d ]*(?:[.,]\\d+)?)" + // size
    "(?:\\s*[-–]\\s*(\\d[\\d ]*(?:[.,]\\d+)?))?" + // range upper bound
    "\\s*([a-z]+)$",
  "i",
);

export function parsePackLabel(label: string | null | undefined): ParsedPack | null {
  const match = PATTERN.exec((label ?? "").trim().replace(/\s+/g, " "));
  if (!match) return null;
  const head = match[1].toLowerCase();
  const unit = UNITS[match[5].toLowerCase()];
  if (!unit) return null;
  let container: PackContainer | null;
  if (CONTAINERS[head]) container = CONTAINERS[head];
  else if (MEASURES.has(head)) container = null;
  else return null;
  const size = num(match[3]);
  const sizeTo = match[4] ? num(match[4]) : null;
  const count = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(size) || (sizeTo !== null && !Number.isFinite(sizeTo))) return null;
  return { container, count, size, sizeTo, unit };
}

/** Base quantity of `packQty` packs (pack size = qty_base of the stored pack). */
export const packToBase = (packQty: number, qtyBase: number) => Math.round(packQty * qtyBase * 1e6) / 1e6;
/** Price of one pack from the price per base unit. */
export const packPrice = (unitPrice: number, qtyBase: number) => unitPrice * qtyBase;

export type PackWords = {
  container: (container: PackContainer) => string;
  unit: (unit: PackUnit) => string;
  num: (value: number) => string;
};

/** "box 10*1040 g" → "Коробка: 10 × 1 040 г"; unknown patterns are returned as stored. */
export function formatPackLabel(label: string, words: PackWords): string {
  const pack = parsePackLabel(label);
  if (!pack) return label;
  const size = pack.sizeTo !== null ? `${words.num(pack.size)}–${words.num(pack.sizeTo)}` : words.num(pack.size);
  const amount = `${pack.count !== null ? `${words.num(pack.count)} × ` : ""}${size} ${words.unit(pack.unit)}`;
  return pack.container ? `${words.container(pack.container)}: ${amount}` : amount;
}
