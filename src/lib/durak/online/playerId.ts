const LS_KEY = "durak_player_public_id";

export function getOrCreateDurakPlayerId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    let id = localStorage.getItem(LS_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(LS_KEY, id);
    }
    return id;
  } catch {
    return `p-${Date.now()}`;
  }
}
