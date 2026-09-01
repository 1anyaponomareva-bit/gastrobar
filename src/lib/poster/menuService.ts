import { posterApiGet } from "./client";
import {
  buildBarMenuFromPosterProducts,
  buildFoodMenuFromPosterProducts,
  type PosterFoodMenuItem,
} from "./mapProducts";
import type { MenuItem } from "@/data/menu";
import type { PosterCategory, PosterProduct } from "./types";
import {
  isExcludedPosterProduct,
  matchLocalBarItem,
  matchLocalFoodItem,
} from "./localMenuMatch";
import { isLikelyBarProduct } from "./categoryMap";

function isHiddenProduct(product: PosterProduct): boolean {
  return product.hidden === "1";
}

export type PosterMenuVenue = "bar" | "food";

export type PosterMenuPayload = {
  success: boolean;
  venue: PosterMenuVenue;
  itemCount: number;
  items: MenuItem[] | PosterFoodMenuItem[];
  categories?: PosterCategory[];
  error?: string;
  errorText?: string;
};

async function fetchPosterProducts(): Promise<{
  ok: boolean;
  products: PosterProduct[];
  categories: PosterCategory[];
  error?: string;
  errorText?: string;
}> {
  const [productsResult, categoriesResult] = await Promise.all([
    posterApiGet<PosterProduct[]>("menu.getProducts"),
    posterApiGet<PosterCategory[]>("menu.getCategories"),
  ]);

  if (!productsResult.ok) {
    return {
      ok: false,
      products: [],
      categories: [],
      error: "POSTER_PRODUCTS_FAILED",
      errorText: productsResult.errorText,
    };
  }

  const categories = categoriesResult.ok ? categoriesResult.data : [];

  return {
    ok: true,
    products: Array.isArray(productsResult.data) ? productsResult.data : [],
    categories,
  };
}

export async function getPosterProductsWithModifiers(
  query?: string,
): Promise<
  Array<{
    product_id: string;
    product_name: string;
    category_name?: string;
    base_price: string | undefined;
    group_modifications: PosterProduct["group_modifications"];
  }>
> {
  const fetched = await fetchPosterProducts();
  if (!fetched.ok) return [];

  const needle = query?.trim().toLowerCase();
  return fetched.products
    .filter((product) => {
      if (isHiddenProduct(product)) return false;
      if (!needle) return (product.group_modifications?.length ?? 0) > 0;
      return product.product_name?.toLowerCase().includes(needle);
    })
    .map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      category_name: product.category_name,
      base_price: product.spots?.[0]?.price,
      group_modifications: product.group_modifications,
    }));
}

export async function getPosterMenuForVenue(venue: PosterMenuVenue): Promise<PosterMenuPayload> {
  const fetched = await fetchPosterProducts();
  if (!fetched.ok) {
    return {
      success: false,
      venue,
      itemCount: 0,
      items: [],
      categories: fetched.categories,
      error: fetched.error,
      errorText: fetched.errorText,
    };
  }

  if (venue === "bar") {
    const items = buildBarMenuFromPosterProducts(fetched.products);

    return {
      success: true,
      venue,
      itemCount: items.length,
      items,
      categories: fetched.categories,
    };
  }

  const items = buildFoodMenuFromPosterProducts(fetched.products);

  return {
    success: true,
    venue,
    itemCount: items.length,
    items,
    categories: fetched.categories,
  };
}

export async function getUnmatchedPosterProducts(
  venue: PosterMenuVenue,
): Promise<Array<{ product_name: string; category_name: string }>> {
  const fetched = await fetchPosterProducts();
  if (!fetched.ok) return [];

  const unmatched: Array<{ product_name: string; category_name: string }> = [];

  for (const product of fetched.products) {
    if (isHiddenProduct(product)) continue;

    const productName = product.product_name?.trim() ?? "";
    const categoryName = product.category_name ?? "";
    if (!productName) continue;
    if (isExcludedPosterProduct(categoryName, productName)) continue;

    if (venue === "bar") {
      if (!isLikelyBarProduct(categoryName, productName)) continue;
      if (!matchLocalBarItem(productName)) {
        unmatched.push({ product_name: productName, category_name: categoryName });
      }
      continue;
    }

    if (!matchLocalFoodItem(productName, categoryName)) {
      unmatched.push({ product_name: productName, category_name: categoryName });
    }
  }

  return unmatched;
}
