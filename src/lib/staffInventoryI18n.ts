import type { AppLang } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

export type StaffAppLang = "en" | "vn";

/** Staff UI: English and Vietnamese only. Russian from the main site maps to English. */
export function toStaffAppLang(lang: AppLang): StaffAppLang {
  return lang === "vn" ? "vn" : "en";
}

const STAFF_CATEGORY_KEYS: Record<string, string> = {
  All: "staff_cat_all",
  Alcohol: "staff_cat_alcohol",
  "Dairy Products & Eggs": "staff_cat_dairy",
  "Disposable Tableware": "staff_cat_disposable_tableware",
  "Fruits & Vegetables": "staff_cat_fruits_vegetables",
  Pantry: "staff_cat_pantry",
  "Sauces & Syrups": "staff_cat_sauces_syrups",
  "Semi-Finished Products": "staff_cat_semi_finished",
  "Soft Drinks": "staff_cat_soft_drinks",
  Supplies: "staff_cat_supplies",
  Tobacco: "staff_cat_tobacco",
};

export function translateStaffCategory(
  lang: AppLang,
  category: string,
): string {
  const key = STAFF_CATEGORY_KEYS[category];
  if (!key) return category;
  return translate(lang, key);
}

export type StaffInventoryPdfLabels = {
  title: string;
  dateLine: string;
  employeeLine: string;
  itemsLine: string;
  colItem: string;
  colLeft: string;
  colNeeded: string;
  emptyMessage: string;
  categoryLabel: (category: string) => string;
};

export function buildStaffInventoryPdfLabels(
  lang: AppLang,
  venueLabel: string,
  date: string,
  employee: string,
  itemCount: number,
): StaffInventoryPdfLabels {
  const t = (key: string) => translate(lang, key);

  return {
    title: t("staff_pdf_title").replace("{venue}", venueLabel.toUpperCase()),
    dateLine: t("staff_pdf_date").replace("{date}", date || "-"),
    employeeLine: t("staff_pdf_employee").replace(
      "{employee}",
      employee || "-",
    ),
    itemsLine: t("staff_pdf_items").replace("{count}", String(itemCount)),
    colItem: t("staff_pdf_col_item"),
    colLeft: t("staff_pdf_col_left"),
    colNeeded: t("staff_pdf_col_needed"),
    emptyMessage: t("staff_pdf_empty"),
    categoryLabel: (category) => translateStaffCategory(lang, category),
  };
}
