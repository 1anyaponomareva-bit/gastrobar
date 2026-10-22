import type { StaffStockItem } from "@/data/staffInStockItems";

export type ParsedStockValue = {
  itemId: string;
  restaurant?: string;
  warehouse?: string;
};

export type ParsedStockMessage = {
  values: ParsedStockValue[];
  unrecognized: string[];
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?|\?)`;
const SEP = String.raw`\s*[-–—:=]\s*`;
const LEADING_RE = new RegExp(String.raw`^\s*${NUMBER}${SEP}(.+?)\s*$`);
const TRAILING_RE = new RegExp(String.raw`^\s*(.+?)${SEP}${NUMBER}\s*$`);
const ANY_NUMBER_RE = new RegExp(NUMBER);

const ALIASES: Record<string, string[]> = {
  "pita-bread": ["pita", "pitabread", "пита", "лаваш"],
  tortilla: ["tortilia", "tortila", "tortillas", "тортилья"],
  "beef-patty-200": ["beefpatty200", "beefpatty200gr"],
  "beef-patty-120": ["beefpatty120", "beefpatty120gr"],
  "sauce-cheese": ["cheesesauce"],
  "sauce-burger": ["burgersauce"],
  "sauce-greek": ["greeksauce"],
  "sauce-tomato-herbs": ["tomatoherbs", "tomatoandherbs", "tomatosauce", "saucetomatoandherbs"],
  "sauce-tartar": ["tartarsauce", "tartar"],
  "sauce-honey-mustard": ["honeymustard", "honeymustardsauce"],
  "sauce-onion-spread": ["onionspread", "onionsauce"],
  "salad-dressing": ["dressing", "saladdressing"],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeNumber(value: string): string {
  return value === "?" ? "" : value.replace(",", ".");
}

function buildLookup(items: StaffStockItem[]): Map<string, string> {
  const lookup = new Map<string, string>();
  items.forEach((item) => {
    [...Object.values(item.name), ...(ALIASES[item.id] ?? [])].forEach(
      (name) => {
        lookup.set(normalize(name), item.id);
        const withoutVolume = normalize(
          name.replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:l|л)\s*\)/giu, ""),
        );
        if (!lookup.has(withoutVolume)) lookup.set(withoutVolume, item.id);
      },
    );
  });
  return lookup;
}

function findItemId(
  rawName: string,
  lookup: Map<string, string>,
): string | undefined {
  const key = normalize(rawName);
  if (!key) return undefined;
  const exact = lookup.get(key);
  if (exact) return exact;

  const singular = key.replace(/(es|s)$/u, "");
  for (const [name, id] of lookup) {
    if (name.replace(/(es|s)$/u, "") === singular) return id;
  }
  return undefined;
}

export function parseStockMessage(
  text: string,
  items: StaffStockItem[],
): ParsedStockMessage {
  const lookup = buildLookup(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const values = new Map<string, ParsedStockValue>();
  const unrecognized: string[] = [];

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const [mainPart, ...rest] = line.split("/");
    const match = mainPart.match(LEADING_RE);
    const trailing = match ? null : mainPart.match(TRAILING_RE);
    const restaurantRaw = match ? match[1] : trailing?.[2];
    const nameRaw = match ? match[2] : trailing?.[1];

    if (restaurantRaw === undefined || nameRaw === undefined) {
      if (/\d/.test(line) && rest.length) unrecognized.push(line);
      return;
    }

    const itemId = findItemId(nameRaw, lookup);
    if (!itemId) {
      unrecognized.push(line);
      return;
    }

    const parsed: ParsedStockValue = {
      itemId,
      restaurant: normalizeNumber(restaurantRaw),
    };

    const warehouseMatch = rest.join("/").match(ANY_NUMBER_RE);
    if (warehouseMatch && !byId.get(itemId)?.noWarehouse) {
      parsed.warehouse = normalizeNumber(warehouseMatch[1]);
    }

    values.set(itemId, parsed);
  });

  return { values: Array.from(values.values()), unrecognized };
}
