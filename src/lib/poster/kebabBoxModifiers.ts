import type { LocalFoodCatalogItem } from "./foodMenuCatalog";
import type { HotDogSausageOption } from "./hotDogModifiers";
import {
  findKebabModificationForTemplate,
  findKebabModifierGroup,
  normalizeKebabModifierAddon,
} from "./pitaModifiers";
import { extractPosterPrice } from "./posterPrice";
import type { PosterProduct } from "./types";
import type { FoodMenuCategoryId } from "./categoryMap";

export type KebabBoxMenuItem = {
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
  sausageOptions?: HotDogSausageOption[];
};

const KEBAB_BOX_LOCAL_IDS = ["chicken-kebab", "pork-kebab"] as const;
export type KebabBoxLocalId = (typeof KEBAB_BOX_LOCAL_IDS)[number];

export function isKebabBoxPosterProduct(product: PosterProduct): boolean {
  const key = (product.product_name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return key === "kebabbox";
}

export function enrichKebabBoxItemFromPoster(
  local: LocalFoodCatalogItem,
  product: PosterProduct,
  item: KebabBoxMenuItem,
): KebabBoxMenuItem {
  if (local.id !== "chicken-kebab" && local.id !== "pork-kebab") return item;

  const templateId = local.id === "chicken-kebab" ? "chicken" : "pork";
  const basePrice = Number(extractPosterPrice(product)) || local.price || 0;
  const kebabGroup = findKebabModifierGroup(product);
  const modifications = kebabGroup?.modifications ?? [];
  const modification = findKebabModificationForTemplate(
    modifications,
    templateId,
    templateId === "chicken" ? 1 : 0,
  );
  const addon = modification
    ? normalizeKebabModifierAddon(modification.price)
    : templateId === "chicken"
      ? 10000
      : 0;
  const price = basePrice + addon;

  const sausageOption: HotDogSausageOption = {
    id: templateId,
    label: local.name,
    shortLabel: local.name,
    posterModifierId:
      modification?.dish_modification_id != null
        ? String(modification.dish_modification_id)
        : undefined,
    price,
    addon: addon > 0 ? addon : undefined,
  };

  return {
    ...item,
    posterProductId: product.product_id,
    price,
    sausageOptions: [sausageOption],
  };
}

export function mapKebabBoxPosterProduct(
  product: PosterProduct,
  catalog: LocalFoodCatalogItem[],
): Array<{ local: LocalFoodCatalogItem; item: KebabBoxMenuItem }> {
  if (!isKebabBoxPosterProduct(product)) return [];

  return catalog
    .filter((local): local is LocalFoodCatalogItem & { id: KebabBoxLocalId } =>
      KEBAB_BOX_LOCAL_IDS.includes(local.id as KebabBoxLocalId),
    )
    .map((local) => {
      const base: KebabBoxMenuItem = {
        id: local.id,
        posterProductId: product.product_id,
        name: local.name,
        description: local.description,
        grammage: local.grammage,
        image: local.image,
        category: local.category,
        badge: local.badge,
        price: local.price ?? null,
      };
      return {
        local,
        item: enrichKebabBoxItemFromPoster(local, product, base),
      };
    });
}
