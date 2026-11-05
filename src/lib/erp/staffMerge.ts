import type { StaffCatalog, StaffCatalogItem } from "@/data/staffCatalog";
import { parsePackLabel } from "./packs";

/**
 * Compares the old Staff catalog file with the ERP catalog tables before Staff switches to the
 * shared catalog. Nothing here writes: the plan lists what may be added (records the ERP does not
 * have yet) and what needs a person to decide. Existing ERP rows are never overwritten.
 */

export type ErpCatalogRows = {
  categories: { id: string; code: string; name_en: string; name_vn: string; archived_at: string | null }[];
  suppliers: { id: string; code: string; name: string; zalo_url: string | null; archived_at: string | null }[];
  products: {
    id: string;
    code: string;
    name_en: string;
    name_vn: string;
    brand: string | null;
    base_unit: string | null;
    category_id: string | null;
    staff_listed: boolean;
    staff_supplier_id: string | null;
    staff_unit: string | null;
    staff_pack: string | null;
    staff_item_no: string | null;
    staff_hidden: boolean;
    archived_at: string | null;
  }[];
  /** erp_legacy_map rows for Staff items: Staff id → product id. */
  itemLinks: { legacy_id: string; target_id: string }[];
};

export type FieldDiff = { field: string; staff: string; erp: string };

export type StaffMergePlan = {
  /** Records to add; ids are the Staff ids and become the ERP codes. */
  add: StaffCatalog;
  /** New items whose pack text does not state a unit: added without a stock unit. */
  needsSetup: { id: string; name: string; brand: string; pack: string }[];
  /** Same id on both sides, different values: the ERP value is kept. */
  differs: { id: string; name: string; fields: FieldDiff[] }[];
  /** Not linked, but an ERP product has the same name and brand: not added, decide by hand. */
  ambiguous: { id: string; name: string; brand: string; candidates: { code: string; name: string; brand: string }[] }[];
  /** Listed for Staff in the ERP, missing from the old file (for example created in the ERP). */
  onlyInErp: { code: string; name: string; brand: string }[];
  /** Staff references a category or supplier that is archived in the ERP. */
  archivedRefs: { kind: "category" | "supplier"; id: string; name: string }[];
  same: number;
};

export type StaffMergeResult = {
  source: "erp" | "file";
  /** Whether the old Staff file exists; without it the built-in starting catalog is compared. */
  fileFound: boolean;
  plan: StaffMergePlan;
  applied?: Record<string, number>;
};

const key = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Staff keeps "EN / VN" in one field when both names are equal; same rule as the database. */
export function splitStaffName(item: Pick<StaffCatalogItem, "name" | "nameVn">): { en: string; vn: string } {
  const en = item.name.trim();
  const vn = (item.nameVn ?? "").trim();
  if (en === vn) {
    const at = en.indexOf(" / ");
    if (at > 0) return { en: en.slice(0, at).trim(), vn: en.slice(at + 3).trim() };
    return { en, vn: "" };
  }
  return { en, vn };
}

/** Stock unit the database will derive from a pack text, or null when it is not stated exactly. */
export function packBaseUnit(pack: string | undefined): "kg" | "l" | "pcs" | null {
  if (!pack) return null;
  const parsed = parsePackLabel(`box ${pack}`);
  if (!parsed || parsed.sizeTo !== null) return null;
  return parsed.unit === "g" || parsed.unit === "kg" ? "kg" : parsed.unit === "ml" || parsed.unit === "l" ? "l" : "pcs";
}

export function planStaffMerge(staff: StaffCatalog, erp: ErpCatalogRows): StaffMergePlan {
  const categoriesByCode = new Map(erp.categories.map((c) => [c.code, c]));
  const categoriesById = new Map(erp.categories.map((c) => [c.id, c]));
  const suppliersByCode = new Map(erp.suppliers.map((s) => [s.code, s]));
  const suppliersById = new Map(erp.suppliers.map((s) => [s.id, s]));
  const productsById = new Map(erp.products.map((p) => [p.id, p]));
  const productsByCode = new Map(erp.products.map((p) => [p.code, p]));
  const links = new Map(erp.itemLinks.map((l) => [l.legacy_id, l.target_id]));
  const plan: StaffMergePlan = {
    add: { categories: [], suppliers: [], items: [] },
    needsSetup: [],
    differs: [],
    ambiguous: [],
    onlyInErp: [],
    archivedRefs: [],
    same: 0,
  };

  for (const category of staff.categories) {
    const found = categoriesByCode.get(category.id);
    if (!found) plan.add.categories.push(category);
    else if (found.archived_at && staff.items.some((i) => i.category === category.id)) {
      plan.archivedRefs.push({ kind: "category", id: category.id, name: found.name_en });
    }
  }
  for (const supplier of staff.suppliers) {
    const found = suppliersByCode.get(supplier.id);
    if (!found) plan.add.suppliers.push(supplier);
    else if (found.archived_at && staff.items.some((i) => i.supplier === supplier.id)) {
      plan.archivedRefs.push({ kind: "supplier", id: supplier.id, name: found.name });
    }
  }

  const staffIds = new Set(staff.items.map((i) => i.id));
  for (const item of staff.items) {
    const linked = links.get(item.id);
    const byCode = productsByCode.get(item.id);
    const name = splitStaffName(item);
    if (!linked && byCode && !byCode.staff_listed) {
      // Same code as an ERP-only product (for example a prep): not the same item just because of the id text.
      plan.ambiguous.push({
        id: item.id,
        name: item.name,
        brand: item.brand ?? "",
        candidates: [{ code: byCode.code, name: byCode.name_en, brand: byCode.brand ?? "" }],
      });
      continue;
    }
    const product = (linked ? productsById.get(linked) : undefined) ?? byCode;
    if (!product) {
      const candidates = erp.products.filter(
        (p) => !p.archived_at && key(p.name_en) === key(name.en) && key(p.brand) === key(item.brand),
      );
      if (candidates.length) {
        plan.ambiguous.push({
          id: item.id,
          name: item.name,
          brand: item.brand ?? "",
          candidates: candidates.map((p) => ({ code: p.code, name: p.name_en, brand: p.brand ?? "" })),
        });
        continue;
      }
      plan.add.items.push(item);
      if (!packBaseUnit(item.pack)) plan.needsSetup.push({ id: item.id, name: item.name, brand: item.brand ?? "", pack: item.pack ?? "" });
      continue;
    }
    const fields: FieldDiff[] = [];
    const diff = (field: string, staffValue: string | null | undefined, erpValue: string | null | undefined) => {
      if (key(staffValue) !== key(erpValue)) fields.push({ field, staff: staffValue ?? "", erp: erpValue ?? "" });
    };
    diff("name", name.en, product.name_en);
    diff("nameVn", name.vn, product.name_vn === product.name_en ? "" : product.name_vn);
    diff("brand", item.brand, product.brand);
    diff("category", item.category, product.category_id ? categoriesById.get(product.category_id)?.code : "");
    diff("supplier", item.supplier, product.staff_supplier_id ? suppliersById.get(product.staff_supplier_id)?.code : "");
    diff("unit", item.unit, product.staff_unit ?? product.base_unit);
    diff("pack", item.pack, product.staff_pack);
    diff("itemNo", item.itemNo, product.staff_item_no);
    diff("hidden", item.hidden ? "yes" : "", product.staff_hidden ? "yes" : "");
    diff("listed", "yes", product.staff_listed && !product.archived_at ? "yes" : "");
    if (fields.length) plan.differs.push({ id: item.id, name: item.name, fields });
    else plan.same += 1;
  }

  const linkedIds = new Set([...links.entries()].filter(([staffId]) => staffIds.has(staffId)).map(([, productId]) => productId));
  for (const product of erp.products) {
    if (!product.staff_listed || product.archived_at) continue;
    if (staffIds.has(product.code) || linkedIds.has(product.id)) continue;
    plan.onlyInErp.push({ code: product.code, name: product.name_en, brand: product.brand ?? "" });
  }
  return plan;
}
