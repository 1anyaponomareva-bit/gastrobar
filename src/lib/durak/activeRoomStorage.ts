/** Ключ localStorage: последняя онлайн-комната дурака (rejoin после refresh). */
export const DURAK_ACTIVE_ROOM_LS_KEY = "durak_active_online_room_id";

/**
 * sessionStorage: эта вкладка только что была в онлайн-партии (DurakOnlineGame смонтирован).
 * Переживает F5, очищается при закрытии вкладки — в новой вкладке не поднимаем чужой «playing» из LS.
 */
export const DURAK_TAB_RESUME_SESSION_KEY = "durak_tab_online_resume";

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

export function markDurakTabOnlineResume(): void {
  try {
    sessionStorage.setItem(DURAK_TAB_RESUME_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearDurakTabOnlineResume(): void {
  try {
    sessionStorage.removeItem(DURAK_TAB_RESUME_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasDurakTabOnlineResume(): boolean {
  try {
    return sessionStorage.getItem(DURAK_TAB_RESUME_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Полный сброс «вернуться за стол»: LS + метка вкладки. */
export function abandonDurakStoredRoom(): void {
  clearDurakActiveRoomFromStorage();
  clearDurakTabOnlineResume();
}
