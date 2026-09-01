/** Включить сброс колеса для проверки UI poster-test. */
export function isPosterTestWheelTestMode(): boolean {
  return process.env.POSTER_TEST_WHEEL_TEST_MODE === "true";
}
