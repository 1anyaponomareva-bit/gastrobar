import type { MenuItem } from "@/data/menu";
import {
  isLikelyBarProduct,
  type FoodMenuCategoryId,
} from "./categoryMap";
import type { LocalFoodCatalogItem } from "./foodMenuCatalog";
import {
  getLocalBarCatalog,
  getLocalBarCatalogOrder,
  getLocalFoodCatalog,
  getLocalFoodCatalogOrder,
  isExcludedPosterProduct,
  matchLocalBarItem,
  matchLocalFoodItem,
} from "./localMenuMatch";
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

function withLocalBarAssets(local: MenuItem): MenuItem {
  return {
    ...local,
    image: local.image,
    imageList: local.imageList ?? local.image,
  };
}

function mergeLocalBarWithPosterPrice(local: MenuItem, product: PosterProduct): MenuItem {
  const posterPrice = extractPosterPrice(product);
  return {
    ...withLocalBarAssets(local),
    price: posterPrice !== "0" ? posterPrice : local.price,
  };
}

function mergeLocalFoodWithPosterPrice(
  local: LocalFoodCatalogItem,
  product: PosterProduct,
): PosterFoodMenuItem {
  const posterPrice = Number(extractPosterPrice(product)) || null;
  const hasPosterPrice = posterPrice != null && posterPrice > 0;

  return {
    id: local.id,
    name: local.name,
    description: local.description,
    grammage: local.grammage,
    image: local.image,
    category: local.category,
    badge: local.badge,
    price: hasPosterPrice ? posterPrice : (local.price ?? null),
    priceMin: hasPosterPrice ? undefined : local.priceMin,
    priceMax: hasPosterPrice ? undefined : local.priceMax,
  };
}

export function mapPosterProductToBarItem(product: PosterProduct): MenuItem | null {
  if (isHiddenProduct(product)) return null;

  const categoryName = product.category_name ?? "";
  const productName = product.product_name?.trim() ?? "";
  if (!productName) return null;
  if (isExcludedPosterProduct(categoryName, productName)) return null;
  if (!isLikelyBarProduct(categoryName, productName)) return null;

  const local = matchLocalBarItem(productName);
  if (!local) return null;

  return mergeLocalBarWithPosterPrice(local, product);
}

export function mapPosterProductToFoodItem(product: PosterProduct): PosterFoodMenuItem | null {
  if (isHiddenProduct(product)) return null;

  const categoryName = product.category_name ?? "";
  const productName = product.product_name?.trim() ?? "";
  if (!productName) return null;
  if (isExcludedPosterProduct(categoryName, productName)) return null;

  const local = matchLocalFoodItem(productName, categoryName);
  if (!local) return null;

  return mergeLocalFoodWithPosterPrice(local, product);
}

export function buildBarMenuFromPosterProducts(products: PosterProduct[]): MenuItem[] {
  const priceByLocalId = new Map<string, string>();

  for (const product of products) {
    const mapped = mapPosterProductToBarItem(product);
    if (mapped) priceByLocalId.set(mapped.id, mapped.price);
  }

  return sortPosterBarItems(
    getLocalBarCatalog()
      .filter((local) => priceByLocalId.has(local.id))
      .map((local) => ({
        ...withLocalBarAssets(local),
        price: priceByLocalId.get(local.id)!,
      })),
  );
}

export function buildFoodMenuFromPosterProducts(products: PosterProduct[]): PosterFoodMenuItem[] {
  const mergedById = new Map<string, PosterFoodMenuItem>();

  for (const product of products) {
    const mapped = mapPosterProductToFoodItem(product);
    if (mapped) mergedById.set(mapped.id, mapped);
  }

  return sortPosterFoodItems(
    getLocalFoodCatalog()
      .filter((local) => mergedById.has(local.id))
      .map((local) => {
        const merged = mergedById.get(local.id)!;
        return {
          ...merged,
          image: local.image,
        };
      }),
  );
}

export function sortPosterFoodItems(items: PosterFoodMenuItem[]): PosterFoodMenuItem[] {
  const order = getLocalFoodCatalogOrder();
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function sortPosterBarItems(items: MenuItem[]): MenuItem[] {
  const order = getLocalBarCatalogOrder();
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name, "ru");
  });
}
