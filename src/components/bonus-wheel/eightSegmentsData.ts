/**
 * Финальные 8 секторов колеса (тексты и типы иконок — без изменений).
 * Пока только данные для визуала; бизнес-логика подключается позже.
 */

export type EightSegmentIconVariant =
  | "discount_cocktail_2nd"
  | "cocktail"
  | "beer"
  | "layered_shot"
  | "squid"
  | "jerky"
  | "neutral_soft"
  | "neutral_no_bonus";

export type EightSegmentDef = {
  id: string;
  line1: string;
  line2?: string;
  icon: EightSegmentIconVariant;
};

/** Ровно 8 секторов: 6 выигрышных + 2 проигрышных — порядок фиксирован */
export const EIGHT_SEGMENTS: readonly EightSegmentDef[] = [
  {
    id: "seg_minus50",
    line1: "−50%",
    line2: "2-й коктейль",
    icon: "discount_cocktail_2nd",
  },
  {
    id: "seg_minus10",
    line1: "−10%",
    line2: "на коктейль",
    icon: "cocktail",
  },
  { id: "seg_sapporo", line1: "SAPPORO", icon: "beer" },
  { id: "seg_b52", line1: "Б-52", icon: "layered_shot" },
  { id: "seg_squid", line1: "КАЛЬМАР", icon: "squid" },
  { id: "seg_jerky", line1: "ДЖЕРКИ", icon: "jerky" },
  {
    id: "seg_mimo",
    line1: "В ЭТОТ РАЗ",
    line2: "МИМО 😏",
    icon: "neutral_soft",
  },
  {
    id: "seg_no_bonus",
    line1: "СЕГОДНЯ",
    line2: "БЕЗ БОНУСА 😉",
    icon: "neutral_no_bonus",
  },
];
