"use client";

import type { HookahFlavorCategory } from "@/data/menu";
import { cn } from "@/lib/utils";

const HOOKAH_TABS: { id: "all" | HookahFlavorCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "sweet", label: "Сладкие" },
  { id: "sour", label: "Кислые" },
  { id: "fresh", label: "Свежие" },
  { id: "herbal", label: "Травянистые" },
];

export type HookahCategoryId = "all" | HookahFlavorCategory;

export function HookahCategoryTabs({
  value,
  onChange,
}: {
  value: HookahCategoryId;
  onChange: (id: HookahCategoryId) => void;
}) {
  return (
    <div className="shrink-0 overflow-x-auto overflow-y-hidden bg-[#030303] px-3 py-2.5">
      <div className="flex gap-2">
        {HOOKAH_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              value === tab.id
                ? "bg-white text-black"
                : "bg-white/12 text-white/90 hover:bg-white/20",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
