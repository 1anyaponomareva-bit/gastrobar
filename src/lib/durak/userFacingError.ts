const NETWORK_RE =
  /Failed to fetch|Load failed|TypeError:\s*Failed|fetch failed|getaddrinfo|NetworkError|ERR_NETWORK|ERR_INTERNET|ECONN(REFUSED|RESET)?|ENOTFOUND|ETIMEDOUT|timeout|aborted|Network request failed|PROXY_FETCH|NETWORK_UNAVAILABLE/i;

/** Сообщение для баннера, когда online отключён из‑за сети/конфига. */
export const DURAK_ONLINE_UNAVAILABLE_BANNER =
  "Онлайн-игра временно недоступна. Попробуйте позже.";

export function isLikelyNetworkOrFetchError(err: unknown): boolean {
  const m =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err != null && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : String(err);
  return NETWORK_RE.test(m);
}

/**
 * Краткий текст вместо «TypeError: Failed to fetch» в UI (границы секций, не весь сайт).
 */
export function formatErrorForUserBoundary(err: Error): string {
  if (isLikelyNetworkOrFetchError(err)) {
    return "Не удалось подключиться к серверу. Проверьте сеть или попробуйте позже.";
  }
  return err.message && !/^TypeError:\s*Failed to fetch/i.test(err.message)
    ? err.message
    : "Что-то пошло не так при отображении. Попробуйте снова или обновите страницу.";
}

/**
 * Соединение/сбой fetch → человекочитаемая строка; иначе `null` (дальше обычный разбор).
 */
export function userFacingNetworkMessage(err: unknown): string | null {
  if (isLikelyNetworkOrFetchError(err)) {
    return "Не удалось связаться с сервером. Проверьте сеть и попробуйте позже.";
  }
  return null;
}
