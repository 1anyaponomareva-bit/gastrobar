import {
  STAFF_ORDER_CATEGORIES,
  STAFF_ORDER_ITEMS,
  STAFF_ORDER_SUPPLIERS,
  staffOrderItemNameVn,
} from "@/data/staffOrderItems";
import { translateStaffCategory } from "@/lib/staffInventoryI18n";

export type StaffCatalogCategory = { id: string; en: string; vn: string };

export type StaffCatalogSupplier = { id: string; label: string; zaloUrl?: string };

export type StaffCatalogItem = {
  id: string;
  category: string;
  name: string;
  nameVn: string;
  brand?: string;
  pack?: string;
  unit: string;
  supplier: string;
  itemNo?: string;
  hidden?: boolean;
};

export type StaffCatalog = {
  categories: StaffCatalogCategory[];
  suppliers: StaffCatalogSupplier[];
  items: StaffCatalogItem[];
};

export function catalogSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Slug of `base` that is not in `taken`; falls back to "item" for names without latin letters. */
export function uniqueCatalogId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = catalogSlug(base) || "item";
  if (!used.has(root)) return root;
  for (let index = 2; ; index += 1) {
    const candidate = `${root}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const DEFAULT_STAFF_CATALOG: StaffCatalog = {
  categories: STAFF_ORDER_CATEGORIES.map((category) => ({
    id: catalogSlug(category),
    en: translateStaffCategory("en", category),
    vn: translateStaffCategory("vn", category),
  })),
  suppliers: STAFF_ORDER_SUPPLIERS.map(({ id, label, zaloUrl }) => ({
    id,
    label,
    ...(zaloUrl ? { zaloUrl } : {}),
  })),
  items: STAFF_ORDER_ITEMS.map((item) => ({
    id: item.id,
    category: catalogSlug(item.category),
    name: item.name,
    nameVn: staffOrderItemNameVn(item),
    ...(item.brand ? { brand: item.brand } : {}),
    ...(item.pack ? { pack: item.pack } : {}),
    unit: item.unit,
    supplier: item.supplier,
    ...(item.itemNo ? { itemNo: item.itemNo } : {}),
  })),
};

export function staffItemLabel(item: StaffCatalogItem): string {
  return item.nameVn && item.nameVn !== item.name
    ? `${item.name} / ${item.nameVn}`
    : item.name;
}

export function staffCategoryLabel(category: StaffCatalogCategory): string {
  return category.vn && category.vn !== category.en
    ? `${category.en} / ${category.vn}`
    : category.en;
}

const UNIT_NAMES_VN: Record<string, string> = {
  pcs: "cái",
  box: "thùng",
  pack: "gói",
  btl: "chai",
  can: "lon",
};

/** "box / thùng" for units that differ in Vietnamese; metric and custom units stay as they are. */
export function staffUnitLabel(unit: string): string {
  const vn = UNIT_NAMES_VN[unit.toLowerCase()];
  return vn ? `${unit} / ${vn}` : unit;
}

export function staffItemPackLabel(item: StaffCatalogItem, unitLabel = item.unit): string | null {
  if (!item.pack) return null;
  const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  if (compact(item.pack) === compact(`1 ${item.unit}`)) return null;
  return `1 ${unitLabel} = ${item.pack}`;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const LIMITS = { categories: 200, suppliers: 300, items: 5000 };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function optional(value: unknown, max: number): string | undefined {
  return text(value, max) || undefined;
}

function zalo(value: unknown): string | undefined {
  const url = text(value, 300);
  return /^https:\/\/\S+$/i.test(url) ? url : undefined;
}

/** Validates a catalog sent by the admin; returns null when it is malformed. */
export function sanitizeStaffCatalog(input: unknown): StaffCatalog | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.categories) || !Array.isArray(raw.suppliers) || !Array.isArray(raw.items)) {
    return null;
  }
  if (
    raw.categories.length > LIMITS.categories ||
    raw.suppliers.length > LIMITS.suppliers ||
    raw.items.length > LIMITS.items
  ) {
    return null;
  }

  const categories: StaffCatalogCategory[] = [];
  for (const entry of raw.categories as Record<string, unknown>[]) {
    const id = text(entry?.id, 80);
    const en = text(entry?.en, 60);
    if (!ID_PATTERN.test(id) || !en || categories.some((c) => c.id === id)) return null;
    categories.push({ id, en, vn: text(entry.vn, 60) || en });
  }

  const suppliers: StaffCatalogSupplier[] = [];
  for (const entry of raw.suppliers as Record<string, unknown>[]) {
    const id = text(entry?.id, 80);
    const label = text(entry?.label, 60);
    if (!ID_PATTERN.test(id) || !label || suppliers.some((s) => s.id === id)) return null;
    const zaloUrl = zalo(entry.zaloUrl);
    suppliers.push({ id, label, ...(zaloUrl ? { zaloUrl } : {}) });
  }

  const categoryIds = new Set(categories.map((c) => c.id));
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const itemIds = new Set<string>();
  const items: StaffCatalogItem[] = [];
  for (const entry of raw.items as Record<string, unknown>[]) {
    const id = text(entry?.id, 80);
    const name = text(entry?.name, 120);
    const unit = text(entry?.unit, 20);
    const category = text(entry?.category, 80);
    const supplier = text(entry?.supplier, 80);
    if (
      !ID_PATTERN.test(id) ||
      itemIds.has(id) ||
      !name ||
      !unit ||
      !categoryIds.has(category) ||
      !supplierIds.has(supplier)
    ) {
      return null;
    }
    itemIds.add(id);
    const brand = optional(entry.brand, 60);
    const pack = optional(entry.pack, 60);
    const itemNo = optional(entry.itemNo, 60);
    items.push({
      id,
      category,
      name,
      nameVn: text(entry.nameVn, 120) || name,
      ...(brand ? { brand } : {}),
      ...(pack ? { pack } : {}),
      unit,
      supplier,
      ...(itemNo ? { itemNo } : {}),
      ...(entry.hidden === true ? { hidden: true } : {}),
    });
  }

  return { categories, suppliers, items };
}
