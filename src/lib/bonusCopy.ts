import { MENU_AND_HOOKAH_ITEMS } from "@/data/menu";
import type { BarCategoryId } from "@/components/CategoryTabs";
import type { AppLang } from "@/lib/i18n";
import { readStoredAppLang } from "@/lib/i18n";
import { menuItemDisplayName } from "@/lib/menuItemI18n";

export const BONUS_VALIDITY_HOURS = 2;
export const BONUS_VALIDITY_LABEL = "2 часа";

/** Подмножество полей для отображения (совместимо с BonusType в bonusService). */
export type BonusTypeKey =
  | "beer"
  | "free_shot"
  | "snack_free"
  | "snack_squid"
  | "snack_peanuts"
  | "discount_5"
  | "discount_cocktail_10"
  | "discount_cocktail_15"
  | "discount_beer_10"
  | "second_half"
  | "two_for_one"
  | "discount_cocktail_20"
  | "discount_snack_15"
  | "b52_with_cocktail"
  | "wheel_d50_1"
  | "wheel_d5_bar"
  | "wheel_d50_2"
  | "wheel_beer"
  | "wheel_tincture"
  | "wheel_snack";

export function menuProductName(
  productId: string | null,
  lang: AppLang = readStoredAppLang()
): string | null {
  if (!productId) return null;
  const item = MENU_AND_HOOKAH_ITEMS.find((i) => i.id === productId);
  if (!item) return null;
  return menuItemDisplayName(item, lang);
}

/** Подпись кнопки перехода в раздел бара (колесо / «Мои бонусы»). */
export function barNavigateButtonLabel(
  navBarCategory: BarCategoryId | null | undefined,
  hasProductId: boolean
): string | null {
  if (navBarCategory === "all") return "Перейти в раздел «Все»";
  if (navBarCategory === "beer") return "Перейти в раздел «Пиво»";
  if (navBarCategory === "soft") return "Перейти в раздел «Безалкогольные напитки»";
  if (navBarCategory === "spirits") return "Перейти в раздел «Крепкий алкоголь / шоты»";
  if (navBarCategory === "tincture") return "Перейти в раздел «Настойки»";
  if (navBarCategory === "snacks") return "Перейти в раздел «Снеки»";
  if (hasProductId) return "Перейти к позиции в меню";
  return null;
}

/** Название раздела бара для плашки (как на вкладках). */
export function barSectionDisplayName(categoryId: BarCategoryId): string {
  const m: Record<BarCategoryId, string> = {
    all: "Все",
    cocktail: "Коктейли",
    wine: "Вино",
    beer: "Пиво",
    soft: "Безалкогольные напитки",
    spirits: "Крепкий алкоголь / шоты",
    tincture: "Настойки",
    snacks: "Снеки",
  };
  return m[categoryId];
}

/**
 * Вторая строка плашки «по бонусу колеса» над списком на вкладке.
 * Скидки — формулировка со «скидкой»; подарки по разделу — на все позиции.
 */
export function wheelNavBannerScopeLine(
  type: BonusTypeKey,
  sectionLabel: string
): string {
  if (type === "wheel_d50_1" || type === "wheel_d5_bar" || type === "wheel_d50_2") {
    return `Скидка на раздел «${sectionLabel}»`;
  }
  return `Действует на все позиции раздела «${sectionLabel}»`;
}

/** Показывать ли крупный заголовок бонуса в плашке «по бонусу колеса» (для подарков по разделу он дублирует scope line). */
export function wheelNavBannerShowTitle(type: BonusTypeKey): boolean {
  return (
    type === "wheel_d50_1" || type === "wheel_d5_bar" || type === "wheel_d50_2"
  );
}

/** Короткая подсказка под заголовком бонуса при привязке к вкладке бара. */
export function barNavigateHintLine(
  navBarCategory: BarCategoryId | null | undefined
): string | null {
  if (navBarCategory === "all")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Все» на вкладке «Бар».`;
  if (navBarCategory === "beer")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Пиво».`;
  if (navBarCategory === "soft")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Безалкогольные напитки».`;
  if (navBarCategory === "spirits")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Крепкий алкоголь / шоты».`;
  if (navBarCategory === "tincture")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Настойки».`;
  if (navBarCategory === "snacks")
    return `Действует ${BONUS_VALIDITY_LABEL}. Открой раздел «Снеки».`;
  return null;
}

/** Заголовок бонуса (для колеса — дословно как на сегменте). */
export function bonusDisplayTitle(type: BonusTypeKey, productId: string | null): string {
  const pid = productId ?? null;
  const name = pid ? menuProductName(pid) : null;
  switch (type) {
    case "wheel_d50_1":
      return "-50 % на 1 напиток";
    case "wheel_d5_bar":
      return "-5 % на весь заказ бара";
    case "wheel_d50_2":
      return "-50 % на 2 напиток";
    case "wheel_beer":
      return "Пиво";
    case "wheel_tincture":
      return "Настойка";
    case "wheel_snack":
      return "Снеки";
    case "beer":
      return name
        ? `Ты выиграл(а) ${name}`
        : "Ты выиграл(а) пиво Sapporo";
    case "free_shot":
      return name
        ? `Ты выиграл(а) ${name}`
        : "Ты выиграл(а) коктейль Б-52";
    case "snack_free":
      return name ? `Ты выиграл(а) ${name}` : "Ты выиграл(а) джерки";
    case "snack_squid":
      return name ? `Ты выиграл(а) ${name}` : "Ты выиграл(а) кальмар";
    case "snack_peanuts":
      return name ? `${name} к напитку` : "Арахис к напитку";
    case "discount_5":
      return "Скидка 5% на заказ";
    case "discount_cocktail_10":
      return "Ты выиграл(а) скидку 10% на коктейль";
    case "discount_cocktail_15":
      return "−15% на коктейль";
    case "discount_beer_10":
      return "−10% на пиво";
    case "discount_cocktail_20":
      return "Скидка 20% на коктейль";
    case "discount_snack_15":
      return name ? `Скидка 15% · ${name}` : "Скидка 15% на закуску";
    case "b52_with_cocktail":
      return "Б-52 при заказе коктейля";
    case "second_half":
      return "2-й коктейль −50%";
    case "two_for_one":
      return "2 коктейля по цене 1";
    default:
      return fallbackTitle(type);
  }
}

function fallbackTitle(type: BonusTypeKey): string {
  const m: Partial<Record<BonusTypeKey, string>> = {
    beer: "Ты выиграл(а) пиво Sapporo",
    free_shot: "Ты выиграл(а) коктейль Б-52",
    snack_free: "Ты выиграл(а) джерки",
    snack_squid: "Ты выиграл(а) кальмар",
    snack_peanuts: "Ты выиграл(а) арахис",
  };
  return m[type] ?? "Бонус";
}

export function bonusDisplayDescription(type: BonusTypeKey, productId: string | null): string {
  const name = menuProductName(productId ?? "");
  const hours = BONUS_VALIDITY_LABEL;
  switch (type) {
    case "wheel_d50_1":
    case "wheel_d5_bar":
    case "wheel_d50_2":
      return `Покажи бармену код. Действует ${hours}.`;
    case "wheel_beer":
      return `Покажи бармену код — бонус на весь раздел «Пиво». Действует ${hours}.`;
    case "wheel_tincture":
      return `Покажи бармену код — бонус на весь раздел «Настойки». Действует ${hours}.`;
    case "wheel_snack":
      return `Покажи бармену код — бонус на весь раздел «Снеки». Действует ${hours}.`;
    case "beer":
    case "free_shot":
      return name
        ? `Покажи бармену код — ${name} бесплатно. Действует ${hours}.`
        : `Покажи бармену код. Действует ${hours}.`;
    case "snack_free":
    case "snack_squid":
    case "snack_peanuts":
      return name
        ? `${name} к напитку при заказе. Покажи код бармену. Действует ${hours}.`
        : `Покажи бармену код. Действует ${hours}.`;
    case "discount_5":
      return `Скидка 5% на чек. Покажи код бармену. Действует ${hours}.`;
    case "discount_cocktail_10":
      return `Скидка 10% на любой коктейль. Покажи код бармену. Действует ${hours}.`;
    case "discount_cocktail_15":
      return `Скидка 15% на любой коктейль. Покажи код бармену. Действует ${hours}.`;
    case "discount_beer_10":
      return `Скидка 10% на пиво. Покажи код бармену. Действует ${hours}.`;
    case "discount_cocktail_20":
      return `Скидка 20% на любой коктейль. Покажи код бармену. Действует ${hours}.`;
    case "discount_snack_15":
      return name
        ? `Скидка 15% на закуску (напр. ${name}). Покажи код. ${hours}.`
        : `Скидка 15% на закуску. Покажи код бармену. ${hours}.`;
    case "b52_with_cocktail":
      return `При заказе любого коктейля — Б-52 по акции. Покажи код бармену. ${hours}.`;
    case "second_half":
      return `Второй коктейль со скидкой 50%. Покажи код бармену. Действует ${hours}.`;
    case "two_for_one":
      return `Два коктейля по цене одного. Действует ${hours}.`;
    default:
      return `Действует ${hours}.`;
  }
}
