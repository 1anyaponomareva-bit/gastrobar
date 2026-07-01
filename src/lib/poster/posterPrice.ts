import type { PosterProduct } from "./types";

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

export function normalizePosterMoney(raw: number | string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / 100);
}
