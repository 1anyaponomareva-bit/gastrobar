import { productDisplayName, type ProductNameFields, type ProductNameLocale } from "./productName";

/** Collation for the on-screen catalog language, not the stored `sort` column. */
export const CATEGORY_NAME_LOCALES: Record<ProductNameLocale, string> = {
  ru: "ru",
  en: "en",
  vn: "vi",
};

export const NONE_CATEGORY_ID = "none";

export function compareOnScreenNames(a: string, b: string, lang: ProductNameLocale = "ru"): number {
  return a.localeCompare(b, CATEGORY_NAME_LOCALES[lang], { numeric: true, sensitivity: "base" });
}

export function sortByOnScreenName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  lang: ProductNameLocale = "ru",
): T[] {
  return [...items].sort((a, b) => compareOnScreenNames(nameOf(a), nameOf(b), lang));
}

/** A–Z by the name the UI shows: English on RU/EN, Vietnamese on VN. */
export function sortCategoriesByOnScreenName<T extends ProductNameFields>(
  categories: readonly T[],
  lang: ProductNameLocale = "ru",
): T[] {
  return sortByOnScreenName(categories, (item) => productDisplayName(item, lang), lang);
}

export function withUncategorizedLast<T>(named: readonly T[], uncategorized: T): T[] {
  return [...named, uncategorized];
}
