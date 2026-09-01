import type { LocalFoodCatalogItem } from "./foodMenuCatalog";
import { KEBAB_PITA_TEMPLATES } from "./foodPitaConfig";
import type { HotDogSausageOption } from "./hotDogModifiers";
import { extractPosterPrice } from "./posterPrice";
import type { PosterDishModification, PosterGroupModification, PosterProduct } from "./types";

export type EnrichedKebabPitaFields = {
  sausageOptions?: HotDogSausageOption[];
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

function normalizeModifierAddon(raw: number | string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function findKebabGroup(product: PosterProduct): PosterGroupModification | null {
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

function findModificationForTemplate(
  modifications: PosterDishModification[],
  templateId: string,
  index: number,
): PosterDishModification | undefined {
  const matched = modifications.find((mod) => modifierMatchesTemplate(mod, templateId));
  if (matched) return matched;
  return modifications[index];
}

function buildKebabOptions(
  basePrice: number,
  modifications: PosterDishModification[],
): HotDogSausageOption[] {
  return KEBAB_PITA_TEMPLATES.map((template, index) => {
    const modification = findModificationForTemplate(modifications, template.id, index);
    const addon = modification ? normalizeModifierAddon(modification.price) : index === 1 ? 10000 : 0;
    return {
      id: template.id,
      label: template.label,
      shortLabel: template.shortLabel,
      posterModifierId:
        modification?.dish_modification_id != null
          ? String(modification.dish_modification_id)
          : undefined,
      price: basePrice + addon,
      addon: addon > 0 ? addon : undefined,
    };
  });
}

export function enrichKebabPitaFromPoster(
  local: LocalFoodCatalogItem,
  product: PosterProduct,
  item: EnrichedKebabPitaFields,
): EnrichedKebabPitaFields {
  if (local.id !== "kebab-pita") return item;

  const basePrice = Number(extractPosterPrice(product)) || local.price || 0;
  const kebabGroup = findKebabGroup(product);
  const modifications = kebabGroup?.modifications ?? [];
  const sausageOptions = buildKebabOptions(basePrice, modifications);

  if (sausageOptions.length === 0) {
    return {
      ...item,
      price: basePrice > 0 ? basePrice : item.price,
      priceMin: local.priceMin,
      priceMax: local.priceMax,
    };
  }

  const prices = sausageOptions.map((option) => option.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return {
    ...item,
    sausageOptions,
    price: sausageOptions[0]?.price ?? item.price,
    priceMin: minPrice !== maxPrice ? minPrice : undefined,
    priceMax: minPrice !== maxPrice ? maxPrice : undefined,
  };
}
