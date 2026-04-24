"use client";

import type { BarSubcategory } from "@/data/menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/useTranslation";

const BAR_TAB_IDS: ("all" | BarSubcategory)[] = [
  "all",
  "cocktail",
  "wine",
  "beer",
  "tincture",
  "spirits",
  "soft",
  "snacks",
];

const BAR_TAB_KEYS: Record<"all" | BarSubcategory, string> = {
  all: "cat_all",
  cocktail: "cat_cocktail",
  wine: "cat_wine",
  beer: "cat_beer",
  tincture: "cat_tincture",
  spirits: "cat_spirits",
  soft: "cat_soft",
  snacks: "cat_snacks",
};

export type BarCategoryId = "all" | BarSubcategory;

export function CategoryTabs({
  value,
  onChange,
}: {
  value: BarCategoryId;
  onChange: (id: BarCategoryId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5">
      <div className="flex gap-2">
        {BAR_TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              value === id
                ? "bg-white text-black"
                : "bg-white/12 text-white/90 hover:bg-white/20"
            )}
          >
            {t(BAR_TAB_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
