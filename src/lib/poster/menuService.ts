import { posterApiGet } from "./client";
import {
  mapPosterProductToBarItem,
  mapPosterProductToFoodItem,
  sortPosterBarItems,
  sortPosterFoodItems,
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
    const byId = new Map<string, MenuItem>();
    for (const product of fetched.products) {
      const item = mapPosterProductToBarItem(product);
      if (item) byId.set(item.id, item);
    }
    const items = sortPosterBarItems([...byId.values()]);

    return {
      success: true,
      venue,
      itemCount: items.length,
      items,
      categories: fetched.categories,
    };
  }

  const byId = new Map<string, PosterFoodMenuItem>();
  for (const product of fetched.products) {
    const item = mapPosterProductToFoodItem(product);
    if (item) byId.set(item.id, item);
  }
  const items = sortPosterFoodItems([...byId.values()]);

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

    if (!matchLocalFoodItem(productName)) {
      unmatched.push({ product_name: productName, category_name: categoryName });
    }
  }

  return unmatched;
}
