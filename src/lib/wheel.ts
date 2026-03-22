/**
 * Колесо в попапе: 12 секторов (30°), как на public/koleso.png.
 * Кнопка справа — fab-wheel-reference.png (другой файл).
 * Порядок по часовой от 12:00 (сектор 0 по центру вверху).
 */

import {
  createBonus,
  clearCurrentBonus,
  type Bonus,
  type BonusType,
} from "@/services/bonusService";

export const IS_TEST_MODE = true;
export const WHEEL_STORAGE_KEY = "gastrobar_wheel";
export const HAS_PLAYED_BEFORE_KEY = "hasPlayedBefore";

const WIN_EXPIRY_MIN = 120;

export type WheelSegmentKind = "discount" | "product" | "other";

export type WheelSegmentIconKey =
  | "cocktail"
  | "beer"
  | "shot"
  | "squid"
  | "nut"
  | "meat"
  | "gift"
  | "refresh"
  | "miss";

export type WheelSegmentData = {
  id: string;
  kind: WheelSegmentKind;
  line1: string;
  line2?: string;
  icon?: WheelSegmentIconKey;
  productId?: string;
};

/**
 * 12 секторов (30°), порядок по часовой от верха (koleso.png):
 * 0 Сегодня без бонуса → 1 −10% → 2 Б-52 → 3 −10% → 4 Sapporo → 5–6 Б-52 →
 * 7 кальмар → 8–9 джерки → 10 мимо → 11 без бонуса
 */
export const WHEEL_SEGMENTS: readonly WheelSegmentData[] = [
  { id: "no_bonus_smile", kind: "other", line1: "СЕГОДНЯ БЕЗ БОНУСА" },
  {
    id: "disc10_a",
    kind: "discount",
    line1: "−10%",
    line2: "на коктейль",
    icon: "cocktail",
    productId: "whisky-sour",
  },
  {
    id: "b52_a",
    kind: "product",
    line1: "Б-52",
    icon: "shot",
    productId: "b52",
  },
  {
    id: "disc10_b",
    kind: "discount",
    line1: "−10%",
    line2: "на коктейль",
    icon: "cocktail",
    productId: "whisky-sour",
  },
  {
    id: "beer_sapporo",
    kind: "product",
    line1: "SAPPORO",
    icon: "beer",
    productId: "beer-light",
  },
  {
    id: "b52_b",
    kind: "product",
    line1: "Б-52",
    icon: "shot",
    productId: "b52",
  },
  {
    id: "b52_c",
    kind: "product",
    line1: "Б-52",
    icon: "shot",
    productId: "b52",
  },
  {
    id: "snack_squid",
    kind: "product",
    line1: "КАЛЬМАР",
    icon: "squid",
    productId: "dried-squid",
  },
  {
    id: "snack_jerky_a",
    kind: "product",
    line1: "ДЖЕРКИ",
    icon: "meat",
    productId: "chicken-jerky",
  },
  {
    id: "snack_jerky_b",
    kind: "product",
    line1: "ДЖЕРКИ",
    icon: "meat",
    productId: "chicken-jerky",
  },
  { id: "mimo_miss", kind: "other", line1: "В ЭТОТ РАЗ МИМО" },
  { id: "no_bonus_plain", kind: "other", line1: "СЕГОДНЯ БЕЗ БОНУСА" },
];

export type WheelSegmentId = (typeof WHEEL_SEGMENTS)[number]["id"];

/**
 * Угол (0° = вверх, по часовой) левой границы сектора 0 на koleso.png.
 * Должен совпадать с порядком подписей в WHEEL_SEGMENTS по часовой от макета.
 * Раньше 345° давал сдвиг на 1 сектор относительно арта → визу «кальмар», текст «Б-52».
 */
export const BONUS_WHEEL_BOUNDARY_START_DEG = 315;

/** Доп. сдвиг стрелки относительно «верха» (редко нужен). */
export const BONUS_WHEEL_POINTER_BIAS_DEG = 0;

export const BONUS_WHEEL_FULL_TURNS = 5;

/**
 * Центр сектора i в координатах картинки (0° = вверх, по часовой).
 */
export function segmentCenterDegrees(
  segmentIndex: number,
  sectorCount: number,
  boundaryStartDeg: number = BONUS_WHEEL_BOUNDARY_START_DEG
): number {
  const seg = 360 / sectorCount;
  return (((boundaryStartDeg + (segmentIndex + 0.5) * seg) % 360) + 360) % 360;
}

export function computeRotationTargetDegrees(
  currentRotationDeg: number,
  segmentIndex: number,
  sectorCount: number,
  fullTurns: number,
  /** Устаревший параметр: оставлен для совместимости; используйте BONUS_WHEEL_BOUNDARY_START_DEG / BONUS_WHEEL_POINTER_BIAS_DEG */
  offsetDeg: number = 0
): number {
  const centerDeg = segmentCenterDegrees(segmentIndex, sectorCount);
  const desiredMod =
    (((360 - centerDeg + offsetDeg + BONUS_WHEEL_POINTER_BIAS_DEG) % 360) + 360) % 360;
  const prevMod = ((currentRotationDeg % 360) + 360) % 360;
  let delta = (desiredMod - prevMod + 360) % 360;
  if (delta === 0) delta = 360;
  const next = currentRotationDeg + fullTurns * 360 + delta;
  /** Целые градусы — меньше дрожания на границе сектора из‑за float */
  return Math.round(next * 1000) / 1000;
}

/**
 * Какой сектор (индекс 0…11) оказался под стрелкой после вращения на rotationDeg (градусы по часовой).
 * Должен совпадать с segmentIndex, для которого считали computeRotationTargetDegrees.
 */
export function segmentIndexFromWheelRotation(
  rotationDeg: number,
  sectorCount: number = 12,
  boundaryStartDeg: number = BONUS_WHEEL_BOUNDARY_START_DEG
): number {
  const seg = 360 / sectorCount;
  const tMod = ((rotationDeg % 360) + 360) % 360;
  const phi = ((360 - tMod) % 360 + 360) % 360;
  const normalized = (phi - boundaryStartDeg + 360) % 360;
  const idx = Math.floor(normalized / seg);
  return Math.min(Math.max(idx, 0), sectorCount - 1);
}

export const WHEEL_SEGMENTS_FIRST = WHEEL_SEGMENTS;
export const WHEEL_SEGMENTS_REGULAR = WHEEL_SEGMENTS;

export type FirstSegmentId = WheelSegmentId;
export type RegularSegmentId = WheelSegmentId;

/** Первый спин: без проигрышей (0, 10, 11 — вес 0) */
const FIRST_WEIGHTS = [
  0,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  0,
  0,
];

const FIRST_SEGMENT_BONUS: BonusType[] = [
  "beer",
  "discount_cocktail_10",
  "free_shot",
  "discount_cocktail_10",
  "beer",
  "free_shot",
  "free_shot",
  "snack_squid",
  "snack_free",
  "snack_free",
  "beer",
  "beer",
];

/** Обычный спин: равная вероятность каждого сектора */
const REGULAR_WEIGHTS = Array.from({ length: 12 }, () => 1 / 12);

const REGULAR_SEGMENT_BONUS: (BonusType | null)[] = [
  null,
  "discount_cocktail_10",
  "free_shot",
  "discount_cocktail_10",
  "beer",
  "free_shot",
  "free_shot",
  "snack_squid",
  "snack_free",
  "snack_free",
  null,
  null,
];

export type SpinOutcome = {
  segmentIndex: number;
  segmentId: FirstSegmentId | RegularSegmentId;
  bonusType: BonusType | null;
  isLoss: boolean;
  isFirstWheel: boolean;
};

/**
 * Итог спина всегда совпадает с тем, что выбрала `computeSpinOutcome` и куда
 * целится анимация (`computeRotationTargetDegrees`). Раньше здесь пересчитывали
 * сектор по углу остановки — из‑за пограничных градусов индекс сдвигался на 1
 * (например «без бонуса» → −10% на коктейль). Угол нужен только для визуала.
 */
export function reconcileOutcomeWithRotation(
  outcome: SpinOutcome,
  finalRotationDeg: number
): SpinOutcome {
  void finalRotationDeg;
  return outcome;
}

export function getWheelSegments(isFirstWheel: boolean): readonly WheelSegmentData[] {
  void isFirstWheel;
  return WHEEL_SEGMENTS;
}

export function getSectorCount(isFirstWheel: boolean): number {
  void isFirstWheel;
  return WHEEL_SEGMENTS.length;
}

export function hasPlayedWheelBefore(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(HAS_PLAYED_BEFORE_KEY) === "true";
  } catch {
    return true;
  }
}

function markHasPlayed(): void {
  try {
    localStorage.setItem(HAS_PLAYED_BEFORE_KEY, "true");
  } catch {}
}

export function computeSpinOutcome(): SpinOutcome {
  const played = hasPlayedWheelBefore();

  if (!played) {
    const r = Math.random();
    let cum = 0;
    let idx = WHEEL_SEGMENTS_FIRST.length - 1;
    for (let i = 0; i < FIRST_WEIGHTS.length; i++) {
      cum += FIRST_WEIGHTS[i]!;
      if (r < cum) {
        idx = i;
        break;
      }
    }
    const bonusType = FIRST_SEGMENT_BONUS[idx]!;
    return {
      segmentIndex: idx,
      segmentId: WHEEL_SEGMENTS_FIRST[idx]!.id,
      bonusType,
      isLoss: false,
      isFirstWheel: true,
    };
  }

  const r = Math.random();
  let cum = 0;
  let idx = WHEEL_SEGMENTS_REGULAR.length - 1;
  for (let i = 0; i < REGULAR_WEIGHTS.length; i++) {
    cum += REGULAR_WEIGHTS[i]!;
    if (r < cum) {
      idx = i;
      break;
    }
  }
  const bonusType = REGULAR_SEGMENT_BONUS[idx] ?? null;
  const isLoss = bonusType === null;

  return {
    segmentIndex: idx,
    segmentId: WHEEL_SEGMENTS_REGULAR[idx]!.id,
    bonusType: isLoss ? null : bonusType,
    isLoss,
    isFirstWheel: false,
  };
}

export type WheelStorage = {
  lastSpinAt: number;
};

const SPIN_COOLDOWN_MS = IS_TEST_MODE ? 8000 : 24 * 60 * 60 * 1000;

export function getStorage(): WheelStorage {
  if (typeof window === "undefined") return { lastSpinAt: 0 };
  try {
    const raw = localStorage.getItem(WHEEL_STORAGE_KEY);
    if (!raw) return { lastSpinAt: 0 };
    const data = JSON.parse(raw) as WheelStorage;
    return { lastSpinAt: data.lastSpinAt ?? 0 };
  } catch {
    return { lastSpinAt: 0 };
  }
}

function setStorage(data: WheelStorage): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function canSpin(): boolean {
  const { lastSpinAt } = getStorage();
  return Date.now() - lastSpinAt >= SPIN_COOLDOWN_MS;
}

export function saveSpinOutcome(outcome: SpinOutcome): Bonus | null {
  setStorage({ lastSpinAt: Date.now() });
  markHasPlayed();

  if (outcome.isLoss || !outcome.bonusType) return null;
  const expiresAt = Date.now() + WIN_EXPIRY_MIN * 60 * 1000;
  const segment = WHEEL_SEGMENTS[outcome.segmentIndex];
  const productId = segment && "productId" in segment ? segment.productId : undefined;
  return createBonus(outcome.bonusType, expiresAt, productId);
}

export function resetWheelForTest(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WHEEL_STORAGE_KEY);
    localStorage.removeItem(HAS_PLAYED_BEFORE_KEY);
    clearCurrentBonus();
  } catch {}
}
