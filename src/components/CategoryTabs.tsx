"use client";

import type { BarSubcategory } from "@/data/menu";
import {
  CATEGORY_TABS_ROW_CLASS,
  CATEGORY_TABS_SHELL_CLASS,
  categoryTabButtonClass,
} from "@/lib/appShellLayout";
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
    <div className={CATEGORY_TABS_SHELL_CLASS}>
      <div className={CATEGORY_TABS_ROW_CLASS}>
        {BAR_TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={categoryTabButtonClass(value === id)}
          >
            {t(BAR_TAB_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
