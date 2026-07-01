/** Single Poster spot for all website incoming orders (GASTROBAR). */
export function getPosterSpotId(): number {
  const raw = process.env.POSTER_SPOT_ID?.trim();
  if (!raw) {
    throw new Error("POSTER_SPOT_ID is not configured");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("POSTER_SPOT_ID is not configured");
  }
  return parsed;
}
