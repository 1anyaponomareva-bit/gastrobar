export type ErpLang = "ru" | "en" | "vn";

export const ERP_LANGS: { code: ErpLang; label: string }[] = [
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
  { code: "vn", label: "VN" },
];

export const LANG_STORAGE_KEY = "gastrofood-erp-lang";

// The shell sets this during render, before any page renders, so plain
// function calls below always see the language of the current render.
let current: ErpLang = "ru";

export const setErpLang = (lang: ErpLang) => {
  current = lang;
};

export const erpLang = () => current;

/** Text in the selected interface language. */
export const T = (ru: string, en: string, vn: string) => (current === "en" ? en : current === "vn" ? vn : ru);

export const locale = () => (current === "en" ? "en-US" : current === "vn" ? "vi-VN" : "ru-RU");

export function readStoredLang(): ErpLang {
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return value === "en" || value === "vn" || value === "ru" ? value : "ru";
  } catch {
    return "ru";
  }
}
