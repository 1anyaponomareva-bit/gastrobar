export const PERSON_NAME_MIN = 2;
export const PERSON_NAME_MAX = 80;

export function normalizePersonName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, PERSON_NAME_MAX);
}

export function isValidPersonName(value: unknown): boolean {
  const name = normalizePersonName(value);
  return name.length >= PERSON_NAME_MIN && !name.includes("@");
}

/** Prefer a stored display name; never show a raw email if a local-part fallback exists. */
export function personLabel(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const name = normalizePersonName(value);
    if (name && !name.includes("@")) return name;
  }
  for (const value of candidates) {
    const raw = normalizePersonName(value);
    const at = raw.indexOf("@");
    if (at > 0) return raw.slice(0, at);
  }
  return "—";
}
