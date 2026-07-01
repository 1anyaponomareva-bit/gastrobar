import { getPosterMenuForVenue } from "./menuService";
import type { HotDogSausageOption, PosterBarMenuItem, PosterFoodMenuItem } from "./mapProducts";

export type PosterOrderCatalogEntry = {
  id: string;
  name: string;
  posterProductId: string;
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sausageOptions?: HotDogSausageOption[];
};

/** Unified bar + food catalog for a single website incoming order. */
export async function getPosterOrderCatalog(): Promise<Map<string, PosterOrderCatalogEntry>> {
  const [foodMenu, barMenu] = await Promise.all([
    getPosterMenuForVenue("food"),
    getPosterMenuForVenue("bar"),
  ]);

  if (!foodMenu.success && !barMenu.success) {
    throw new Error(
      foodMenu.errorText ?? barMenu.errorText ?? "Не удалось получить актуальное меню Poster.",
    );
  }

  const catalog = new Map<string, PosterOrderCatalogEntry>();

  for (const item of foodMenu.items as PosterFoodMenuItem[]) {
    catalog.set(item.id, {
      id: item.id,
      name: item.name,
      posterProductId: item.posterProductId,
      price: item.price,
      priceMin: item.priceMin,
      priceMax: item.priceMax,
      sausageOptions: item.sausageOptions,
    });
  }

  for (const item of barMenu.items as PosterBarMenuItem[]) {
    catalog.set(item.id, {
      id: item.id,
      name: item.name,
      posterProductId: item.posterProductId,
      price: Number(item.price) || null,
    });
  }

  return catalog;
}
