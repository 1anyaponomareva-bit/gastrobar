import { readStoredAppLang, translate } from "@/lib/i18n";

const NETWORK_RE =
  /Failed to fetch|Load failed|TypeError:\s*Failed|fetch failed|getaddrinfo|NetworkError|ERR_NETWORK|ERR_INTERNET|ECONN(REFUSED|RESET)?|ENOTFOUND|ETIMEDOUT|timeout|aborted|Network request failed|PROXY_FETCH|NETWORK_UNAVAILABLE/i;

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
 * Сообщение баннера, когда online недоступен (сеть/конфиг) — с учётом языка в localStorage.
 */
export function durakOnlineUnavailableMessage(): string {
  return translate(readStoredAppLang(), "durak_online_unavailable");
}

/**
 * Краткий текст вместо «TypeError: Failed to fetch» в UI (error boundary).
 */
export function formatErrorForUserBoundary(err: Error): string {
  const lang = readStoredAppLang();
  if (isLikelyNetworkOrFetchError(err)) {
    return translate(lang, "error_network");
  }
  return err.message && !/^TypeError:\s*Failed to fetch/i.test(err.message)
    ? err.message
    : translate(lang, "error_generic");
}

/**
 * Соединение/сбой fetch → человекочитаемая строка; иначе `null`.
 */
export function userFacingNetworkMessage(err: unknown): string | null {
  if (isLikelyNetworkOrFetchError(err)) {
    return translate(readStoredAppLang(), "error_network2");
  }
  return null;
}
