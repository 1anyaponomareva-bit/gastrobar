import { MENU_ITEMS } from "@/data/menu";
import type { BarCategoryId } from "@/components/CategoryTabs";

/** Вкладка Бар и таб категории для скролла к карточке */
export function getListNavForProductId(productId: string): {
  period: "bar";
  categoryTab: BarCategoryId;
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
      period: "bar",
      categoryTab: "snacks",
    };
  }
  return null;
}
