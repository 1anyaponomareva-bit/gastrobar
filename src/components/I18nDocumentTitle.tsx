"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { translate } from "@/lib/i18n";
import { getStaffTestDefinitionByPath } from "@/data/staffTests";
import { toCheckAppLang } from "@/lib/shiftChecklistI18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { toStaffTestAppLang } from "@/lib/staffTestI18n";
import { useTranslation } from "@/lib/useTranslation";

export function I18nDocumentTitle() {
  const { lang, t } = useTranslation();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (pathname === "/" || pathname === "/start") {
      document.title = t("menu_chooser_meta_title");
      return;
    }
    if (pathname === "/staff" || pathname.startsWith("/staff/")) {
      document.title = translate(toStaffAppLang(lang), "staff_meta_title");
      return;
    }
    if (pathname === "/check" || pathname.startsWith("/check/")) {
      document.title = translate(toCheckAppLang(lang), "check_meta_title");
      return;
    }
    if (pathname === "/test" || pathname.startsWith("/test/")) {
      const definition = getStaffTestDefinitionByPath(pathname);
      if (definition) {
        document.title = translate(toStaffTestAppLang(lang), definition.metaTitleKey);
        return;
      }
      document.title = translate(toStaffTestAppLang(lang), "staff_test_meta_title");
      return;
    }
    if (pathname === "/bar") {
      document.title = t("meta_title_default");
      return;
    }
    if (pathname === "/games") {
      document.title = `${t("games_meta_title")}`;
      return;
    }
    if (pathname === "/durak" || pathname.startsWith("/durak/")) {
      document.title = t("durak_meta_title");
      return;
    }
    document.title = t("meta_title_default");
  }, [t, lang, pathname]);

  return null;
}
