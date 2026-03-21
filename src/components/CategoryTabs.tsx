"use client";

import type { BarSubcategory, MenuSubcategory } from "@/data/menu";
import type { MenuPeriod } from "@/lib/utils";
import { cn } from "@/lib/utils";

const BAR_TABS: { id: "all" | BarSubcategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "cocktail", label: "Коктейли" },
  { id: "wine", label: "Вино" },
  { id: "beer", label: "Пиво" },
  { id: "tincture", label: "Настойки" },
];

const MENU_TABS: { id: "all" | MenuSubcategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "snack", label: "Закуски" },
  { id: "sausage", label: "Сосиски" },
  { id: "dumpling", label: "Пельмени" },
];

export type BarCategoryId = "all" | BarSubcategory;
export type MenuCategoryId = "all" | MenuSubcategory;

export function CategoryTabs({
  period,
  value,
  onChange,
}: {
  period: MenuPeriod;
  value: BarCategoryId | MenuCategoryId;
  onChange: (id: BarCategoryId | MenuCategoryId) => void;
}) {
  const tabs = period === "bar" ? BAR_TABS : MENU_TABS;

  return (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              value === tab.id
                ? "bg-white text-black"
                : "bg-white/12 text-white/90 hover:bg-white/20"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
