import type { MenuItem } from "@/data/menu";

/** Ключ i18n для бейджа крепости, или `null` если бейдж не показываем. */
export function strengthLabelKey(item: MenuItem): string | null {
  if (item.abv) return null;
  if (!item.strength) return null;
  if (item.category === "hookah") {
    if (item.strength === "weak") return "strength_hookah_light";
    if (item.strength === "medium") return "strength_bar_medium";
    return "strength_hookah_strong";
  }
  if (item.strength === "weak") return "strength_bar_weak";
  if (item.strength === "medium") return "strength_bar_medium";
  return "strength_bar_strong";
}
