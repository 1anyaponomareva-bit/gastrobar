import type { Bonus } from "@/services/bonusService";
import { getBonusStatus, isBonusExpired } from "@/services/bonusService";
import { getPosterTestAdminClient } from "@/lib/poster-test-auth/db";
import {
  canSpinFromStorage,
  computeSpinOutcomeFromStorage,
  createBonusFromSpinOutcome,
  getMsUntilNextSpinFromStorage,
  nextWheelStorageAfterSpin,
  normalizeWheelStorage,
  type SpinOutcome,
  type WheelStorage,
} from "@/lib/wheel";

type UserWheelRow = {
  wheel_state: WheelStorage | null;
  wheel_active_bonus: Bonus | null;
};

function parseBonus(raw: unknown): Bonus | null {
  if (!raw || typeof raw !== "object") return null;
  const bonus = raw as Bonus;
  if (!bonus.id || !bonus.type || typeof bonus.expiresAt !== "number") return null;
  if (getBonusStatus(bonus) !== "active") return null;
  return bonus;
}

async function readUserWheelRow(userId: string): Promise<UserWheelRow | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("poster_test_users")
    .select("wheel_state, wheel_active_bonus")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    wheel_state: normalizeWheelStorage(data.wheel_state as WheelStorage | null),
    wheel_active_bonus: parseBonus(data.wheel_active_bonus),
  };
}

export type PosterTestWheelStatus = {
  canSpin: boolean;
  msUntilNextSpin: number;
  activeBonus: Bonus | null;
  playedBefore: boolean;
};

export async function getPosterTestWheelStatus(userId: string): Promise<PosterTestWheelStatus | null> {
  const row = await readUserWheelRow(userId);
  if (!row) return null;

  const wheelState = normalizeWheelStorage(row.wheel_state);
  let activeBonus = row.wheel_active_bonus;
  if (activeBonus && isBonusExpired(activeBonus)) {
    activeBonus = null;
    await clearExpiredBonus(userId);
  }

  return {
    canSpin: canSpinFromStorage(wheelState),
    msUntilNextSpin: getMsUntilNextSpinFromStorage(wheelState),
    activeBonus,
    playedBefore: wheelState.lastSpinAt > 0,
  };
}

async function clearExpiredBonus(userId: string): Promise<void> {
  const client = getPosterTestAdminClient();
  if (!client) return;
  await client
    .from("poster_test_users")
    .update({ wheel_active_bonus: null, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

export type PosterTestWheelSpinResult =
  | {
      ok: true;
      outcome: SpinOutcome;
      bonus: Bonus | null;
      canSpin: false;
      msUntilNextSpin: number;
    }
  | { ok: false; code: "cooldown" | "db_error"; msUntilNextSpin: number };

export async function executePosterTestWheelSpin(
  userId: string,
): Promise<PosterTestWheelSpinResult> {
  const client = getPosterTestAdminClient();
  if (!client) {
    return { ok: false, code: "db_error", msUntilNextSpin: 0 };
  }

  const row = await readUserWheelRow(userId);
  if (!row) {
    return { ok: false, code: "db_error", msUntilNextSpin: 0 };
  }

  const wheelState = normalizeWheelStorage(row.wheel_state);
  const msUntilNextSpin = getMsUntilNextSpinFromStorage(wheelState);
  if (!canSpinFromStorage(wheelState)) {
    return { ok: false, code: "cooldown", msUntilNextSpin };
  }

  const playedBefore = wheelState.lastSpinAt > 0;
  const outcome = computeSpinOutcomeFromStorage(wheelState, playedBefore);
  const nextState = nextWheelStorageAfterSpin(wheelState, outcome);
  const bonus = createBonusFromSpinOutcome(outcome);

  const { error } = await client
    .from("poster_test_users")
    .update({
      wheel_state: nextState,
      wheel_active_bonus: bonus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("[poster-test-wheel] spin save failed:", error);
    return { ok: false, code: "db_error", msUntilNextSpin: 0 };
  }

  return {
    ok: true,
    outcome,
    bonus,
    canSpin: false,
    msUntilNextSpin: getMsUntilNextSpinFromStorage(nextState),
  };
}

export async function redeemPosterTestWheelBonus(userId: string, bonusId: string): Promise<boolean> {
  const client = getPosterTestAdminClient();
  if (!client) return false;

  const row = await readUserWheelRow(userId);
  if (!row?.wheel_active_bonus || row.wheel_active_bonus.id !== bonusId) return false;

  const { error } = await client
    .from("poster_test_users")
    .update({
      wheel_active_bonus: { ...row.wheel_active_bonus, redeemed: true },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return !error;
}

export async function clearPosterTestWheelBonus(userId: string): Promise<void> {
  const client = getPosterTestAdminClient();
  if (!client) return;
  await client
    .from("poster_test_users")
    .update({ wheel_active_bonus: null, updated_at: new Date().toISOString() })
    .eq("id", userId);
}
