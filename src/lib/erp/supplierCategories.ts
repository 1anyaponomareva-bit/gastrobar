/** Product categories a supplier is tied to via packs or the Staff supplier field. */
export function supplierCategoryIds(
  supplierId: string,
  products: { id: string; category_id: string | null; staff_supplier_id: string | null; archived_at: string | null }[],
  packs: { product_id: string; supplier_id: string | null; archived_at?: string | null }[],
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
