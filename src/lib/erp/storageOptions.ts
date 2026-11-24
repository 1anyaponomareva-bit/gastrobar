/** Multiple shelf-life / temperature rows on a prep or product card. */

export type StorageOption = {
  /** Temperature or free-text conditions, e.g. "0…4 °C" or "−10 °C". */
  conditions: string;
  /** Days at those conditions; null = not set (temperature-only fridge row). */
  days: number | null;
};

type StoredV1 = { v: 1; items: { conditions?: unknown; days?: unknown }[] };

function asDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asConditions(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function emptyStorageOption(): StorageOption {
  return { conditions: "", days: null };
}

/** Read legacy plain text + days, or the multi-row JSON payload. */
export function parseStorageOptions(
  conditions: string | null | undefined,
  days: number | null | undefined,
): StorageOption[] {
  const text = (conditions ?? "").trim();
  if (text.startsWith("{")) {
    try {
      const raw = JSON.parse(text) as StoredV1;
      if (raw && raw.v === 1 && Array.isArray(raw.items) && raw.items.length) {
        return raw.items.map((item) => ({
          conditions: asConditions(item?.conditions),
          days: asDays(item?.days),
        }));
      }
    } catch {
      /* treat as plain temperature text */
    }
  }
  if (text || asDays(days) != null) return [{ conditions: text, days: asDays(days) }];
  return [emptyStorageOption()];
}

/**
 * One plain row stays in the legacy columns as-is.
 * Two or more rows are JSON in storage_conditions; shelf_life_days = shortest positive term
 * (used for production expiry when a single number is required).
 */
export function serializeStorageOptions(options: StorageOption[]): {
  shelf_life_days: number | null;
  storage_conditions: string;
} {
  const filled = options
    .map((row) => ({
      conditions: row.conditions.trim(),
      days: asDays(row.days),
    }))
    .filter((row) => row.conditions !== "" || row.days != null);

  if (!filled.length) return { shelf_life_days: null, storage_conditions: "" };
  if (filled.length === 1) {
    return { shelf_life_days: filled[0].days, storage_conditions: filled[0].conditions };
  }

  const dayValues = filled.map((row) => row.days).filter((d): d is number => d != null);
  return {
    shelf_life_days: dayValues.length ? Math.min(...dayValues) : null,
    storage_conditions: JSON.stringify({ v: 1, items: filled } satisfies StoredV1),
  };
}

export function formatStorageOptionLine(
  option: StorageOption,
  daysWord: string,
): string {
  const bits: string[] = [];
  if (option.conditions.trim()) bits.push(option.conditions.trim());
  if (option.days != null && option.days > 0) bits.push(`${option.days} ${daysWord}`);
  return bits.join(" · ");
}

/** Staff card icon: negative / freeze wording → freezer, otherwise fridge. */
export function storageOptionIcon(conditions: string): "fridge" | "freezer" {
  if (/−\s*\d|-\s*\d|минус|мороз|freeze|freezer|đông\s*lạnh/i.test(conditions)) return "freezer";
  return "fridge";
}

export function storageOptionsEqual(a: StorageOption[], b: StorageOption[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.conditions.trim() === b[i].conditions.trim() && row.days === b[i].days);
}
