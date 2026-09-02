import type { AppLang } from "@/lib/i18n";

export type StaffTestAppLang = "ru" | "en" | "vn";

export function toStaffTestAppLang(lang: AppLang): StaffTestAppLang {
  if (lang === "ru") return "ru";
  if (lang === "vn") return "vn";
  return "en";
}
