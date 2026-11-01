import type {
  LocalizedText,
  Recipe,
  RecipeFactIcon,
  RecipeKind,
  RecipeStorageIcon,
} from "@/data/recipes";
import { MAX_MAIN_INGREDIENTS } from "@/data/recipes";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

const KINDS: RecipeKind[] = ["dish", "prep"];
const UNITS = ["g", "kg", "ml", "l", "pcs", "egg"];
const FACT_ICONS: RecipeFactIcon[] = ["weight", "length", "storage", "time", "temperature"];
const STORAGE_ICONS: RecipeStorageIcon[] = ["freezer", "fridge", "thaw", "no-refreeze"];
const MAX_TEXT = 600;
const MAX_ITEMS = 60;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}

function localized(value: unknown): LocalizedText {
  const source = (value ?? {}) as Record<string, unknown>;
  const result = { ru: text(source.ru), en: text(source.en), vn: text(source.vn) };
  const fallback = result.en || result.ru || result.vn;
  return { ru: result.ru || fallback, en: result.en || fallback, vn: result.vn || fallback };
}

function hasText(value: LocalizedText): boolean {
  return Boolean(value.ru || value.en || value.vn);
}

function amount(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? Math.round(number * 100) / 100 : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

/** Only photos bundled with the site or uploaded to our Supabase bucket. */
function photo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  const base = getSupabaseBackendUrl();
  return base && value.startsWith(`${base}/storage/v1/object/public/recipes-photos/`) ? value : undefined;
}

/** Validates a recipe sent from the admin form; returns null when required parts are missing. */
export function sanitizeRecipe(input: unknown): Recipe | null {
  const source = (input ?? {}) as Record<string, unknown>;
  const id = typeof source.id === "string" ? slugify(source.id) : "";
  const kind = KINDS.includes(source.kind as RecipeKind) ? (source.kind as RecipeKind) : null;
  const name = localized(source.name);
  const yieldSource = (source.yield ?? {}) as Record<string, unknown>;
  const yieldAmount = amount(yieldSource.amount);
  if (!id || !kind || !hasText(name) || yieldAmount === null) return null;

  let mainCount = 0;
  const ingredients = list(source.ingredients).flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const rowName = localized(row.name);
    const net = amount(row.amount);
    const unit = UNITS.includes(String(row.unit)) ? String(row.unit) : "g";
    if (!hasText(rowName) || net === null) return [];
    const main = row.main === true && mainCount < MAX_MAIN_INGREDIENTS;
    if (main) mainCount += 1;
    return [{ name: rowName, amount: net, unit, ...(main ? { main: true } : {}) }];
  });

  const steps = list(source.steps).flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const items = list(row.items).map(localized).filter(hasText);
    const title = localized(row.title);
    if (!items.length && !hasText(title)) return [];
    return [{ ...(hasText(title) ? { title } : {}), ...(photo(row.photo) ? { photo: photo(row.photo) } : {}), items }];
  });

  const facts = list(source.facts).flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const icon = FACT_ICONS.includes(row.icon as RecipeFactIcon) ? (row.icon as RecipeFactIcon) : "weight";
    const label = localized(row.label);
    const value = localized(row.value);
    return hasText(label) && hasText(value) ? [{ icon, label, value }] : [];
  });

  const storage = list(source.storage).flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const icon = STORAGE_ICONS.includes(row.icon as RecipeStorageIcon) ? (row.icon as RecipeStorageIcon) : "fridge";
    const title = localized(row.title);
    const ruleText = localized(row.text);
    return hasText(title) ? [{ icon, title, ...(hasText(ruleText) ? { text: ruleText } : {}) }] : [];
  });

  const metaSource = (source.meta ?? {}) as Record<string, unknown>;
  const meta = { cardNo: text(metaSource.cardNo), date: text(metaSource.date), revision: text(metaSource.revision) };
  const yieldLabel = localized(yieldSource.label);

  return {
    id,
    kind,
    name,
    ...(meta.cardNo || meta.date || meta.revision ? { meta } : {}),
    ...(photo(source.photo) ? { photo: photo(source.photo) } : {}),
    yield: {
      amount: yieldAmount,
      unit: UNITS.includes(String(yieldSource.unit)) ? String(yieldSource.unit) : "g",
      ...(hasText(yieldLabel) ? { label: yieldLabel } : {}),
    },
    ...(facts.length ? { facts } : {}),
    ingredients,
    steps,
    ...(storage.length ? { storage } : {}),
    ...(source.hidden === true ? { hidden: true } : {}),
  };
}
