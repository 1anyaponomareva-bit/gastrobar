import type { BarCategoryId } from "@/components/CategoryTabs";
import { menuProductName } from "@/lib/bonusCopy";
import type { BonusTypeKey } from "@/lib/bonusCopy";
import type { AppLang } from "./i18n";

export type TFn = (key: string) => string;

function hoursLabel(t: TFn) {
  return t("bonus_validity_label");
}

export function barSectionDisplayNameT(t: TFn, categoryId: BarCategoryId): string {
  const m: Record<BarCategoryId, string> = {
    all: t("cat_all"),
    cocktail: t("cat_cocktail"),
    wine: t("cat_wine"),
    beer: t("cat_beer"),
    soft: t("cat_soft"),
    spirits: t("cat_spirits"),
    tincture: t("cat_tincture"),
    snacks: t("cat_snacks"),
  };
  return m[categoryId];
}

export function barNavigateButtonLabelT(
  t: TFn,
  navBarCategory: BarCategoryId | null | undefined,
  hasProductId: boolean
): string | null {
  if (navBarCategory === "all") return t("nav_goto_all");
  if (navBarCategory === "beer") return t("nav_goto_beer");
  if (navBarCategory === "soft") return t("nav_goto_soft");
  if (navBarCategory === "spirits") return t("nav_goto_spirits");
  if (navBarCategory === "tincture") return t("nav_goto_tincture");
  if (navBarCategory === "snacks") return t("nav_goto_snacks");
  if (hasProductId) return t("nav_goto_product");
  return null;
}

export function barNavigateHintLineT(
  t: TFn,
  navBarCategory: BarCategoryId | null | undefined
): string | null {
  const h = hoursLabel(t);
  if (navBarCategory === "all")
    return t("bonus_hint_all").replace("{hours}", h);
  if (navBarCategory === "beer")
    return t("bonus_hint_beer").replace("{hours}", h);
  if (navBarCategory === "soft")
    return t("bonus_hint_soft").replace("{hours}", h);
  if (navBarCategory === "spirits")
    return t("bonus_hint_spirits").replace("{hours}", h);
  if (navBarCategory === "tincture")
    return t("bonus_hint_tincture").replace("{hours}", h);
  if (navBarCategory === "snacks")
    return t("bonus_hint_snacks").replace("{hours}", h);
  return null;
}

export function wheelNavBannerScopeLineT(
  t: TFn,
  type: BonusTypeKey,
  sectionLabel: string
): string {
  if (type === "wheel_d50_1" || type === "wheel_d5_bar" || type === "wheel_d50_2") {
    return t("wheel_banner_scope_discount").replace("{section}", sectionLabel);
  }
  return t("wheel_banner_scope_all").replace("{section}", sectionLabel);
}

export function bonusDisplayTitleT(
  t: TFn,
  type: BonusTypeKey,
  productId: string | null,
  lang: AppLang
): string {
  const pid = productId ?? null;
  const name = pid ? menuProductName(pid, lang) : null;
  switch (type) {
    case "wheel_d50_1":
      return t("bonus_title_wheel_d50_1");
    case "wheel_d5_bar":
      return t("bonus_title_wheel_d5_bar");
    case "wheel_d50_2":
      return t("bonus_title_wheel_d50_2");
    case "wheel_beer":
      return t("bonus_title_wheel_beer");
    case "wheel_tincture":
      return t("bonus_title_wheel_tincture");
    case "wheel_snack":
      return t("bonus_title_wheel_snack");
    case "beer":
      return name ? t("bonus_won_name").replace("{name}", name) : t("bonus_title_beer_fb");
    case "free_shot":
      return name ? t("bonus_won_name").replace("{name}", name) : t("bonus_title_shot_fb");
    case "snack_free":
      return name ? t("bonus_won_name").replace("{name}", name) : t("bonus_title_jerky_fb");
    case "snack_squid":
      return name ? t("bonus_won_name").replace("{name}", name) : t("bonus_title_squid_fb");
    case "snack_peanuts":
      return name ? t("bonus_title_peanuts_with").replace("{name}", name) : t("bonus_title_peanuts_fb");
    case "discount_5":
      return t("bonus_title_discount5");
    case "discount_cocktail_10":
      return t("bonus_title_d10");
    case "discount_cocktail_15":
      return t("bonus_title_d15");
    case "discount_beer_10":
      return t("bonus_title_dbeer");
    case "discount_cocktail_20":
      return t("bonus_title_d20");
    case "discount_snack_15":
      return name
        ? t("bonus_title_dsnack_name").replace("{name}", name)
        : t("bonus_title_dsnack_fb");
    case "b52_with_cocktail":
      return t("bonus_title_b52");
    case "second_half":
      return t("bonus_title_second");
    case "two_for_one":
      return t("bonus_title_2for1");
    default:
      return t("bonus_title_fallback");
  }
}

export function bonusDisplayDescriptionT(
  t: TFn,
  type: BonusTypeKey,
  productId: string | null,
  lang: AppLang
): string {
  const name = menuProductName(productId ?? "", lang);
  const h = hoursLabel(t);
  switch (type) {
    case "wheel_d50_1":
    case "wheel_d5_bar":
    case "wheel_d50_2":
      return t("bonus_desc_show_code").replace("{hours}", h);
    case "wheel_beer":
      return t("bonus_desc_wheel_beer").replace("{hours}", h);
    case "wheel_tincture":
      return t("bonus_desc_wheel_tincture").replace("{hours}", h);
    case "wheel_snack":
      return t("bonus_desc_wheel_snack").replace("{hours}", h);
    case "beer":
    case "free_shot":
      return name
        ? t("bonus_desc_item_free").replace("{name}", name).replace("{hours}", h)
        : t("bonus_desc_show_code").replace("{hours}", h);
    case "snack_free":
    case "snack_squid":
    case "snack_peanuts":
      return name
        ? t("bonus_desc_snack_pair").replace("{name}", name).replace("{hours}", h)
        : t("bonus_desc_show_code").replace("{hours}", h);
    case "discount_5":
      return t("bonus_desc_d5").replace("{hours}", h);
    case "discount_cocktail_10":
      return t("bonus_desc_dct10").replace("{hours}", h);
    case "discount_cocktail_15":
      return t("bonus_desc_dct15").replace("{hours}", h);
    case "discount_beer_10":
      return t("bonus_desc_dbeer10").replace("{hours}", h);
    case "discount_cocktail_20":
      return t("bonus_desc_dct20").replace("{hours}", h);
    case "discount_snack_15":
      return name
        ? t("bonus_desc_dsnack_name").replace("{name}", name).replace("{hours}", h)
        : t("bonus_desc_dsnack_fb").replace("{hours}", h);
    case "b52_with_cocktail":
      return t("bonus_desc_b52").replace("{hours}", h);
    case "second_half":
      return t("bonus_desc_second").replace("{hours}", h);
    case "two_for_one":
      return t("bonus_desc_2for1").replace("{hours}", h);
    default:
      return t("bonus_desc_default").replace("{hours}", h);
  }
}
