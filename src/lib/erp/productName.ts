import { erpLang, type ErpLang } from "../../components/erp/i18n";

/** UI language of the name, not a translation of the stored string. */
export type ProductNameLocale = "ru" | "en" | "vn";

/** Stored catalog names. These are data, not UI chrome — never pass them through T(). */
export type ProductNameFields = {
  locale?: ProductNameLocale;
  name_en?: string | null;
  name_vn?: string | null;
  nameEn?: string | null;
  nameVn?: string | null;
  name?: string | null;
};

function englishName(product: ProductNameFields) {
  return (product.nameEn || product.name_en || product.name || "").trim();
}

function vietnameseName(product: ProductNameFields) {
  return (product.nameVn || product.name_vn || "").trim();
}

/**
 * One language at a time from stored fields.
 * RU/EN → English (`name_en` / `nameEn`). VN → `name_vn` / `nameVn`, else English.
 * Do not invent a translation. Do not join EN / VN with a slash.
 */
export function productDisplayName(input: ProductNameFields & { locale: ProductNameLocale }): string;
export function productDisplayName(product: ProductNameFields, lang: ProductNameLocale): string;
export function productDisplayName(product: ProductNameFields, lang?: ProductNameLocale): string {
  const locale = product.locale ?? lang ?? "ru";
  const en = englishName(product);
  if (locale === "vn") return vietnameseName(product) || en;
  return en;
}

export function productDisplayTitle(product: ProductNameFields & { brand?: string | null }, lang: ProductNameLocale): string {
  const name = productDisplayName(product, lang);
  const brand = product.brand?.trim();
  return brand ? `${name} · ${brand}` : name;
}

export const productLabel = (product: ProductNameFields, lang: ErpLang = erpLang()) => productDisplayName(product, lang);

/** Name with the brand: items that differ only by brand are separate products. */
export const productTitle = (product: ProductNameFields & { brand?: string | null }, lang: ErpLang = erpLang()) =>
  productDisplayTitle(product, lang);
