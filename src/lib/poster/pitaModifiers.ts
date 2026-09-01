import type { LocalFoodCatalogItem } from "./foodMenuCatalog";
import type { HotDogSausageOption } from "./hotDogModifiers";
import { extractPosterPrice } from "./posterPrice";
import type { PosterDishModification, PosterGroupModification, PosterProduct } from "./types";
import type { FoodMenuCategoryId } from "./categoryMap";

export type KebabPitaMenuItem = {
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

const KEBAB_PITA_LOCAL_IDS = ["pork-kebab-pita", "chicken-kebab-pita"] as const;
export type KebabPitaLocalId = (typeof KEBAB_PITA_LOCAL_IDS)[number];

export function normalizeKebabModifierAddon(raw: number | string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function findKebabModifierGroup(product: PosterProduct): PosterGroupModification | null {
  const groups = product.group_modifications ?? [];
  for (const group of groups) {
    if (group.is_deleted === 1 || group.is_deleted === "1") continue;
    if (/kebab|shashlik|шашлык|мясо|meat|pork|chicken/i.test(group.name ?? "")) {
      return group;
    }
  }
  for (const group of groups) {
    if (group.is_deleted === 1 || group.is_deleted === "1") continue;
    if ((group.modifications?.length ?? 0) >= 2) return group;
  }
  return null;
}

function modifierMatchesTemplate(
  modification: PosterDishModification,
  templateId: string,
): boolean {
  const name = (modification.name ?? "").toLowerCase();
  if (templateId === "pork") {
    return /pork|свин|heo|porc/i.test(name);
  }
  if (templateId === "chicken") {
    return /chicken|кур|chick|kur|gà|ga/i.test(name);
  }
  return false;
}

export function findKebabModificationForTemplate(
  modifications: PosterDishModification[],
  templateId: string,
  index: number,
): PosterDishModification | undefined {
  const matched = modifications.find((mod) => modifierMatchesTemplate(mod, templateId));
  if (matched) return matched;
  return modifications[index];
}

export function isKebabPitaPosterProduct(product: PosterProduct): boolean {
  const key = (product.product_name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return key === "kebabpita";
}

export function enrichKebabPitaItemFromPoster(
  local: LocalFoodCatalogItem,
  product: PosterProduct,
  item: KebabPitaMenuItem,
): KebabPitaMenuItem {
  if (local.id !== "pork-kebab-pita" && local.id !== "chicken-kebab-pita") return item;

  const templateId = local.id === "chicken-kebab-pita" ? "chicken" : "pork";
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

export function mapKebabPitaPosterProduct(
  product: PosterProduct,
  catalog: LocalFoodCatalogItem[],
): Array<{ local: LocalFoodCatalogItem; item: KebabPitaMenuItem }> {
  if (!isKebabPitaPosterProduct(product)) return [];

  return catalog
    .filter((local): local is LocalFoodCatalogItem & { id: KebabPitaLocalId } =>
      KEBAB_PITA_LOCAL_IDS.includes(local.id as KebabPitaLocalId),
    )
    .map((local) => {
      const base: KebabPitaMenuItem = {
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
        item: enrichKebabPitaItemFromPoster(local, product, base),
      };
    });
}
