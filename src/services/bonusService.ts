/**
 * Сервис бонусов: создание, хранение, погашение, восстановление после reload.
 * Источник истины: localStorage "activeBonus" + проверка expiresAt / redeemed.
 */

import { bonusDisplayDescription, bonusDisplayTitle } from "@/lib/bonusCopy";

export type BonusType =
  | "beer"
  | "free_shot"
  | "second_half"
  | "snack_free"
  | "snack_squid"
  | "snack_peanuts"
  | "two_for_one"
  | "discount_5"
  | "discount_cocktail_10"
  | "discount_cocktail_15"
  | "discount_beer_10"
  | "discount_cocktail_20"
  | "discount_snack_15"
  | "b52_with_cocktail";

export type BonusStatus = "active" | "redeemed" | "expired";

export type Bonus = {
  id: string;
  type: BonusType;
  title: string;
  /** id позиции в меню (MenuItem.id) для перехода "Перейти к позиции" */
  productId: string | null;
  /** Краткое описание для экрана бармену */
  description?: string;
  createdAt: number;
  expiresAt: number;
  redeemed: boolean;
};

const ACTIVE_BONUS_KEY = "activeBonus";

const PREFIX: Record<BonusType, string> = {
  beer: "BEER",
  free_shot: "SHOT",
  snack_free: "SNACK",
  snack_squid: "SQUID",
  snack_peanuts: "PEANUT",
  second_half: "COMBO50",
  two_for_one: "COMBO2F1",
  discount_5: "DISC5",
  discount_cocktail_10: "C10",
  discount_cocktail_15: "C15",
  discount_beer_10: "B10",
  discount_cocktail_20: "C20",
  discount_snack_15: "S15",
  b52_with_cocktail: "B52C",
};

const TITLE_BY_TYPE: Record<BonusType, string> = {
  beer: "",
  free_shot: "",
  second_half: "",
  snack_free: "",
  snack_squid: "",
  snack_peanuts: "",
  two_for_one: "",
  discount_5: "",
  discount_cocktail_10: "",
  discount_cocktail_15: "",
  discount_beer_10: "",
  discount_cocktail_20: "",
  discount_snack_15: "",
  b52_with_cocktail: "",
};

/** id продукта в меню для перехода к позиции */
const DEFAULT_PRODUCT_ID: Record<BonusType, string> = {
  beer: "beer-light",
  free_shot: "b52",
  second_half: "whisky-sour",
  snack_free: "chicken-jerky",
  snack_squid: "dried-squid",
  snack_peanuts: "peanuts",
  two_for_one: "whisky-sour",
  discount_5: "whisky-sour",
  discount_cocktail_10: "whisky-sour",
  discount_cocktail_15: "whisky-sour",
  discount_beer_10: "beer-light",
  discount_cocktail_20: "whisky-sour",
  discount_snack_15: "chicken-jerky",
  b52_with_cocktail: "b52",
};

/** В какой раздел открывать (всё в «Бар») */
export const BONUS_PERIOD: Record<BonusType, "bar"> = {
  beer: "bar",
  free_shot: "bar",
  second_half: "bar",
  snack_free: "bar",
  snack_squid: "bar",
  snack_peanuts: "bar",
  two_for_one: "bar",
  discount_5: "bar",
  discount_cocktail_10: "bar",
  discount_cocktail_15: "bar",
  discount_beer_10: "bar",
  discount_cocktail_20: "bar",
  discount_snack_15: "bar",
  b52_with_cocktail: "bar",
};

const DESCRIPTION_BY_TYPE: Record<BonusType, string> = {
  beer: "",
  free_shot: "",
  second_half: "",
  snack_free: "",
  snack_squid: "",
  snack_peanuts: "",
  two_for_one: "",
  discount_5: "",
  discount_cocktail_10: "",
  discount_cocktail_15: "",
  discount_beer_10: "",
  discount_cocktail_20: "",
  discount_snack_15: "",
  b52_with_cocktail: "",
};

/** Бонус на правило/категорию (скидка, 2-й -50%): не показывать «бесплатно» на карточке, показывать инфо-блок в категории */
export function isCategoryBonus(type: BonusType): boolean {
  return [
    "discount_cocktail_10",
    "discount_cocktail_15",
    "discount_beer_10",
    "discount_cocktail_20",
    "discount_snack_15",
    "discount_5",
    "second_half",
    "two_for_one",
    "b52_with_cocktail",
  ].includes(type);
}

function randomCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateBonusId(type: BonusType): string {
  return `${PREFIX[type]}-${randomCode()}`;
}

/** Бонус истёк по времени */
export function isBonusExpired(bonus: Bonus): boolean {
  return typeof bonus.expiresAt === "number" && Date.now() >= bonus.expiresAt;
}

/** Оставшееся время в формате M:SS (минуты:секунды, без ведущего нуля у минут) */
export function formatRemainingTime(expiresAt: number): string {
  const ms = Math.max(0, expiresAt - Date.now());
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Статус бонуса */
export function getBonusStatus(bonus: Bonus): BonusStatus {
  if (bonus.redeemed) return "redeemed";
  if (isBonusExpired(bonus)) return "expired";
  return "active";
}

// --- Хранилище ---

function readFromStorage(): Bonus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_BONUS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Bonus;
    if (!data || typeof data.expiresAt !== "number") return null;
    if (data.productId === undefined && data.type) data.productId = DEFAULT_PRODUCT_ID[data.type as BonusType] ?? null;
    if (data.type) {
      const t = data.type as BonusType;
      data.title = bonusDisplayTitle(t, data.productId ?? null);
      data.description = bonusDisplayDescription(t, data.productId ?? null);
    }
    return data;
  } catch {
    return null;
  }
}

/** Получить активный бонус (не погашен, не истёк). При истечении — удаляет из localStorage. */
export function getActiveBonus(): Bonus | null {
  const bonus = readFromStorage();
  if (!bonus) return null;
  if (bonus.redeemed) return null;
  if (isBonusExpired(bonus)) {
    removeActiveBonus();
    return null;
  }
  return bonus;
}

/** Сохранить бонус в localStorage (ключ activeBonus). */
export function saveActiveBonus(bonus: Bonus): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_BONUS_KEY, JSON.stringify(bonus));
  } catch {}
}

/** Удалить бонус из localStorage. */
export function removeActiveBonus(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_BONUS_KEY);
  } catch {}
}

/** Текущий сохранённый бонус (для экрана билетика; может быть использован или сгоревший). */
export function getCurrentBonus(): Bonus | null {
  return readFromStorage();
}

/** Описание бонуса (для экрана бармену). */
export function getBonusDescription(type: BonusType, productId?: string | null): string {
  return bonusDisplayDescription(type, productId ?? DEFAULT_PRODUCT_ID[type] ?? null);
}

/** Создать и сохранить бонус. Возвращает созданный бонус. */
export function createBonus(type: BonusType, expiresAt: number, productId?: string | null): Bonus {
  const pid = productId ?? DEFAULT_PRODUCT_ID[type] ?? null;
  const bonus: Bonus = {
    id: generateBonusId(type),
    type,
    title: bonusDisplayTitle(type, pid),
    productId: pid,
    description: bonusDisplayDescription(type, pid),
    createdAt: Date.now(),
    expiresAt,
    redeemed: false,
  };
  saveActiveBonus(bonus);
  return bonus;
}

/** Погасить бонус (бармен). Сохраняет redeemed = true в localStorage. */
export function redeemBonus(id: string): void {
  const bonus = readFromStorage();
  if (!bonus || bonus.id !== id) return;
  saveActiveBonus({ ...bonus, redeemed: true });
}

/** @deprecated Использовать removeActiveBonus */
export function clearCurrentBonus(): void {
  removeActiveBonus();
}
