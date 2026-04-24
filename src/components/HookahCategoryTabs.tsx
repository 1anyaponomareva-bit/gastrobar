"use client";

import type { HookahFlavorCategory } from "@/data/menu";
import { cn } from "@/lib/utils";
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
    <div className="shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5">
      <div className="flex gap-2">
        {HOOKAH_IDS.map((id) => (
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
            {t(HOOKAH_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
