import { removeActiveBonus } from "@/services/bonusService";
import type { WheelStorageKeys } from "@/lib/wheel";

export function clearPosterTestWheelClientState(options?: {
  activeBonusStorageKey?: string;
  wheelStorageKeys?: WheelStorageKeys;
}): void {
  if (typeof window === "undefined") return;

  removeActiveBonus(options?.activeBonusStorageKey);

  const wheelKeys = options?.wheelStorageKeys;
  if (!wheelKeys) return;

  try {
    localStorage.removeItem(wheelKeys.wheel);
    localStorage.removeItem(wheelKeys.hasPlayed);
  } catch {}
}
