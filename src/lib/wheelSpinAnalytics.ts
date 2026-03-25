import { getBrowserSupabase } from "@/lib/supabase";
import {
  markFirstSpinAnalyticsCompleted,
  peekIsFirstSpinForAnalytics,
  getOrCreateBrowserUserId,
  getOrCreateSessionId,
  resolveWheelTrafficSource,
} from "@/lib/wheelAnalyticsIdentity";
import { WHEEL_SEGMENTS, type SpinOutcome } from "@/lib/wheel";

/**
 * Включить логи в консоль: NEXT_PUBLIC_SPIN_ANALYTICS_DEBUG=true
 * Убрать: удалите проверки SPIN_ANALYTICS_DEBUG или переменную из .env
 */
export const SPIN_ANALYTICS_DEBUG = process.env.NEXT_PUBLIC_SPIN_ANALYTICS_DEBUG === "true";

function debugLog(payload: Record<string, unknown>): void {
  if (SPIN_ANALYTICS_DEBUG) {
    console.log("[wheel-spin-analytics]", payload);
  }
}

function spinResultLabel(outcome: SpinOutcome): string {
  return WHEEL_SEGMENTS[outcome.segmentIndex]?.line1 ?? outcome.segmentId;
}

/**
 * Запись завершённого спина. Не бросает наружу, не блокирует UI.
 */
export function submitWheelSpinAnalytics(outcome: SpinOutcome): void {
  if (typeof window === "undefined") return;

  const userId = getOrCreateBrowserUserId();
  const sessionId = getOrCreateSessionId();
  const isFirstSpin = peekIsFirstSpinForAnalytics();
  const result = spinResultLabel(outcome);
  const source = resolveWheelTrafficSource();

  const supabase = getBrowserSupabase();
  if (!supabase) {
    debugLog({
      user_id: userId,
      result,
      is_first_spin: isFirstSpin,
      ok: false,
      reason: "supabase_env_missing",
    });
    return;
  }

  if (!userId) {
    debugLog({
      user_id: userId,
      result,
      is_first_spin: isFirstSpin,
      ok: false,
      reason: "user_id_unavailable",
    });
    return;
  }

  const pagePath = (() => {
    try {
      return window.location.pathname + window.location.search;
    } catch {
      return null;
    }
  })();

  const metadata: Record<string, unknown> = {
    segment_index: outcome.segmentIndex,
    segment_id: outcome.segmentId,
    bonus_type: outcome.bonusType,
    is_loss: outcome.isLoss,
    is_first_wheel_in_game: outcome.isFirstWheel,
  };

  void (async () => {
    const { error } = await supabase.from("spins").insert({
      user_id: userId,
      result,
      is_first_spin: isFirstSpin,
      source,
      page_path: pagePath,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      session_id: sessionId || null,
      metadata,
    });

    const ok = !error;

    debugLog({
      user_id: userId,
      result,
      is_first_spin: isFirstSpin,
      ok,
      error: error?.message ?? null,
    });

    if (ok) {
      markFirstSpinAnalyticsCompleted();
    }
  })();
}
