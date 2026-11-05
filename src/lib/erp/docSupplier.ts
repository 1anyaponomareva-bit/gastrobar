import type { ErpDocument, ErpDocumentLine, ErpProduct, ErpProductPack, ErpSupplier } from "./types";

/** Catalog fields needed to resolve a receipt supplier from packs / the product. */
export type SupplierCatalog = {
  suppliers: Pick<ErpSupplier, "id" | "name">[];
  products: Pick<ErpProduct, "id" | "staff_supplier_id">[];
  productPacks?: Array<Pick<ErpProductPack, "id" | "product_id" | "supplier_id"> & { pack_id?: string; archived_at?: string | null }>;
};

const unique = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((id): id is string => Boolean(id)))];
const packLinks = (catalog: SupplierCatalog) => catalog.productPacks ?? [];

/** Pack suppliers plus the Staff supplier; never the product brand. */
export function productSupplierIds(catalog: SupplierCatalog, productId: string): string[] {
  const product = catalog.products.find((p) => p.id === productId);
  const fromPacks = packLinks(catalog)
    .filter((pack) => pack.product_id === productId && pack.supplier_id && !pack.archived_at)
    .map((pack) => pack.supplier_id);
  return unique([...fromPacks, product?.staff_supplier_id]);
}

/** Pack supplier first; otherwise the product's only supplier. Ambiguous products stay empty. */
export function lineSupplierId(catalog: SupplierCatalog, line: Pick<ErpDocumentLine, "product_id" | "pack_id">): string | null {
  if (!line.product_id) return null;
  if (line.pack_id) {
    const links = packLinks(catalog);
    const pack =
      links.find((p) => p.pack_id === line.pack_id && p.product_id === line.product_id && !p.archived_at) ??
      links.find((p) => p.id === line.pack_id || p.pack_id === line.pack_id);
    if (pack?.supplier_id) return pack.supplier_id;
  }
  const ids = productSupplierIds(catalog, line.product_id);
  return ids.length === 1 ? ids[0] : null;
}

/** Header supplier when set; otherwise the distinct suppliers inferred from the lines. */
export function documentSupplierIds(catalog: SupplierCatalog, doc: Pick<ErpDocument, "supplier_id" | "lines">): string[] {
  if (doc.supplier_id) return [doc.supplier_id];
  return unique((doc.lines ?? []).map((line) => lineSupplierId(catalog, line)));
}

/** Empty string means “no supplier”. Several line suppliers: first name + “…”. */
export function documentSupplierLabel(catalog: SupplierCatalog, doc: Pick<ErpDocument, "supplier_id" | "lines">): string {
  const names = documentSupplierIds(catalog, doc)
    .map((id) => catalog.suppliers.find((s) => s.id === id)?.name ?? "")
    .filter(Boolean);
  if (!names.length) return "";
  return names.length === 1 ? names[0] : `${names[0]}…`;
}

export function receiptMatchesSupplier(supplierIds: string[], filter: Set<string>): boolean {
  if (!filter.size) return true;
  if (!supplierIds.length) return filter.has("none");
  return supplierIds.some((id) => filter.has(id));
}

/** Unique inferred supplier for an empty receipt header; null when lines disagree or have none. */
export function inferredReceiptSupplier(catalog: SupplierCatalog, doc: Pick<ErpDocument, "doc_type" | "supplier_id" | "lines">): string | null {
  if (doc.doc_type !== "receipt" || doc.supplier_id) return null;
  const ids = unique((doc.lines ?? []).map((line) => lineSupplierId(catalog, line)));
  return ids.length === 1 ? ids[0] : null;
}

export function applyReceiptSupplier<T extends Pick<ErpDocument, "doc_type" | "supplier_id" | "lines">>(catalog: SupplierCatalog, doc: T): T {
  const id = inferredReceiptSupplier(catalog, doc);
  return id ? { ...doc, supplier_id: id } : doc;
}
