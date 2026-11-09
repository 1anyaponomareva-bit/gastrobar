"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import "@/components/orders/orders.css";
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
    <div className="orders-app">
      <div className="orders-shell">
        <header className="orders-top">
          <div className="orders-topRow">
            <div className="orders-brand">
              GASTROFOOD
              <small>{badge}</small>
            </div>
            <div className="orders-lang" role="group" aria-label="Language">
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
            <div className="orders-topMeta">
              <Link href={adminHref} className="orders-adminLink">
                {adminLabel}
              </Link>
            </div>
          ) : null}
        </header>
        <div className="orders-main cards-app">{children}</div>
      </div>
    </div>
  );
}

export function CardsLoading({ text }: { text: string }) {
  return (
    <div className="orders-app">
      <div className="orders-loading">{text}</div>
    </div>
  );
}
