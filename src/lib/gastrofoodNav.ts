export const GASTROFOOD_SNACK_IDS = new Set([
  "chicken-jerky",
  "beef-jerky",
  "pistachios",
  "peanuts",
]);

export const GASTROFOOD_SNACKS_PATH = "/food?category=snacks";

export function isGastrofoodSnackProductId(productId: string): boolean {
  return GASTROFOOD_SNACK_IDS.has(productId);
}

export function goToGastrofoodSnacks(): void {
  if (typeof window === "undefined") return;
  window.location.assign(GASTROFOOD_SNACKS_PATH);
}
