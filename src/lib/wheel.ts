/**
 * Колесо в попапе: 8 секторов (45°), диск — public/koleso.png.
 * Порядок по часовой от верха — как на макете картинки.
 */

import type { BarCategoryId } from "@/components/CategoryTabs";
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

export type WheelSegmentData = {
  id: string;
  kind: WheelSegmentKind;
  line1: string;
};

/**
 * 8 секторов по часовой от верха (koleso.png):
 * 0..7 — строго в этом порядке
 */
/**
 * Индексы 0…7 — доли круга по BONUS_WHEEL_BOUNDARY_START_DEG под макетом диска.
 * «без бонуса» — 1; «мимо» — 5 (на арте без бонуса попадал в угол бывшего «мимо» → плашка путала заголовки).
 * «−50 % на 2-й» — 6; «−50 % на 1-й» — 7.
 */
export const WHEEL_SEGMENTS: readonly WheelSegmentData[] = [
  { id: "disc5_bar", kind: "discount", line1: "-5 % на весь заказ бара" },
  { id: "no_bonus", kind: "other", line1: "без бонуса" },
  { id: "tincture", kind: "product", line1: "Настойки" },
  { id: "snack", kind: "product", line1: "Снеки" },
  { id: "beer", kind: "product", line1: "Пиво" },
  { id: "mimo", kind: "other", line1: "мимо" },
  { id: "disc50_2", kind: "discount", line1: "-50 % на 2 напиток" },
  { id: "disc50_1", kind: "discount", line1: "-50 % на 1 напиток" },
];

export type WheelSegmentId = (typeof WHEEL_SEGMENTS)[number]["id"];

/**
 * Левая граница сектора 0 в градусах (подстройка под арт диска в попапе).
 * Если стрелка останавливается на линии между секторами, а не по центру,
 * сдвиньте на ±(360 / sectorCount / 2), например при 8 секторах: 315 ± 22.5.
 */
export const BONUS_WHEEL_BOUNDARY_START_DEG = 292.5;

export const BONUS_WHEEL_POINTER_BIAS_DEG = 0;

export const BONUS_WHEEL_FULL_TURNS = 5;

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
  offsetDeg: number = 0
): number {
  const centerDeg = segmentCenterDegrees(segmentIndex, sectorCount);
  const desiredMod =
    (((360 - centerDeg + offsetDeg + BONUS_WHEEL_POINTER_BIAS_DEG) % 360) + 360) % 360;
  const prevMod = ((currentRotationDeg % 360) + 360) % 360;
  let delta = (desiredMod - prevMod + 360) % 360;
  if (delta === 0) delta = 360;
  const next = currentRotationDeg + fullTurns * 360 + delta;
  return Math.round(next * 1000) / 1000;
}

export function segmentIndexFromWheelRotation(
  rotationDeg: number,
  sectorCount: number = 8,
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

/**
 * Устаревшие веса (раньше ~50% проигрышей). Сейчас см. `computeSpinOutcome`.
 */
export const SEGMENT_SPIN_WEIGHTS: readonly number[] = [4, 22, 10, 15, 13, 27, 3, 6];

/** Секторы с реальным бонусом (скидка / пиво / снеки / настойки). */
const WIN_SEGMENT_INDICES: readonly number[] = [0, 2, 3, 4, 6, 7];

/** «без бонуса» и «мимо» — оба считаются проигрышем для 50/50. */
const LOSS_SEGMENT_INDICES: readonly number[] = [1, 5];

/** После стольких выигрышей подряд следующий спин (если не «отыгрыш» после проигрыша) — проигрыш. Иначе реально возможны длинные серии только из побед (~1/32 на 5 подряд и т.д.). */
const MAX_CONSECUTIVE_WINS_BEFORE_FORCE_LOSS = 3;

function randomFraction01(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 0x1_0000_0000;
  }
  return Math.random();
}

function pickRandomIndexFrom(candidates: readonly number[]): number {
  return candidates[Math.floor(randomFraction01() * candidates.length)]!;
}

/** Следующий выигрыш не совпадает с последним удачным спином (в т.ч. после «мимо» между ними). */
function winCandidatesExcludingLast(
  lastWinSegmentIndex: number | undefined
): readonly number[] {
  if (
    lastWinSegmentIndex === undefined ||
    !WIN_SEGMENT_INDICES.includes(lastWinSegmentIndex)
  ) {
    return WIN_SEGMENT_INDICES;
  }
  const filtered = WIN_SEGMENT_INDICES.filter((i) => i !== lastWinSegmentIndex);
  return filtered.length > 0 ? filtered : WIN_SEGMENT_INDICES;
}

const REGULAR_SEGMENT_BONUS: (BonusType | null)[] = [
  "wheel_d5_bar",
  null,
  "wheel_tincture",
  "wheel_snack",
  "wheel_beer",
  null,
  "wheel_d50_2",
  "wheel_d50_1",
];

export type SpinOutcome = {
  segmentIndex: number;
  segmentId: FirstSegmentId | RegularSegmentId;
  bonusType: BonusType | null;
  isLoss: boolean;
  isFirstWheel: boolean;
};

/**
 * Итог спина = запланированный RNG + анимация (тот же segmentIndex).
 * Пересчёт по углу отключён: из‑за float / easing индекс по формуле иногда «прыгал»
 * на соседа (напр. −50 % → «без бонуса»).
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
  const { lastSpinWasLoss, lastWinSegmentIndex, consecutiveWinsSinceLoss } = getStorage();
  const winPool = winCandidatesExcludingLast(lastWinSegmentIndex);
  const winStreak = consecutiveWinsSinceLoss ?? 0;

  let idx: number;
  if (lastSpinWasLoss) {
    idx = pickRandomIndexFrom(winPool);
  } else if (winStreak >= MAX_CONSECUTIVE_WINS_BEFORE_FORCE_LOSS) {
    idx = pickRandomIndexFrom(LOSS_SEGMENT_INDICES);
  } else {
    const rollWin = randomFraction01() < 0.5;
    idx = rollWin ? pickRandomIndexFrom(winPool) : pickRandomIndexFrom(LOSS_SEGMENT_INDICES);
  }

  const bonusType = REGULAR_SEGMENT_BONUS[idx] ?? null;
  const isLoss = bonusType === null;

  return {
    segmentIndex: idx,
    segmentId: WHEEL_SEGMENTS[idx]!.id,
    bonusType: isLoss ? null : bonusType,
    isLoss,
    isFirstWheel: !played,
  };
}

export type WheelStorage = {
  lastSpinAt: number;
  /** Предыдущий спин — проигрыш; следующий обязан выпасть с бонусом (не позже 2-го кручения). */
  lastSpinWasLoss?: boolean;
  /** Последний сектор с реальным бонусом; не повторяем при следующем выигрыше. */
  lastWinSegmentIndex?: number;
  /** Сколько выигрышей подряд после последнего проигрыша (для ограничения серии). */
  consecutiveWinsSinceLoss?: number;
};

const SPIN_COOLDOWN_MS = IS_TEST_MODE ? 8000 : 24 * 60 * 60 * 1000;

export function getStorage(): WheelStorage {
  if (typeof window === "undefined") return { lastSpinAt: 0 };
  try {
    const raw = localStorage.getItem(WHEEL_STORAGE_KEY);
    if (!raw) return { lastSpinAt: 0 };
    const data = JSON.parse(raw) as WheelStorage;
    const rawWin = data.lastWinSegmentIndex;
    const lastWinSegmentIndex =
      typeof rawWin === "number" && WIN_SEGMENT_INDICES.includes(rawWin)
        ? rawWin
        : undefined;
    const rawStreak = data.consecutiveWinsSinceLoss;
    const consecutiveWinsSinceLoss =
      typeof rawStreak === "number" && rawStreak >= 0 && Number.isFinite(rawStreak)
        ? Math.floor(rawStreak)
        : undefined;
    return {
      lastSpinAt: data.lastSpinAt ?? 0,
      lastSpinWasLoss: data.lastSpinWasLoss === true,
      lastWinSegmentIndex,
      consecutiveWinsSinceLoss,
    };
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

/** Бонусы «пиво / настойка / снек» — на весь раздел, без привязки к одной карточке */
function segmentProductIdForBonus(_segmentIndex: number): string | null {
  return null;
}

function segmentNavBarCategoryForBonus(segmentIndex: number): BarCategoryId | null {
  if (segmentIndex === 0 || segmentIndex === 6 || segmentIndex === 7) return "all";
  if (segmentIndex === 2) return "tincture";
  if (segmentIndex === 3) return "snacks";
  if (segmentIndex === 4) return "beer";
  return null;
}

export function saveSpinOutcome(outcome: SpinOutcome): Bonus | null {
  const prev = getStorage();
  const prevStreak = prev.consecutiveWinsSinceLoss ?? 0;
  setStorage({
    lastSpinAt: Date.now(),
    lastSpinWasLoss: outcome.isLoss,
    lastWinSegmentIndex: outcome.isLoss
      ? prev.lastWinSegmentIndex
      : outcome.segmentIndex,
    consecutiveWinsSinceLoss: outcome.isLoss ? 0 : prevStreak + 1,
  });
  markHasPlayed();

  if (outcome.isLoss || !outcome.bonusType) return null;
  const expiresAt = Date.now() + WIN_EXPIRY_MIN * 60 * 1000;
  const productId = segmentProductIdForBonus(outcome.segmentIndex);
  const navBarCategory = segmentNavBarCategoryForBonus(outcome.segmentIndex);
  return createBonus(outcome.bonusType, expiresAt, productId, navBarCategory);
}

export function resetWheelForTest(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WHEEL_STORAGE_KEY);
    localStorage.removeItem(HAS_PLAYED_BEFORE_KEY);
    clearCurrentBonus();
  } catch {
    /* ignore */
  }
}
