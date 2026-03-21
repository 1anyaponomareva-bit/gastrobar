import { MENU_ITEMS } from "@/data/menu";

export const BONUS_VALIDITY_HOURS = 2;
export const BONUS_VALIDITY_LABEL = "2 часа";

type BonusTypeKey =
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
  | "b52_with_cocktail";

export function menuProductName(productId: string | null): string | null {
  if (!productId) return null;
  return MENU_ITEMS.find((i) => i.id === productId)?.name ?? null;
}

/** Заголовок бонуса: конкретная позиция или правило */
export function bonusDisplayTitle(type: BonusTypeKey, productId: string | null): string {
  const pid = productId ?? null;
  const name = pid ? menuProductName(pid) : null;
  switch (type) {
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
