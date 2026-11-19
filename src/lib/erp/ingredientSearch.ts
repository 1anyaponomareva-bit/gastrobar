/** Composition-line picker: raw ingredients plus other preps as warehouse SKUs. */

export const COMPOSITION_INGREDIENT_TYPES = ["ingredient", "packaging", "consumable"] as const;
export const COMPOSITION_PREP_TYPES = ["semi_finished"] as const;

export type CompositionIngredientType = (typeof COMPOSITION_INGREDIENT_TYPES)[number];
export type CompositionPrepType = (typeof COMPOSITION_PREP_TYPES)[number];
export type CompositionKindFilter = "all" | "ingredient" | "prep";

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

export function isCompositionPrepType(type: string | null | undefined): type is CompositionPrepType {
  return Boolean(type && (COMPOSITION_PREP_TYPES as readonly string[]).includes(type));
}

export function compositionKindOf(type: string | null | undefined): "ingredient" | "prep" | null {
  if (isCompositionIngredientType(type)) return "ingredient";
  if (isCompositionPrepType(type)) return "prep";
  return null;
}

/** Processing losses and Нарезка apply to raw catalog items, not nested preps. */
export function compositionLineAllowsProcess(type: string | null | undefined): boolean {
  return isCompositionIngredientType(type);
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

function isPooledComponent(product: SearchableIngredient): boolean {
  return Boolean((isCompositionIngredientType(product.type) || isCompositionPrepType(product.type)) && product.base_unit && !product.archived_at);
}

export function compositionIngredientPool(products: readonly SearchableIngredient[]): SearchableIngredient[] {
  return products.filter((product) => isCompositionIngredientType(product.type) && Boolean(product.base_unit) && !product.archived_at);
}

export function compositionComponentPool(
  products: readonly SearchableIngredient[],
  excludeIds: Iterable<string> = [],
): SearchableIngredient[] {
  const skip = new Set(excludeIds);
  return products.filter((product) => isPooledComponent(product) && !skip.has(product.id));
}

function matchesCategory(product: SearchableIngredient, categoryId: string): boolean {
  if (categoryId === "all" || !categoryId) return true;
  if (categoryId === "none") return !product.category_id;
  return product.category_id === categoryId;
}

function matchesKind(product: SearchableIngredient, kind: CompositionKindFilter): boolean {
  if (kind === "ingredient") return isCompositionIngredientType(product.type);
  if (kind === "prep") return isCompositionPrepType(product.type);
  return true;
}

function sortByName(a: SearchableIngredient, b: SearchableIngredient): number {
  return (a.name_en ?? "").localeCompare(b.name_en ?? "", undefined, { numeric: true, sensitivity: "base" });
}

export function filterCompositionIngredients(
  products: readonly SearchableIngredient[],
  query: string,
  categoryId: string = "all",
): SearchableIngredient[] {
  return filterCompositionComponents(products, query, { kind: "ingredient", categoryId });
}

export function filterCompositionComponents(
  products: readonly SearchableIngredient[],
  query: string,
  options: { kind?: CompositionKindFilter; categoryId?: string; excludeIds?: Iterable<string> } = {},
): SearchableIngredient[] {
  const kind = options.kind ?? "all";
  const categoryId = options.categoryId ?? "all";
  return compositionComponentPool(products, options.excludeIds)
    .filter((product) => matchesKind(product, kind))
    .filter((product) => matchesCategory(product, categoryId))
    .filter((product) => ingredientNameMatches(product, query))
    .sort(sortByName);
}

export function compositionCategoryIds(
  products: readonly SearchableIngredient[],
  options: { kind?: CompositionKindFilter; excludeIds?: Iterable<string> } = {},
): { ids: string[]; hasUncategorized: boolean } {
  const pool = compositionComponentPool(products, options.excludeIds).filter((product) => matchesKind(product, options.kind ?? "all"));
  const ids = [...new Set(pool.map((product) => product.category_id).filter((id): id is string => Boolean(id)))];
  return { ids, hasUncategorized: pool.some((product) => !product.category_id) };
}
