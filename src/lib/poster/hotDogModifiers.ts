import type { LocalFoodCatalogItem } from "./foodMenuCatalog";
import { LOCAL_HOT_DOG_CONFIG } from "./foodHotDogConfig";
import { extractPosterPrice } from "./posterPrice";
import type { PosterDishModification, PosterGroupModification, PosterProduct } from "./types";

export type HotDogSausageOption = {
  id: string;
  label: string;
  shortLabel: string;
  price: number;
  grammage?: string;
  posterModifierId?: string;
};

export type EnrichedHotDogFields = {
  hotDogNoSausage?: boolean;
  hotDogPrefix?: boolean;
  sausageOptions?: HotDogSausageOption[];
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  grammage?: string;
};

function findSausageGroup(product: PosterProduct): PosterGroupModification | null {
  const groups = product.group_modifications ?? [];
  for (const group of groups) {
    if (group.is_deleted === 1 || group.is_deleted === "1") continue;
    if (/sausage/i.test(group.name ?? "")) return group;
  }
  return null;
}

function normalizeModifierAddon(raw: number | string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  /** Доплата за сосиску в group_modifications — уже в VND (не ×100 как spots). */
  return Math.round(value);
}

function buildSausageOptions(
  basePrice: number,
  modifications: PosterDishModification[],
  templates: NonNullable<(typeof LOCAL_HOT_DOG_CONFIG)[string]["sausageTemplates"]>,
): HotDogSausageOption[] {
  if (templates.length === 0) return [];
  if (modifications.length === 0 && templates.length <= 2) return [];

  const standardMod = modifications[0];
  const craftMods = modifications.slice(1);
  const craftAddon = craftMods.reduce(
    (max, mod) => Math.max(max, normalizeModifierAddon(mod.price)),
    0,
  );

  if (templates.length === 1) {
    const template = templates[0];
    return [
      {
        id: template.id,
        label: template.label,
        shortLabel: template.shortLabel,
        grammage: template.grammage,
        posterModifierId:
          standardMod.dish_modification_id != null ? String(standardMod.dish_modification_id) : undefined,
        price: basePrice + normalizeModifierAddon(standardMod.price),
      },
    ];
  }

  if (templates.length > 2) {
    return templates.map((template, index) => {
      const modification = modifications[index];
      const fallbackAddon = index === 0 ? 0 : craftAddon || 30000;
      return {
        id: template.id,
        label: template.label,
        shortLabel: template.shortLabel,
        grammage: template.grammage,
        posterModifierId:
          modification?.dish_modification_id != null
            ? String(modification.dish_modification_id)
            : undefined,
        price: basePrice + (modification ? normalizeModifierAddon(modification.price) : fallbackAddon),
      };
    });
  }

  const [standardTemplate, craftTemplate] = templates;
  return [
    {
      id: standardTemplate.id,
      label: standardTemplate.label,
      shortLabel: standardTemplate.shortLabel,
      grammage: standardTemplate.grammage,
      posterModifierId:
        standardMod.dish_modification_id != null ? String(standardMod.dish_modification_id) : undefined,
      price: basePrice + normalizeModifierAddon(standardMod.price),
    },
    {
      id: craftTemplate.id,
      label: craftTemplate.label,
      shortLabel: craftTemplate.shortLabel,
      grammage: craftTemplate.grammage,
      posterModifierId:
        craftMods[0]?.dish_modification_id != null ? String(craftMods[0].dish_modification_id) : undefined,
      price: basePrice + craftAddon,
    },
  ];
}

export function enrichHotDogFromPoster(
  local: LocalFoodCatalogItem,
  product: PosterProduct,
  item: { price: number | null; priceMin?: number | null; priceMax?: number | null; grammage?: string },
): EnrichedHotDogFields {
  const config = LOCAL_HOT_DOG_CONFIG[local.id];
  if (!config || local.category !== "hot-dogs") return item;

  const basePrice = Number(extractPosterPrice(product)) || 0;
  const sausageGroup = findSausageGroup(product);
  const modifications = sausageGroup?.modifications ?? [];

  if (config.hotDogNoSausage) {
    const addon = modifications[0] ? normalizeModifierAddon(modifications[0].price) : 0;
    const total = basePrice + addon;
    return {
      ...item,
      hotDogNoSausage: true,
      hotDogPrefix: config.hotDogPrefix !== false,
      sausageOptions: undefined,
      price: total > 0 ? total : item.price,
      priceMin: undefined,
      priceMax: undefined,
      grammage: local.grammage,
    };
  }

  const templates = config.sausageTemplates;
  if (!templates?.length) {
    return {
      ...item,
      hotDogPrefix: config.hotDogPrefix !== false,
      price: basePrice > 0 ? basePrice : item.price,
    };
  }

  const sausageOptions = buildSausageOptions(basePrice, modifications, templates);
  if (sausageOptions.length === 0) {
    return {
      ...item,
      hotDogPrefix: config.hotDogPrefix !== false,
      priceMin: local.priceMin,
      priceMax: local.priceMax,
    };
  }

  const prices = sausageOptions.map((option) => option.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return {
    ...item,
    hotDogNoSausage: false,
    hotDogPrefix: config.hotDogPrefix !== false,
    sausageOptions,
    price: sausageOptions[0]?.price ?? item.price,
    priceMin: minPrice !== maxPrice ? minPrice : undefined,
    priceMax: minPrice !== maxPrice ? maxPrice : undefined,
    grammage: undefined,
  };
}
