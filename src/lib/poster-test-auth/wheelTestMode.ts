const DEFAULT_WHEEL_TESTER_EMAILS = ["1anyaponomareva@gmail.com"];

function getWheelTesterEmails(): Set<string> {
  const fromEnv =
    process.env.POSTER_TEST_WHEEL_TESTER_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return new Set([...DEFAULT_WHEEL_TESTER_EMAILS, ...fromEnv]);
}

/** Глобальный тестовый режим (все пользователи poster-test). */
export function isPosterTestWheelTestModeEnabled(): boolean {
  return process.env.POSTER_TEST_WHEEL_TEST_MODE === "true";
}

/** Сброс колеса доступен глобально или для email тестировщика. */
export function isPosterTestWheelTestMode(email?: string | null): boolean {
  if (isPosterTestWheelTestModeEnabled()) return true;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return getWheelTesterEmails().has(normalized);
}
