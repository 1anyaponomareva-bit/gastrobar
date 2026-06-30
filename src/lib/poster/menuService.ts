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
    const items = sortPosterBarItems(
      fetched.products
        .map(mapPosterProductToBarItem)
        .filter((item): item is MenuItem => item != null),
    );

    return {
      success: true,
      venue,
      itemCount: items.length,
      items,
      categories: fetched.categories,
    };
  }

  const items = sortPosterFoodItems(
    fetched.products
      .map(mapPosterProductToFoodItem)
      .filter((item): item is PosterFoodMenuItem => item != null),
  );

  return {
    success: true,
    venue,
    itemCount: items.length,
    items,
    categories: fetched.categories,
  };
}
