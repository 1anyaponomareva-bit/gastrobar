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
const WAREHOUSE_WORD = String.raw`(?:ware\s*house|w\/h|склад|kho)`;
const WAREHOUSE_AFTER_RE = new RegExp(
  String.raw`\/?\s*${NUMBER}\s*[-–—:=]?\s*${WAREHOUSE_WORD}`,
  "iu",
);
const WAREHOUSE_BEFORE_RE = new RegExp(
  String.raw`\/?\s*${WAREHOUSE_WORD}\s*[-–—:=]?\s*${NUMBER}`,
  "iu",
);
const RECORD_START_RE = new RegExp(
  String.raw`(?<!\/\s*)[ \t]+(?=${NUMBER}\s*[-–—:=]\s*(?!${WAREHOUSE_WORD})\p{L})`,
  "giu",
);

/**
 * Text copied from Zalo on Android can use other line separators, invisible
 * characters, look-alike slashes/dashes, or lose line breaks entirely.
 */
function normalizeMessage(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n|\r|\u2028|\u2029|\u0085/g, "\n")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[／∕⁄⧸]/g, "/")
    .replace(/[−‒‐‑]/g, "-")
    .replace(RECORD_START_RE, "\n");
}

function extractWarehouse(line: string): { rest: string; warehouse?: string } {
  const match = line.match(WAREHOUSE_AFTER_RE) ?? line.match(WAREHOUSE_BEFORE_RE);
  if (!match || match.index === undefined) return { rest: line };
  return {
    rest: (line.slice(0, match.index) + line.slice(match.index + match[0].length)).trim(),
    warehouse: match[1],
  };
}

const ALIASES: Record<string, string[]> = {
  "pita-bread": ["pita", "pitabread", "пита", "лаваш"],
  tortilla: ["tortilia", "tortila", "tortillas", "тортилья"],
  "beef-patty-200": ["beefpatty200", "beefpatty200gr"],
  "beef-patty-120": ["beefpatty120", "beefpatty120gr"],
  "classic-sausage": ["classicsausage", "hotdog"],
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

  let lastItemId: string | undefined;

  const applyWarehouse = (itemId: string, raw: string) => {
    if (byId.get(itemId)?.noWarehouse) return;
    const parsed = values.get(itemId);
    if (parsed) parsed.warehouse = normalizeNumber(raw);
  };

  normalizeMessage(text)
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      const { rest: withoutWarehouse, warehouse: keywordWarehouse } =
        extractWarehouse(line);
      const [mainPart, ...afterSlash] = withoutWarehouse.split("/");

      if (!mainPart.trim()) {
        if (keywordWarehouse !== undefined && lastItemId) {
          applyWarehouse(lastItemId, keywordWarehouse);
        }
        return;
      }

      const match = mainPart.match(LEADING_RE);
      const trailing = match ? null : mainPart.match(TRAILING_RE);
      const restaurantRaw = match ? match[1] : trailing?.[2];
      const nameRaw = match ? match[2] : trailing?.[1];

      if (restaurantRaw === undefined || nameRaw === undefined) {
        if (/\d/.test(line) && (afterSlash.length || keywordWarehouse)) {
          unrecognized.push(line);
        }
        return;
      }

      const itemId = findItemId(nameRaw, lookup);
      if (!itemId) {
        unrecognized.push(line);
        return;
      }

      values.set(itemId, {
        itemId,
        restaurant: normalizeNumber(restaurantRaw),
      });
      lastItemId = itemId;

      const warehouseRaw =
        keywordWarehouse ?? afterSlash.join("/").match(ANY_NUMBER_RE)?.[1];
      if (warehouseRaw !== undefined) applyWarehouse(itemId, warehouseRaw);
    });

  return { values: Array.from(values.values()), unrecognized };
}
