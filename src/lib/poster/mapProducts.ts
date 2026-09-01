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
  isNonSellablePosterCategory,
  matchLocalBarItem,
  matchLocalFoodItem,
} from "./localMenuMatch";
import { enrichHotDogFromPoster, type HotDogSausageOption } from "./hotDogModifiers";
import { enrichKebabBoxItemFromPoster, isKebabBoxPosterProduct, mapKebabBoxPosterProduct } from "./kebabBoxModifiers";
import {
  enrichKebabPitaItemFromPoster,
  isKebabPitaPosterProduct,
  mapKebabPitaPosterProduct,
} from "./pitaModifiers";
import { extractPosterPrice } from "./posterPrice";
import type { PosterProduct } from "./types";

export type { HotDogSausageOption };

export type PosterBarMenuItem = MenuItem & {
  posterProductId: string;
};

export type PosterFoodMenuItem = {
  id: string;
  posterProductId: string;
  name: string;
  description: string;
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  grammage?: string;
  category: FoodMenuCategoryId;
  image: string;
  badge?: "hit";
  hotDogNoSausage?: boolean;
  hotDogPrefix?: boolean;
  sausageOptions?: HotDogSausageOption[];
};

function isHiddenProduct(product: PosterProduct): boolean {
  return product.hidden === "1";
}

export { extractPosterPrice } from "./posterPrice";

function withLocalBarAssets(local: MenuItem): MenuItem {
  return {
    ...local,
    image: local.image,
    imageList: local.imageList ?? local.image,
  };
}

function mergeLocalBarWithPosterPrice(local: MenuItem, product: PosterProduct): PosterBarMenuItem {
  const posterPrice = extractPosterPrice(product);
  return {
    ...withLocalBarAssets(local),
    price: posterPrice !== "0" ? posterPrice : local.price,
    posterProductId: product.product_id,
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
    posterProductId: product.product_id,
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

export function mapPosterProductToBarItem(product: PosterProduct): PosterBarMenuItem | null {
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
  if (isNonSellablePosterCategory(categoryName)) return null;

  const local = matchLocalFoodItem(productName, categoryName);
  if (!local) return null;

  return mergeLocalFoodWithPosterPrice(local, product);
}

export function buildBarMenuFromPosterProducts(products: PosterProduct[]): PosterBarMenuItem[] {
  const mergedById = new Map<string, PosterBarMenuItem>();

  for (const product of products) {
    const mapped = mapPosterProductToBarItem(product);
    if (mapped) mergedById.set(mapped.id, mapped);
  }

  return sortPosterBarItems(
    getLocalBarCatalog()
      .filter((local) => mergedById.has(local.id))
      .map((local) => mergedById.get(local.id)!),
  );
}

export function buildFoodMenuFromPosterProducts(products: PosterProduct[]): PosterFoodMenuItem[] {
  const mergedById = new Map<string, { item: PosterFoodMenuItem; product: PosterProduct }>();
  const localCatalog = getLocalFoodCatalog();

  const upsertFoodMapping = (
    id: string,
    item: PosterFoodMenuItem,
    product: PosterProduct,
  ) => {
    const existing = mergedById.get(id);
    const newPrice = item.price ?? 0;
    const existingPrice = existing?.item.price ?? 0;
    if (!existing || newPrice >= existingPrice) {
      mergedById.set(id, { item, product });
    }
  };

  for (const product of products) {
    const kebabBoxMappings = mapKebabBoxPosterProduct(product, localCatalog);
    if (kebabBoxMappings.length > 0) {
      for (const { local, item } of kebabBoxMappings) {
        upsertFoodMapping(local.id, item, product);
      }
      continue;
    }

    const kebabPitaMappings = mapKebabPitaPosterProduct(product, localCatalog);
    if (kebabPitaMappings.length > 0) {
      for (const { local, item } of kebabPitaMappings) {
        upsertFoodMapping(local.id, item, product);
      }
      continue;
    }

    const mapped = mapPosterProductToFoodItem(product);
    if (mapped) upsertFoodMapping(mapped.id, mapped, product);
  }

  return sortPosterFoodItems(
    localCatalog
      .filter((local) => mergedById.has(local.id))
      .map((local) => {
        const { item, product } = mergedById.get(local.id)!;
        let result: PosterFoodMenuItem = {
          ...item,
          image: local.image,
        };
        if (local.category === "hot-dogs") {
          result = { ...result, ...enrichHotDogFromPoster(local, product, item) };
        } else if (
          (local.id === "pork-kebab-pita" || local.id === "chicken-kebab-pita") &&
          isKebabPitaPosterProduct(product)
        ) {
          result = { ...result, ...enrichKebabPitaItemFromPoster(local, product, result) };
        } else if (
          (local.id === "chicken-kebab" || local.id === "pork-kebab") &&
          isKebabBoxPosterProduct(product)
        ) {
          result = { ...result, ...enrichKebabBoxItemFromPoster(local, product, result) };
        }
        return result;
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

export function sortPosterBarItems(items: PosterBarMenuItem[]): PosterBarMenuItem[] {
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
