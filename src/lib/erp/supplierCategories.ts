type PackSupplier = { product_id: string; supplier_id: string | null; archived_at?: string | null };

/** Live pack links: erp_product_packs.supplier_id (not a second supplier book). */
export function packSupplierIds(
  productId: string,
  packs: PackSupplier[],
): string[] {
  const ids = new Set<string>();
  for (const pack of packs) {
    if (pack.archived_at || pack.product_id !== productId || !pack.supplier_id) continue;
    ids.add(pack.supplier_id);
  }
  return [...ids];
}

export function packSupplierLabel(
  productId: string,
  packs: PackSupplier[],
  suppliers: { id: string; name: string; archived_at?: string | null }[],
): string {
  const names = packSupplierIds(productId, packs)
    .map((id) => suppliers.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names.join(", ");
}

/** Product categories a supplier is tied to via packs or the Staff supplier field. */
export function supplierCategoryIds(
  supplierId: string,
  products: { id: string; category_id: string | null; staff_supplier_id: string | null; archived_at: string | null }[],
  packs: PackSupplier[],
): string[] {
  const productIds = new Set<string>();
  for (const product of products) {
    if (product.archived_at) continue;
    if (product.staff_supplier_id === supplierId) productIds.add(product.id);
  }
  for (const pack of packs) {
    if (pack.archived_at) continue;
    if (pack.supplier_id === supplierId) productIds.add(pack.product_id);
  }
  const ids = new Set<string>();
  for (const product of products) {
    if (!productIds.has(product.id) || !product.category_id) continue;
    ids.add(product.category_id);
  }
  return [...ids];
}
