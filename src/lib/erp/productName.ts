import { erpLang, type ErpLang } from "../../components/erp/i18n";

/** Stored catalog names. These are data, not UI chrome — never pass them through T(). */
export type ProductNameFields = {
  name_en?: string | null;
  name_vn?: string | null;
  name?: string | null;
};

function englishName(product: ProductNameFields) {
  return (product.name_en || product.name || "").trim();
}

function vietnameseName(product: ProductNameFields) {
  return (product.name_vn || "").trim();
}

/**
 * One language at a time from stored fields.
 * RU/EN → English (`name_en` / `name`). VN → `name_vn`, else English. Do not invent a translation.
 */
export function productDisplayName(product: ProductNameFields, lang: ErpLang): string {
  const en = englishName(product);
  if (lang === "vn") return vietnameseName(product) || en;
  return en;
}

export function productDisplayTitle(product: ProductNameFields & { brand?: string | null }, lang: ErpLang): string {
  const name = productDisplayName(product, lang);
  const brand = product.brand?.trim();
  return brand ? `${name} · ${brand}` : name;
}

export const productLabel = (product: ProductNameFields, lang: ErpLang = erpLang()) => productDisplayName(product, lang);

/** Name with the brand: items that differ only by brand are separate products. */
export const productTitle = (product: ProductNameFields & { brand?: string | null }, lang: ErpLang = erpLang()) =>
  productDisplayTitle(product, lang);
