import shiftChecklistStringsEn from "@/data/shiftChecklistStringsEn.json";
import shiftChecklistStringsVn from "@/data/shiftChecklistStringsVn.json";
import type { AppLang } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

export type CheckAppLang = "ru" | "en" | "vn";

export function toCheckAppLang(lang: AppLang): CheckAppLang {
  if (lang === "ru") return "ru";
  if (lang === "vn") return "vn";
  return "en";
}

export function translateChecklistText(
  lang: CheckAppLang,
  source: string,
): string {
  if (lang === "ru") return source;
  if (lang === "vn") {
    return (
      shiftChecklistStringsVn[source as keyof typeof shiftChecklistStringsVn] ??
      source
    );
  }
  return (
    shiftChecklistStringsEn[source as keyof typeof shiftChecklistStringsEn] ??
    source
  );
}

/** PDF export is always English, regardless of UI language. */
export function translateChecklistTextForPdf(source: string): string {
  return (
    shiftChecklistStringsEn[source as keyof typeof shiftChecklistStringsEn] ??
    source
  );
}

export function getCheckSectionTabLabel(
  lang: CheckAppLang,
  sectionTitle: string,
): string {
  if (sectionTitle.startsWith("Открытие")) {
    return translate(lang, "check_tab_opening");
  }
  if (sectionTitle.startsWith("Контроль")) {
    return translate(lang, "check_tab_control");
  }
  if (sectionTitle.startsWith("Закрытие")) {
    return translate(lang, "check_tab_closing");
  }
  if (sectionTitle.length <= 18) {
    return translateChecklistText(lang, sectionTitle);
  }
  const word = sectionTitle.split(/\s+/)[0];
  return word
    ? translateChecklistText(lang, word)
    : translateChecklistText(lang, sectionTitle);
}

/** Opening / Control / Closing sections support bulk “all done”. */
export function supportsMarkAllDone(sectionTitle: string): boolean {
  return (
    sectionTitle.startsWith("Открытие") ||
    sectionTitle.startsWith("Контроль") ||
    sectionTitle.startsWith("Закрытие")
  );
}
