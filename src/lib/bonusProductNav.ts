import { MENU_ITEMS } from "@/data/menu";
import type { BarCategoryId, MenuCategoryId } from "@/components/CategoryTabs";

/** Вкладка Бар/Снеки и таб категории для скролла к карточке */
export function getListNavForProductId(productId: string): {
  period: "bar" | "menu";
  categoryTab: BarCategoryId | MenuCategoryId;
} | null {
  const item = MENU_ITEMS.find((i) => i.id === productId);
  if (!item) return null;
  if (item.category === "cocktail") {
    return {
      period: "bar",
      categoryTab: (item.barSubcategory ?? "all") as BarCategoryId,
    };
  }
  if (item.category === "food") {
    return {
      period: "menu",
      categoryTab: (item.menuSubcategory ?? "all") as MenuCategoryId,
    };
  }
  return null;
}
