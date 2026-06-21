"use client";

import { useRef } from "react";
import type { BarSubcategory } from "@/data/menu";
import {
  CATEGORY_TABS_ROW_CLASS,
  CATEGORY_TABS_SHELL_CLASS,
  categoryTabButtonClass,
} from "@/lib/appShellLayout";
import { useHorizontalScrollOnWheel } from "@/lib/useHorizontalScrollOnWheel";
import { useTranslation } from "@/lib/useTranslation";

const BAR_TAB_IDS: ("all" | BarSubcategory)[] = [
  "all",
  "cocktail",
  "wine",
  "beer",
  "tincture",
  "spirits",
  "soft",
];

const BAR_TAB_KEYS: Record<"all" | BarSubcategory, string> = {
  all: "cat_all",
  cocktail: "cat_cocktail",
  wine: "cat_wine",
  beer: "cat_beer",
  tincture: "cat_tincture",
  spirits: "cat_spirits",
  soft: "cat_soft",
};

export type BarCategoryId = "all" | BarSubcategory | "snacks";

export function CategoryTabs({
  value,
  onChange,
}: {
  value: BarCategoryId;
  onChange: (id: BarCategoryId) => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScrollOnWheel(scrollRef);

  return (
    <div ref={scrollRef} className={CATEGORY_TABS_SHELL_CLASS}>
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
