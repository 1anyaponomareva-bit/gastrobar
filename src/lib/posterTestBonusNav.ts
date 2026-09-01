import type { BarCategoryId } from "@/components/CategoryTabs";
import { getListNavForProductId } from "@/lib/bonusProductNav";
import { isGastrofoodSnackProductId } from "@/lib/gastrofoodNav";
import type { MenuPeriod } from "@/lib/utils";
import {
  isPosterTestPath,
  POSTER_TEST_BAR_PATH,
  POSTER_TEST_FOOD_PATH,
} from "@/lib/posterTestRoutes";

const BAR_CATEGORY_IDS: readonly BarCategoryId[] = [
  "all",
  "cocktail",
  "wine",
  "beer",
  "tincture",
  "spirits",
  "soft",
  "snacks",
];

function isBarCategoryId(value: string): value is BarCategoryId {
  return (BAR_CATEGORY_IDS as readonly string[]).includes(value);
}

export function isPosterTestBonusNavigation(): boolean {
  if (typeof window === "undefined") return false;
  return isPosterTestPath(window.location.pathname);
}

export function posterTestFoodSectionPath(section: string): string {
  return `${POSTER_TEST_FOOD_PATH}?section=${encodeURIComponent(section)}`;
}

export function posterTestBarCategoryPath(category: BarCategoryId): string {
  if (category === "snacks") return posterTestFoodSectionPath("snacks");
  return `${POSTER_TEST_BAR_PATH}?category=${encodeURIComponent(category)}`;
}

export function navigatePosterTestBonusCategory(navBarCategory: BarCategoryId): void {
  if (typeof window === "undefined") return;
  window.location.assign(posterTestBarCategoryPath(navBarCategory));
}

export function navigatePosterTestBonusProduct(period: MenuPeriod, productId: string): void {
  if (typeof window === "undefined") return;

  if (isGastrofoodSnackProductId(productId)) {
    window.location.assign(posterTestFoodSectionPath("snacks"));
    return;
  }

  const nav = getListNavForProductId(productId);
  if (nav) {
    window.location.assign(posterTestBarCategoryPath(nav.categoryTab));
    return;
  }

  window.location.assign(POSTER_TEST_BAR_PATH);
}

export function readPosterTestBarCategoryFromLocation(): BarCategoryId | null {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith(POSTER_TEST_BAR_PATH)) return null;
  const category = new URLSearchParams(window.location.search).get("category");
  if (!category || !isBarCategoryId(category) || category === "snacks") return null;
  return category;
}

export function readPosterTestFoodSectionFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith(POSTER_TEST_FOOD_PATH)) return null;
  return new URLSearchParams(window.location.search).get("section");
}
