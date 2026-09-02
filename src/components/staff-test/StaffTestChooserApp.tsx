"use client";

import Link from "next/link";
import { useCallback } from "react";
import { StaffTestLanguageFlags } from "@/components/staff-test/StaffTestLanguageFlags";
import { STAFF_INVENTORY_VENUE_LOGOS } from "@/data/staffInventoryItems";
import { STAFF_TEST_DEFINITIONS } from "@/data/staffTests";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import { toStaffTestAppLang } from "@/lib/staffTestI18n";
import { useTranslation } from "@/lib/useTranslation";
import "../staff/staff-inventory.css";
import "./staff-test.css";

export function StaffTestChooserApp() {
  const { lang } = useTranslation();
  const testLang = toStaffTestAppLang(lang);
  const t = useCallback(
    (key: string) => translate(testLang, key),
    [testLang],
  );

  return (
    <div className="staff-inventory staff-test">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffTestLanguageFlags />
          </div>

          <div className="venueLogo">
            <img
              src={getAssetUrl(STAFF_INVENTORY_VENUE_LOGOS.gastrofood)}
              alt="GastroFood"
            />
          </div>

          <div className="testHeader">
            <h1 className="testTitle">{t("staff_test_chooser_title")}</h1>
            <p className="testSubtitle">{t("staff_test_chooser_subtitle")}</p>
          </div>
        </div>

        <div className="main">
          <div className="testChooserGrid">
            {STAFF_TEST_DEFINITIONS.map((definition) => (
              <Link
                key={definition.id}
                href={definition.path}
                className="testChooserCard"
              >
                <span className="testChooserBadge">
                  {definition.id === "theory"
                    ? t("staff_test_badge_theory")
                    : t("staff_test_badge_practice")}
                </span>
                <span className="testChooserCardTitle">{t(definition.titleKey)}</span>
                <span className="testChooserCardSubtitle">
                  {t(definition.subtitleKey)}
                </span>
                <span className="testChooserMeta">
                  {t("staff_test_chooser_meta")
                    .replace("{count}", String(definition.questions.length))
                    .replace("{pass}", String(definition.passingScore))}
                </span>
                <span className="testChooserCta">{t("staff_test_chooser_start")}</span>
              </Link>
            ))}
          </div>

          <p className="note">{t("staff_test_chooser_note")}</p>
        </div>
      </div>
    </div>
  );
}
