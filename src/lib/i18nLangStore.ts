import type { AppLang } from "./i18n";
import { readStoredAppLang, writeStoredAppLang } from "./i18n";

let lang: AppLang = "ru";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getI18nLang(): AppLang {
  return lang;
}

export function setI18nLang(next: AppLang) {
  if (next === lang) return;
  lang = next;
  writeStoredAppLang(next);
  emit();
}

/** Синхронизировать in-memory `lang` с `localStorage` (после гидрации). */
export function initI18nLangFromStorage() {
  setI18nLang(readStoredAppLang());
}

export function subscribeI18nLang(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
