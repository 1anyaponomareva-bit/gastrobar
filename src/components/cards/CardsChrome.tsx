"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import "./cards.css";

const LANGS = [
  { code: "ru" as const, label: "RU" },
  { code: "en" as const, label: "EN" },
  { code: "vn" as const, label: "VN" },
];

export function CardsChrome({
  badge,
  adminHref,
  adminLabel,
  children,
}: {
  badge: string;
  adminHref?: string;
  adminLabel?: string;
  children: ReactNode;
}) {
  const { lang, changeLang } = useTranslation();
  const staffLang = toStaffAppLang(lang);

  return (
    <div className="cards-app">
      <div className="cards-shell">
        <header className="cards-top">
          <div className="cards-topRow">
            <div className="cards-brand">
              GASTROFOOD
              <small>{badge}</small>
            </div>
            <div className="cards-lang" role="group" aria-label="Language">
              {LANGS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={item.code === staffLang ? "active" : ""}
                  onClick={() => changeLang(item.code)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {adminHref && adminLabel ? (
            <div className="cards-topMeta">
              <Link href={adminHref} className="cards-adminLink">
                {adminLabel}
              </Link>
            </div>
          ) : null}
        </header>
        <div className="cards-main">{children}</div>
      </div>
    </div>
  );
}

export function CardsLoading({ text }: { text: string }) {
  return (
    <div className="cards-app">
      <div className="cards-loading">{text}</div>
    </div>
  );
}
