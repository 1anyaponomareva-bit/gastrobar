/** Корень тестовой копии сайта (Poster integration preview). */
export const POSTER_TEST_ROOT = "/poster-test";

export const POSTER_TEST_BAR_PATH = "/poster-test/bar";

export const POSTER_TEST_FOOD_PATH = "/poster-test/food";

export const POSTER_TEST_COMBO_PATH = "/poster-test/food?section=combo";

export const POSTER_TEST_ACCOUNT_PATH = "/poster-test/account";

export const POSTER_TEST_LOGIN_PATH = "/poster-test/login";

export const POSTER_TEST_CHECKOUT_RESUME_KEY = "poster_test_checkout_resume";

export const POSTER_TEST_CHECKOUT_RESUME_QUERY = "resumeCheckout";

export function posterTestUserPath(qrSlug: string): string {
  return `/poster-test/u/${qrSlug}`;
}

export const POSTER_TEST_BANNER_HEIGHT_PX = 0;

export function isPosterTestPath(path: string): boolean {
  return path === POSTER_TEST_ROOT || path.startsWith(`${POSTER_TEST_ROOT}/`);
}
