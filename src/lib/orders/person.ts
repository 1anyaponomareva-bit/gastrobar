import { isKitchenPublicActor } from "./access";

export const PERSON_NAME_MIN = 2;
export const PERSON_NAME_MAX = 80;

export function normalizePersonName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, PERSON_NAME_MAX);
}

function isKitchenPlaceholder(value: string): boolean {
  if (!value) return false;
  if (isKitchenPublicActor(value)) return true;
  const at = value.indexOf("@");
  const local = (at > 0 ? value.slice(0, at) : value).trim().toLowerCase();
  return local === "kitchen";
}

export function isValidPersonName(value: unknown): boolean {
  const name = normalizePersonName(value);
  return name.length >= PERSON_NAME_MIN && !name.includes("@") && !isKitchenPlaceholder(name);
}

/** True when Order would otherwise stamp kitchen@ or an unnamed session. */
export function needsPlaceActorName(actor: {
  public?: boolean;
  email?: string | null;
  name?: string | null;
}): boolean {
  if (isValidPersonName(actor.name)) return false;
  return actor.public === true || isKitchenPublicActor(actor.email) || !isValidPersonName(actor.name);
}

/** Name to store on the order. Null means the public kitchen flow must prompt first. */
export function resolvePlaceDisplayName(input: {
  sessionName?: string | null;
  enteredName?: string | null;
}): string | null {
  const entered = normalizePersonName(input.enteredName);
  if (isValidPersonName(entered)) return entered;
  const session = normalizePersonName(input.sessionName);
  return isValidPersonName(session) ? session : null;
}

/** Prefer a stored display name; never show kitchen@ as «Заказал kitchen». */
export function personLabel(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const name = normalizePersonName(value);
    if (name && !name.includes("@") && !isKitchenPlaceholder(name)) return name;
  }
  for (const value of candidates) {
    const raw = normalizePersonName(value);
    if (isKitchenPlaceholder(raw)) continue;
    const at = raw.indexOf("@");
    if (at > 0) return raw.slice(0, at);
  }
  return "—";
}
