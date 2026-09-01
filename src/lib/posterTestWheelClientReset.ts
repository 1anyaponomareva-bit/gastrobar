import { removeActiveBonus, saveActiveBonus, type Bonus } from "@/services/bonusService";
import type { WheelStorageKeys } from "@/lib/wheel";

export const POSTER_TEST_WHEEL_BONUS_SYNC_EVENT = "poster-test-wheel-bonus-sync";

function notifyPosterTestWheelBonusSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(POSTER_TEST_WHEEL_BONUS_SYNC_EVENT));
}

/** Синхронизировать активный бонус poster-test: server null → очистить localStorage. */
export function syncPosterTestActiveBonus(
  bonus: Bonus | null,
  activeBonusStorageKey?: string,
): void {
  if (!activeBonusStorageKey) return;
  if (bonus) saveActiveBonus(bonus, activeBonusStorageKey);
  else removeActiveBonus(activeBonusStorageKey);
  notifyPosterTestWheelBonusSync();
}

export function clearPosterTestWheelClientState(options?: {
  activeBonusStorageKey?: string;
  wheelStorageKeys?: WheelStorageKeys;
}): void {
  if (typeof window === "undefined") return;

  removeActiveBonus(options?.activeBonusStorageKey);
  notifyPosterTestWheelBonusSync();

  const wheelKeys = options?.wheelStorageKeys;
  if (!wheelKeys) return;

  try {
    localStorage.removeItem(wheelKeys.wheel);
    localStorage.removeItem(wheelKeys.hasPlayed);
  } catch {}
}
