"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/useTranslation";

export function I18nDocumentTitle() {
  const { t } = useTranslation();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (pathname === "/" || pathname === "/start") {
      document.title = t("menu_chooser_meta_title");
      return;
    }
    if (pathname === "/staff" || pathname.startsWith("/staff/")) {
      document.title = t("staff_meta_title");
      return;
    }
    if (pathname === "/check" || pathname.startsWith("/check/")) {
      document.title = "Shift Checklist — GASTROBAR";
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
  }, [t, pathname]);

  return null;
}
