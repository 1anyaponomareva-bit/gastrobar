import type { MenuItem } from "@/data/menu";
import {
  isLikelyBarProduct,
  isLikelyFoodProduct,
  mapPosterCategoryToBar,
  mapPosterCategoryToFood,
  type FoodMenuCategoryId,
} from "./categoryMap";
import { resolveLocalBarImage, resolveLocalFoodImage } from "./localImageIndex";
import type { PosterProduct } from "./types";

export type PosterFoodMenuItem = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  grammage?: string;
  category: FoodMenuCategoryId;
  image: string;
  badge?: "hit";
};

function isHiddenProduct(product: PosterProduct): boolean {
  return product.hidden === "1";
}

function readPosterPriceRaw(product: PosterProduct): string {
  const spots = product.spots ?? [];
  const visibleSpot = spots.find((spot) => spot.visible !== "0") ?? spots[0];
  if (visibleSpot?.price) return visibleSpot.price;

  if (product.price && typeof product.price === "object") {
    const values = Object.values(product.price).filter(Boolean);
    if (values[0]) return values[0];
  }

  if (typeof product.price === "string" && product.price) return product.price;
  if (product.cost) return product.cost;
  return "0";
}

/** Poster хранит цену в минимальных единицах (VND × 100). */
export function extractPosterPrice(product: PosterProduct): string {
  const raw = Number(readPosterPriceRaw(product));
  if (!Number.isFinite(raw) || raw <= 0) return "0";
  return String(Math.round(raw / 100));
}

function formatGrammage(unit?: string): string | undefined {
  if (!unit) return undefined;
  const trimmed = unit.trim();
  if (!trimmed) return undefined;
  if (/^\d/.test(trimmed) || trimmed.includes("г") || trimmed.includes("ml")) {
    return trimmed;
  }
  return trimmed;
}

export function mapPosterProductToBarItem(product: PosterProduct): MenuItem | null {
  if (isHiddenProduct(product)) return null;

  const categoryName = product.category_name ?? "";
  const productName = product.product_name?.trim() ?? "";
  if (!productName) return null;
  if (!isLikelyBarProduct(categoryName, productName)) return null;

  const barSubcategory = mapPosterCategoryToBar(categoryName, productName);

  return {
    id: `poster-${product.product_id}`,
    name: productName,
    description: product.description?.trim() ?? "",
    image: resolveLocalBarImage(productName),
    imageList: resolveLocalBarImage(productName),
    category: "cocktail",
    price: extractPosterPrice(product),
    barSubcategory,
    grammage: formatGrammage(product.unit),
  };
}

export function mapPosterProductToFoodItem(product: PosterProduct): PosterFoodMenuItem | null {
  if (isHiddenProduct(product)) return null;

  const categoryName = product.category_name ?? "";
  const productName = product.product_name?.trim() ?? "";
  if (!productName) return null;
  if (!isLikelyFoodProduct(categoryName, productName)) return null;
  if (isLikelyBarProduct(categoryName, productName) && !isLikelyFoodProduct(categoryName, productName)) {
    return null;
  }

  const price = Number(extractPosterPrice(product)) || null;

  return {
    id: `poster-${product.product_id}`,
    name: productName,
    description: product.description?.trim() ?? "",
    price,
    category: mapPosterCategoryToFood(categoryName, productName),
    image: resolveLocalFoodImage(productName),
    grammage: formatGrammage(product.unit),
  };
}

export function sortPosterFoodItems(items: PosterFoodMenuItem[]): PosterFoodMenuItem[] {
  const order: FoodMenuCategoryId[] = [
    "appetizers",
    "snacks",
    "hot-dogs",
    "burgers",
    "grill",
    "combos",
    "kids",
  ];
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.category);
    const bi = order.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function sortPosterBarItems(items: MenuItem[]): MenuItem[] {
  const order = ["cocktail", "wine", "beer", "tincture", "spirits", "soft"] as const;
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.barSubcategory ?? "cocktail");
    const bi = order.indexOf(b.barSubcategory ?? "cocktail");
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name, "ru");
  });
}
