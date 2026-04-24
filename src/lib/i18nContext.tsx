"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { type AppLang, nextAppLang, translate } from "./i18n";
import { getI18nLang, initI18nLangFromStorage, setI18nLang, subscribeI18nLang } from "./i18nLangStore";

const SERVER_SNAPSHOT: AppLang = "ru";

function I18nDocumentLang() {
  const lang = useSyncExternalStore(subscribeI18nLang, getI18nLang, () => SERVER_SNAPSHOT);
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const docLang: string = lang === "vn" ? "vi" : lang;
    document.documentElement.setAttribute("lang", docLang);
  }, [lang]);
  return null;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    initI18nLangFromStorage();
  }, []);

  return (
    <>
      <I18nDocumentLang />
      {children}
    </>
  );
}

export function useTranslation() {
  const lang = useSyncExternalStore(subscribeI18nLang, getI18nLang, () => SERVER_SNAPSHOT);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const changeLang = useCallback((newLang: AppLang) => {
    setI18nLang(newLang);
  }, []);

  const cycleLang = useCallback(() => {
    setI18nLang(nextAppLang(getI18nLang()));
  }, []);

  return { lang, t, changeLang, cycleLang };
}
