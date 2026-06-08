"use client";

import type { HookahFlavorCategory } from "@/data/menu";
import {
  CATEGORY_TABS_ROW_CLASS,
  CATEGORY_TABS_SHELL_CLASS,
  categoryTabButtonClass,
} from "@/lib/appShellLayout";
import { useTranslation } from "@/lib/useTranslation";

const HOOKAH_IDS: ("all" | HookahFlavorCategory)[] = ["all", "sweet", "sour", "fresh", "herbal"];

const HOOKAH_KEYS: Record<"all" | HookahFlavorCategory, string> = {
  all: "cat_all",
  sweet: "hookah_sweet",
  sour: "hookah_sour",
  fresh: "hookah_fresh",
  herbal: "hookah_herbal",
};

export type HookahCategoryId = "all" | HookahFlavorCategory;

export function HookahCategoryTabs({
  value,
  onChange,
}: {
  value: HookahCategoryId;
  onChange: (id: HookahCategoryId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={CATEGORY_TABS_SHELL_CLASS}>
      <div className={CATEGORY_TABS_ROW_CLASS}>
        {HOOKAH_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={categoryTabButtonClass(value === id)}
          >
            {t(HOOKAH_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
