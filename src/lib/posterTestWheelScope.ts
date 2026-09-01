import { HAS_PLAYED_BEFORE_KEY, WHEEL_STORAGE_KEY } from "@/lib/wheel";
import type { WheelStorageKeys } from "@/lib/wheel";

const ACTIVE_BONUS_KEY = "activeBonus";

export type PosterTestWheelScope = {
  wheelStorageKeys: WheelStorageKeys;
  activeBonusStorageKey: string;
};

export function getPosterTestWheelScope(userId: string): PosterTestWheelScope {
  const suffix = `_pt_${userId}`;
  return {
    wheelStorageKeys: {
      wheel: `${WHEEL_STORAGE_KEY}${suffix}`,
      hasPlayed: `${HAS_PLAYED_BEFORE_KEY}${suffix}`,
    },
    activeBonusStorageKey: `${ACTIVE_BONUS_KEY}${suffix}`,
  };
}

export function posterTestUserCanSpinWheel(user: {
  email: string | null;
} | null): boolean {
  return Boolean(user?.email?.trim());
}
