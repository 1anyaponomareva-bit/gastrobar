/**
 * Тексты проигрышных секторов колеса («мимо», «без бонуса»).
 * Случайный выбор без повтора — индексы; строки — через i18n (t).
 */

import type { TFn } from "@/lib/bonusCopyI18n";

export type WheelLoseCopyBundle = {
  title: string;
  subtitle: string;
  /** Мелкая серая строка под жёлтой кнопкой (подсказка с напитком). */
  footer: string;
};

const STORAGE_LAST_MIMO = "gastrobar_wheel_lose_mimo_last_ix";
const STORAGE_LAST_NO_BONUS = "gastrobar_wheel_lose_nobonus_last_ix";

export const MIMO_LOSE_COUNT = 5;
export const NOB_LOSE_COUNT = 5;

function readLastIndex(key: string): number {
  if (typeof window === "undefined") return -1;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw == null) return -1;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

function writeLastIndex(key: string, index: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, String(index));
  } catch {
    /* ignore */
  }
}

function pickNonRepeating(length: number, storageKey: string): number {
  if (length <= 0) return 0;
  if (length === 1) return 0;
  const last = readLastIndex(storageKey);
  let idx = Math.floor(Math.random() * length);
  let guard = 0;
  while (idx === last && guard < 32) {
    idx = Math.floor(Math.random() * length);
    guard += 1;
  }
  writeLastIndex(storageKey, idx);
  return idx;
}

export function pickMimoLoseIndex(): number {
  return pickNonRepeating(MIMO_LOSE_COUNT, STORAGE_LAST_MIMO);
}

export function pickNoBonusLoseIndex(): number {
  return pickNonRepeating(NOB_LOSE_COUNT, STORAGE_LAST_NO_BONUS);
}

export function mimoLoseCopyFromT(t: TFn, i: number): WheelLoseCopyBundle {
  const n = Math.max(0, Math.min(i, MIMO_LOSE_COUNT - 1));
  return {
    title: t(`wheel_mimo_${n}_title`),
    subtitle: t(`wheel_mimo_${n}_sub`),
    footer: t(`wheel_mimo_${n}_foot`),
  };
}

export function noBonusLoseCopyFromT(t: TFn, i: number): WheelLoseCopyBundle {
  const n = Math.max(0, Math.min(i, NOB_LOSE_COUNT - 1));
  return {
    title: t(`wheel_nob_${n}_title`),
    subtitle: t(`wheel_nob_${n}_sub`),
    footer: t(`wheel_nob_${n}_foot`),
  };
}
