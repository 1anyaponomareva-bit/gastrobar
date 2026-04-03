/** Быстрая очередь — rejoin после F5 только из этой же вкладки (см. session key). */
export const DURAK_ACTIVE_QUICK_ROOM_LS_KEY = "durak_active_quick_room_id";

/** Стол с друзьями — отдельный ключ, чтобы после дружеской партии не поднимался старый quick-match. */
export const DURAK_ACTIVE_FRIEND_ROOM_LS_KEY = "durak_active_friend_room_id";

/**
 * Старый единый ключ — читаем один раз для миграции, новые записи идут в quick/friend.
 * @deprecated
 */
export const DURAK_ACTIVE_ROOM_LS_KEY = "durak_active_online_room_id";

/**
 * sessionStorage: эта вкладка только что была в онлайн-партии (DurakOnlineGame смонтирован).
 * Переживает F5, очищается при закрытии вкладки — в новой вкладке не поднимаем чужой «playing» из LS.
 */
export const DURAK_TAB_RESUME_SESSION_KEY = "durak_tab_online_resume";

export function clearDurakQuickRoomFromStorage(): void {
  try {
    localStorage.removeItem(DURAK_ACTIVE_QUICK_ROOM_LS_KEY);
    localStorage.removeItem(DURAK_ACTIVE_ROOM_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function clearDurakFriendRoomFromStorage(): void {
  try {
    localStorage.removeItem(DURAK_ACTIVE_FRIEND_ROOM_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** Только legacy-ключ (миграция со старых клиентов). */
export function readDurakLegacyRoomFromStorage(): string | null {
  try {
    const v = localStorage.getItem(DURAK_ACTIVE_ROOM_LS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function readDurakQuickRoomFromStorage(): string | null {
  try {
    const v = localStorage.getItem(DURAK_ACTIVE_QUICK_ROOM_LS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function readDurakFriendRoomFromStorage(): string | null {
  try {
    const v = localStorage.getItem(DURAK_ACTIVE_FRIEND_ROOM_LS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** @deprecated используйте readDurakQuickRoomFromStorage / readDurakFriendRoomFromStorage */
export function readDurakActiveRoomFromStorage(): string | null {
  const f = readDurakFriendRoomFromStorage();
  if (f) return f;
  const q = readDurakQuickRoomFromStorage();
  if (q) return q;
  return readDurakLegacyRoomFromStorage();
}

export function clearDurakActiveRoomFromStorage(): void {
  clearDurakQuickRoomFromStorage();
  clearDurakFriendRoomFromStorage();
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

/** Полный сброс «вернуться за стол»: все ключи комнат + метка вкладки. */
export function abandonDurakStoredRoom(): void {
  clearDurakQuickRoomFromStorage();
  clearDurakFriendRoomFromStorage();
  clearDurakTabOnlineResume();
}
