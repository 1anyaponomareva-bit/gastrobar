"use client";

import type { BarSubcategory } from "@/data/menu";
import { cn } from "@/lib/utils";

const BAR_TABS: { id: "all" | BarSubcategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "cocktail", label: "Коктейли" },
  { id: "wine", label: "Вино" },
  { id: "beer", label: "Пиво" },
  { id: "tincture", label: "Настойки" },
  { id: "spirits", label: "Крепкий алкоголь / шоты" },
  { id: "soft", label: "Безалкогольные напитки" },
  { id: "snacks", label: "Снеки" },
];

export type BarCategoryId = "all" | BarSubcategory;

export function CategoryTabs({
  value,
  onChange,
}: {
  value: BarCategoryId;
  onChange: (id: BarCategoryId) => void;
}) {
  return (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5">
      <div className="flex gap-2">
        {BAR_TABS.map((tab) => (
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
