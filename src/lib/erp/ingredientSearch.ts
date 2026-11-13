/** Composition-line picker: raw catalog ingredients, never preps or finished goods. */

export const COMPOSITION_INGREDIENT_TYPES = ["ingredient", "packaging", "consumable"] as const;

export type CompositionIngredientType = (typeof COMPOSITION_INGREDIENT_TYPES)[number];

export type SearchableIngredient = {
  id: string;
  type: string;
  name_en?: string | null;
  name_vn?: string | null;
  name_ru?: string | null;
  brand?: string | null;
  category_id?: string | null;
  base_unit?: string | null;
  archived_at?: string | null;
  product_code?: string | null;
  code?: string | null;
};

export function isCompositionIngredientType(type: string | null | undefined): type is CompositionIngredientType {
  return Boolean(type && (COMPOSITION_INGREDIENT_TYPES as readonly string[]).includes(type));
}

/** Trim, lower case, strip combining marks so VN typed without tones still matches. */
export function foldSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function nameFields(product: SearchableIngredient): string[] {
  return [product.name_en, product.name_vn, product.name_ru, product.brand].map((part) => (part ?? "").trim()).filter(Boolean);
}

/** Prefix or substring on EN / VN / RU names and brand. Does not search id, SKU or catalog code. */
export function ingredientNameMatches(product: SearchableIngredient, query: string): boolean {
  const q = foldSearchText(query);
  if (!q) return true;
  for (const field of nameFields(product)) {
    const text = foldSearchText(field);
    if (text.startsWith(q) || text.includes(q)) return true;
    if (text.split(/[^a-z0-9а-яё]+/).some((word) => word.startsWith(q))) return true;
  }
  return false;
}

export function compositionIngredientPool(products: readonly SearchableIngredient[]): SearchableIngredient[] {
  return products.filter((product) => isCompositionIngredientType(product.type) && Boolean(product.base_unit) && !product.archived_at);
}

export function filterCompositionIngredients(
  products: readonly SearchableIngredient[],
  query: string,
  categoryId: string = "all",
): SearchableIngredient[] {
  return compositionIngredientPool(products)
    .filter((product) => {
      if (categoryId === "all" || !categoryId) return true;
      if (categoryId === "none") return !product.category_id;
      return product.category_id === categoryId;
    })
    .filter((product) => ingredientNameMatches(product, query))
    .sort((a, b) => (a.name_en ?? "").localeCompare(b.name_en ?? "", undefined, { numeric: true, sensitivity: "base" }));
}

export function compositionCategoryIds(products: readonly SearchableIngredient[]): { ids: string[]; hasUncategorized: boolean } {
  const pool = compositionIngredientPool(products);
  const ids = [...new Set(pool.map((product) => product.category_id).filter((id): id is string => Boolean(id)))];
  return { ids, hasUncategorized: pool.some((product) => !product.category_id) };
}
