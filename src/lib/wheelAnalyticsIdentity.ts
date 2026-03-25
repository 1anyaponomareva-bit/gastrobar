/**
 * Локальные идентификаторы для аналитики без регистрации.
 */

const USER_ID_KEY = "gastrobar_analytics_user_id";
const SESSION_ID_KEY = "gastrobar_analytics_session_id";
const FIRST_SPIN_DONE_KEY = "gastrobar_analytics_first_wheel_spin_logged";

export type WheelTrafficSource = "qr" | "direct" | "unknown";

export function getOrCreateBrowserUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/**
 * utm_source=qr или source=qr → qr, иначе direct; при ошибке unknown.
 */
export function resolveWheelTrafficSource(): WheelTrafficSource {
  if (typeof window === "undefined") return "unknown";
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = params.get("utm_source")?.toLowerCase()?.trim();
    const src = params.get("source")?.toLowerCase()?.trim();
    if (utm === "qr" || src === "qr") return "qr";
    return "direct";
  } catch {
    return "unknown";
  }
}

/** Есть ли ещё ни одного успешно отправленного спина в аналитику. */
export function peekIsFirstSpinForAnalytics(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FIRST_SPIN_DONE_KEY) !== "1";
  } catch {
    return false;
  }
}

/** Вызывать только после успешной записи спина в Supabase. */
export function markFirstSpinAnalyticsCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FIRST_SPIN_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}
