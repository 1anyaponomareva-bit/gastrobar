"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GastrofoodFavicon } from "@/components/GastrofoodFavicon";
import { getSession } from "@/lib/orders/api";
import { ORDERS_LANGS, ordersT, readOrdersLang, writeOrdersLang, type OrdersLang } from "@/lib/orders/i18n";
import "./orders.css";

type OrdersContextValue = {
  email: string;
  erpAdmin: boolean;
  publicAccess: boolean;
  displayName: string | null;
  lang: OrdersLang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: OrdersLang) => void;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders(): OrdersContextValue {
  const value = useContext(OrdersContext);
  if (!value) throw new Error("useOrders outside OrdersShell");
  return value;
}

function isOrdersTab(pathname: string | null): "list" | "orders" | "prep" {
  const path = pathname ?? "/orders";
  if (path === "/orders" || path === "/orders/" || path.startsWith("/orders/suppliers")) return "list";
  if (path.startsWith("/orders/prep-stock")) return "prep";
  return "orders";
}

export function OrdersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLangState] = useState<OrdersLang>("ru");
  const [email, setEmail] = useState("");
  const [erpAdmin, setErpAdmin] = useState(false);
  const [publicAccess, setPublicAccess] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => ordersT(lang, key, vars), [lang]);

  useEffect(() => {
    setLangState(readOrdersLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "vn" ? "vi" : lang;
  }, [lang]);

  // Do not block first paint on session — kitchen/public UI must open immediately.
  useEffect(() => {
    void getSession()
      .then((session) => {
        setEmail(session.email);
        setErpAdmin(session.erpAdmin);
        setPublicAccess(session.public);
        setDisplayName(session.name);
      })
      .catch(() => {
        setPublicAccess(true);
        setDisplayName(null);
      });
  }, []);

  // Warm Order List catalog only on list routes — not on Prep Stock (steals mobile bandwidth).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = pathname ?? "";
    const onList =
      path === "/orders" || path === "/orders/" || path.startsWith("/orders/suppliers");
    if (!onList) return;
    const ctrl = new AbortController();
    void fetch("/api/orders/catalog", { signal: ctrl.signal, credentials: "same-origin" }).catch(() => {});
    return () => ctrl.abort();
  }, [pathname]);

  const setLang = useCallback((next: OrdersLang) => {
    setLangState(next);
    writeOrdersLang(next);
  }, []);

  const ctx = useMemo<OrdersContextValue>(
    () => ({
      email,
      erpAdmin,
      publicAccess,
      displayName,
      lang,
      t,
      setLang,
    }),
    [displayName, email, erpAdmin, lang, publicAccess, setLang, t],
  );

  const tab = isOrdersTab(pathname);
  const adminPath = (pathname ?? "").startsWith("/orders/admin");

  if (adminPath) {
    return (
      <OrdersContext.Provider value={ctx}>
        <GastrofoodFavicon />
        {children}
      </OrdersContext.Provider>
    );
  }

  return (
    <OrdersContext.Provider value={ctx}>
      <GastrofoodFavicon />
      <div className="orders-app">
        <div className="orders-shell">
          <header className="orders-top">
            <div className="orders-topRow">
              <div className="orders-brand">
                {t("app_title")}
                <small>ORDERS</small>
              </div>
              <div className="orders-lang" role="group" aria-label="Language">
                {ORDERS_LANGS.map((item) => (
                  <button key={item.code} type="button" className={item.code === lang ? "active" : ""} onClick={() => setLang(item.code)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="orders-topMeta">
              <Link href="/orders/admin" className="orders-adminLink">
                {t("admin_link")}
              </Link>
            </div>
          </header>
          <div className="orders-main">
            <nav className="orders-tabs orders-tabs3" aria-label="Sections">
              <Link href="/orders" className={tab === "list" ? "active" : ""}>
                {t("order_list")}
              </Link>
              <Link href="/orders/history" className={tab === "orders" ? "active" : ""}>
                {t("orders_section")}
              </Link>
              <Link href="/orders/prep-stock" className={tab === "prep" ? "active" : ""}>
                {t("prep_stock")}
              </Link>
            </nav>
            <div className="orders-stage">{children}</div>
          </div>
        </div>
      </div>
    </OrdersContext.Provider>
  );
}
