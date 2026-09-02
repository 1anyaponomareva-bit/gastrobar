import type { AppLang } from "@/lib/i18n";
import type { StaffTestOption, StaffTestQuestion } from "@/data/staffTestTypes";

export type StaffTestAppLang = "ru" | "en" | "vn";

export function toStaffTestAppLang(lang: AppLang): StaffTestAppLang {
  if (lang === "ru") return "ru";
  if (lang === "vn") return "vn";
  return "en";
}

export function getStaffTestQuestionPrompt(
  lang: StaffTestAppLang,
  question: StaffTestQuestion,
): string {
  if (lang === "vn") return question.promptVn;
  return question.promptRu;
}

export function getStaffTestOptionText(
  lang: StaffTestAppLang,
  option: StaffTestOption,
): string {
  if (lang === "vn") return option.textVn;
  return option.textRu;
}
