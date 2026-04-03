/** Ключ localStorage: последняя онлайн-комната дурака (rejoin после refresh). */
export const DURAK_ACTIVE_ROOM_LS_KEY = "durak_active_online_room_id";

export function clearDurakActiveRoomFromStorage(): void {
  try {
    localStorage.removeItem(DURAK_ACTIVE_ROOM_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function readDurakActiveRoomFromStorage(): string | null {
  try {
    const v = localStorage.getItem(DURAK_ACTIVE_ROOM_LS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
